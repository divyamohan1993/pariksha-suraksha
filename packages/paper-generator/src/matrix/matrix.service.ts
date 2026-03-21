import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { Firestore } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CacheService } from '../cache/cache.service';
import {
  MatrixStatus,
  ExamBlueprint,
  QuestionBankMetadata,
  PreRenderedPaper,
  SeatAssignment,
} from '../common/interfaces/paper.interfaces';

/** Redis key for assignment matrix lookup */
const MATRIX_KEY = (examId: string, centerId: string, seatNum: string) =>
  `exam:${examId}:matrix:${centerId}:${seatNum}`;

/** Redis key for pre-rendered paper (O(1) hot path) */
const PAPER_KEY = (examId: string, centerId: string, seatNum: string) =>
  `exam:${examId}:paper:${centerId}:${seatNum}`;

/** Pub/Sub topic for triggering the matrix solver Python worker */
const MATRIX_SOLVER_TOPIC = 'matrix-solver-trigger';

@Injectable()
export class MatrixService {
  private readonly logger = new Logger(MatrixService.name);
  private readonly firestore: Firestore;
  private readonly pubsub: PubSub;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly cacheService: CacheService,
  ) {
    this.firestore = new Firestore({
      projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    });
    this.pubsub = new PubSub({
      projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    });
  }

  /**
   * Trigger matrix generation for an exam.
   * Publishes a job to the matrix-solver-trigger Pub/Sub topic
   * with the exam blueprint and question bank metadata.
   */
  async triggerMatrixGeneration(examId: string): Promise<{ jobId: string; status: string }> {
    this.logger.log(`Triggering matrix generation for exam ${examId}`);

    // Load exam blueprint from Firestore
    const examDoc = await this.firestore.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const metadata = examData.metadata || {};
    const blueprintData = examData.blueprint || {};

    // Build the exam blueprint
    const blueprint: ExamBlueprint = {
      examId,
      name: metadata.name || '',
      totalQuestions: metadata.totalQuestions || 0,
      questionsPerPaper: blueprintData.questionsPerPaper || 0,
      subjects: metadata.subjects || [],
      difficultyDistribution: blueprintData.difficultyDist || {},
      topicCoverage: blueprintData.topicCoverage || {},
      centers: [],
    };

    // Load centers and seat layouts
    const centersSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('centers')
      .get();

    for (const centerDoc of centersSnapshot.docs) {
      const centerData = centerDoc.data();
      const seatsSnapshot = await this.firestore
        .collection('exams')
        .doc(examId)
        .collection('centers')
        .doc(centerDoc.id)
        .collection('seats')
        .get();

      blueprint.centers.push({
        centerId: centerDoc.id,
        name: centerData.name || centerDoc.id,
        totalSeats: seatsSnapshot.size,
        seatNumbers: seatsSnapshot.docs.map((s) => s.id),
      });
    }

    // Load question bank metadata
    const questionsSnapshot = await this.firestore
      .collection('questions')
      .select('metadata.subject')
      .get();

    const subjectBreakdown: Record<string, number> = {};
    let totalTemplates = 0;
    for (const doc of questionsSnapshot.docs) {
      totalTemplates++;
      const subject = doc.data()?.metadata?.subject || 'unknown';
      subjectBreakdown[subject] = (subjectBreakdown[subject] || 0) + 1;
    }

    const questionBankMetadata: QuestionBankMetadata = {
      totalTemplates,
      totalInstantiations: totalTemplates * 10, // Estimated; actual count from subcollections
      subjectBreakdown,
      calibrationStatus: 'all_calibrated',
    };

    // Publish job to Pub/Sub
    const jobId = `matrix-${examId}-${Date.now()}`;
    const message = {
      jobId,
      examId,
      blueprint,
      questionBankMetadata,
      triggeredAt: new Date().toISOString(),
    };

    const topic = this.pubsub.topic(MATRIX_SOLVER_TOPIC);
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify(message)),
      attributes: {
        examId,
        jobId,
        type: 'matrix-generation',
      },
    });

    // Update exam status in Firestore
    await this.firestore.collection('exams').doc(examId).update({
      'metadata.matrixStatus': 'pending',
      'metadata.matrixJobId': jobId,
      'metadata.matrixTriggeredAt': new Date().toISOString(),
    });

    this.logger.log(`Matrix generation job ${jobId} published for exam ${examId}`);
    return { jobId, status: 'pending' };
  }

  /**
   * Poll Firestore for matrix generation status.
   */
  async getMatrixStatus(examId: string): Promise<MatrixStatus> {
    const examDoc = await this.firestore.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const metadata = examData.metadata || {};

    return {
      examId,
      status: metadata.matrixStatus || 'pending',
      progress: metadata.matrixProgress || 0,
      totalPapers: metadata.totalCandidates || 0,
      completedPapers: metadata.matrixCompletedPapers || 0,
      startedAt: metadata.matrixTriggeredAt,
      completedAt: metadata.matrixCompletedAt,
      error: metadata.matrixError,
    };
  }

  /**
   * O(1) paper lookup — THE critical hot path for exam day.
   *
   * Returns a complete pre-rendered paper from Redis cache (single GET).
   * If not in cache, falls back to Firestore reconstruction and caches the result.
   *
   * Per addendum Fix 7: this is a single Redis GET returning a pre-rendered paper.
   * Target latency: < 1ms from Redis, < 100ms with Firestore fallback.
   */
  async getAssignment(
    examId: string,
    centerId: string,
    seatNum: string,
  ): Promise<PreRenderedPaper> {
    // PRIMARY PATH: O(1) Redis GET for pre-rendered paper
    const paper = await this.cacheService.getPreRenderedPaper(examId, centerId, seatNum);
    if (paper) {
      return paper;
    }

    // FALLBACK: reconstruct from Firestore + decrypted question cache
    this.logger.warn(`O(1) cache miss for ${examId}/${centerId}/${seatNum} — using fallback`);
    const reconstructed = await this.cacheService.getOrReconstructPaper(examId, centerId, seatNum);
    if (reconstructed) {
      return reconstructed;
    }

    throw new NotFoundException(
      `Paper not found for exam ${examId}, center ${centerId}, seat ${seatNum}`,
    );
  }

  /**
   * Preload the entire assignment matrix from Firestore into Redis.
   * Called on exam day for pre-warming before key release.
   *
   * This loads the raw matrix assignments (not rendered papers).
   * Rendered papers are cached separately by CacheService.preWarmCache().
   */
  async preloadMatrix(examId: string): Promise<{
    totalAssignments: number;
    loadedAssignments: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    this.logger.log(`Preloading assignment matrix for exam ${examId}`);

    let totalAssignments = 0;
    let loadedAssignments = 0;

    const centersSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('centers')
      .get();

    for (const centerDoc of centersSnapshot.docs) {
      const centerId = centerDoc.id;
      const seatsSnapshot = await this.firestore
        .collection('exams')
        .doc(examId)
        .collection('centers')
        .doc(centerId)
        .collection('seats')
        .get();

      // Batch load using Redis pipeline
      const pipeline = this.redis.pipeline();
      const ttlSeconds = 24 * 60 * 60; // 24 hours

      for (const seatDoc of seatsSnapshot.docs) {
        totalAssignments++;
        const seatNum = seatDoc.id;
        const seatData = seatDoc.data();

        if (seatData?.assignment) {
          pipeline.set(
            MATRIX_KEY(examId, centerId, seatNum),
            JSON.stringify(seatData.assignment),
            'EX',
            ttlSeconds,
          );
        }
      }

      const results = await pipeline.exec();
      if (results) {
        loadedAssignments += results.filter(([err]) => err === null).length;
      }

      this.logger.log(`Center ${centerId}: loaded ${seatsSnapshot.size} assignments`);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `Matrix preload complete for exam ${examId}: ${loadedAssignments}/${totalAssignments} in ${durationMs}ms`,
    );

    return { totalAssignments, loadedAssignments, durationMs };
  }
}
