import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Firestore } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';

import { FIRESTORE } from '../infrastructure/firestore.module';
import { PUBSUB } from '../infrastructure/pubsub.module';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollusionTriggerResult {
  examId: string;
  jobsPublished: number;
  triggeredAt: string;
}

export interface CenterJobStatus {
  centerId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  errorMessage: string;
}

export interface CollusionStatusResult {
  examId: string;
  overallStatus: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  totalCenters: number;
  completedCenters: number;
  failedCenters: number;
  centerStatuses: CenterJobStatus[];
}

/** Pub/Sub message payload sent to the collusion-detection-trigger topic. */
interface CollusionJobMessage {
  jobId: string;
  examId: string;
  centerId: string;
  candidateIds: string[];
  sharedQuestionMap: Record<string, string[]>;
  triggeredAt: string;
}

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    @Inject(PUBSUB) private readonly pubsub: PubSub,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // runCollusionDetection
  // ---------------------------------------------------------------------------

  async runCollusionDetection(examId: string): Promise<CollusionTriggerResult> {
    // 1. Validate that the exam exists and is in a suitable state
    const examDoc = await this.firestore.collection('exams').doc(examId).get();

    if (!examDoc.exists) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const allowedStatuses = ['COLLECTING', 'COLLUSION_CHECK', 'ACTIVE'];
    if (!allowedStatuses.includes(examData.status as string)) {
      throw new BadRequestException(
        `Exam ${examId} is in status ${examData.status} — collusion detection requires status in [${allowedStatuses.join(', ')}]`,
      );
    }

    // 2. Load all centers for this exam
    const centersSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('centers')
      .get();

    if (centersSnapshot.empty) {
      throw new BadRequestException(
        `Exam ${examId} has no centers configured`,
      );
    }

    const topicName = this.config.get<string>(
      'pubsub.collusionTriggerTopic',
    )!;
    const topic = this.pubsub.topic(topicName);
    const triggeredAt = new Date().toISOString();

    let jobsPublished = 0;
    const batch = this.firestore.batch();

    // 3. For each center, build the message and publish
    for (const centerDoc of centersSnapshot.docs) {
      const centerId = centerDoc.id;
      const centerData = centerDoc.data();

      // Load candidate IDs assigned to this center
      const candidateIds = await this.loadCandidateIdsForCenter(
        examId,
        centerId,
      );

      if (candidateIds.length === 0) {
        this.logger.warn(
          `Center ${centerId} has no candidates — skipping`,
        );
        continue;
      }

      // Build shared question map: for each candidate pair, determine shared question IDs.
      // The worker does the heavy lifting; here we provide the list of question template IDs
      // per candidate so the worker can determine overlaps.
      const sharedQuestionMap = await this.buildSharedQuestionMap(
        examId,
        centerId,
        candidateIds,
      );

      const jobId = uuidv4();
      const message: CollusionJobMessage = {
        jobId,
        examId,
        centerId,
        candidateIds,
        sharedQuestionMap,
        triggeredAt,
      };

      // Publish to Pub/Sub
      try {
        const messageBuffer = Buffer.from(JSON.stringify(message), 'utf-8');
        await topic.publishMessage({
          data: messageBuffer,
          attributes: {
            examId,
            centerId,
            jobId,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to publish collusion job for center ${centerId}: ${(error as Error).message}`,
        );
        throw new InternalServerErrorException(
          `Failed to publish collusion detection job for center ${centerId}`,
        );
      }

      // 4. Track job status in Firestore: collusionJobs/{examId}/{centerId}
      const jobRef = this.firestore
        .collection('collusionJobs')
        .doc(examId)
        .collection('centers')
        .doc(centerId);

      batch.set(jobRef, {
        jobId,
        examId,
        centerId,
        status: 'queued',
        candidateCount: candidateIds.length,
        triggeredAt,
        startedAt: '',
        completedAt: '',
        errorMessage: '',
      });

      jobsPublished++;
    }

    // 5. Write the parent job document
    const parentJobRef = this.firestore
      .collection('collusionJobs')
      .doc(examId);

    batch.set(
      parentJobRef,
      {
        examId,
        totalCenters: jobsPublished,
        completedCenters: 0,
        failedCenters: 0,
        overallStatus: 'running',
        triggeredAt,
      },
      { merge: true },
    );

    // 6. Update exam status to COLLUSION_CHECK
    const examRef = this.firestore.collection('exams').doc(examId);
    batch.update(examRef, { status: 'COLLUSION_CHECK' });

    await batch.commit();

    this.logger.log(
      `Collusion detection triggered for exam=${examId}: ${jobsPublished} center jobs published`,
    );

    return { examId, jobsPublished, triggeredAt };
  }

  // ---------------------------------------------------------------------------
  // getCollusionStatus
  // ---------------------------------------------------------------------------

  async getCollusionStatus(examId: string): Promise<CollusionStatusResult> {
    // Load the parent job document
    const parentDoc = await this.firestore
      .collection('collusionJobs')
      .doc(examId)
      .get();

    if (!parentDoc.exists) {
      throw new NotFoundException(
        `No collusion job found for exam ${examId}`,
      );
    }

    const parentData = parentDoc.data()!;

    // Load per-center statuses
    const centersSnapshot = await this.firestore
      .collection('collusionJobs')
      .doc(examId)
      .collection('centers')
      .get();

    const centerStatuses: CenterJobStatus[] = [];
    let completedCount = 0;
    let failedCount = 0;

    for (const doc of centersSnapshot.docs) {
      const data = doc.data();
      const status = data.status as string;

      if (status === 'completed') completedCount++;
      if (status === 'failed') failedCount++;

      centerStatuses.push({
        centerId: doc.id,
        status: status as CenterJobStatus['status'],
        startedAt: (data.startedAt as string) || '',
        completedAt: (data.completedAt as string) || '',
        errorMessage: (data.errorMessage as string) || '',
      });
    }

    const totalCenters = centerStatuses.length;

    // Derive overall status
    let overallStatus: CollusionStatusResult['overallStatus'];
    if (completedCount === totalCenters && totalCenters > 0) {
      overallStatus = 'completed';
    } else if (failedCount === totalCenters && totalCenters > 0) {
      overallStatus = 'failed';
    } else if (failedCount > 0 && completedCount > 0) {
      overallStatus = 'partial';
    } else if (completedCount > 0 || centerStatuses.some((c) => c.status === 'running')) {
      overallStatus = 'running';
    } else {
      overallStatus = 'pending';
    }

    return {
      examId,
      overallStatus,
      totalCenters,
      completedCenters: completedCount,
      failedCenters: failedCount,
      centerStatuses,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load all candidate IDs assigned to a specific center for an exam.
   */
  private async loadCandidateIdsForCenter(
    examId: string,
    centerId: string,
  ): Promise<string[]> {
    const candidatesSnapshot = await this.firestore
      .collection('candidates')
      .where('profile.examId', '==', examId)
      .where('profile.centerId', '==', centerId)
      .select('__name__')
      .get();

    return candidatesSnapshot.docs.map((doc) => doc.id);
  }

  /**
   * Build a mapping of candidateId -> list of templateIds assigned to that candidate.
   * The Python worker uses this to determine which questions each pair shares.
   */
  private async buildSharedQuestionMap(
    examId: string,
    centerId: string,
    candidateIds: string[],
  ): Promise<Record<string, string[]>> {
    const questionMap: Record<string, string[]> = {};

    // Load seat assignments for this center
    const seatsSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('centers')
      .doc(centerId)
      .collection('seats')
      .get();

    // Build a mapping of seatNum -> list of templateIds
    const seatToTemplates = new Map<number, string[]>();
    for (const seatDoc of seatsSnapshot.docs) {
      const seatData = seatDoc.data();
      const assignments = seatData.assignment?.questionAssignments as
        | Array<{ templateId: string }>
        | undefined;
      if (assignments) {
        seatToTemplates.set(
          parseInt(seatDoc.id, 10),
          assignments.map((a) => a.templateId),
        );
      }
    }

    // Load candidate -> seat mappings
    for (const candidateId of candidateIds) {
      const candidateDoc = await this.firestore
        .collection('candidates')
        .doc(candidateId)
        .get();

      if (!candidateDoc.exists) continue;

      const candidateData = candidateDoc.data();
      const seatNum = candidateData?.profile?.seatNum as number | undefined;

      if (seatNum !== undefined && seatToTemplates.has(seatNum)) {
        questionMap[candidateId] = seatToTemplates.get(seatNum)!;
      }
    }

    return questionMap;
  }
}
