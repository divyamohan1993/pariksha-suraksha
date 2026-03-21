import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Observable, firstValueFrom } from 'rxjs';

import { FIRESTORE } from '../infrastructure/firestore.module';
import { GCS_STORAGE } from '../infrastructure/storage.module';
import { BLOCKCHAIN_SERVICE } from '../infrastructure/blockchain-client.module';
import { PAPER_GENERATOR_SERVICE } from '../infrastructure/paper-generator-client.module';
import { EncryptionService } from '../encryption/encryption.service';

import type { QuestionResponse, CandidateResponse } from '@pariksha/shared';

// ---------------------------------------------------------------------------
// gRPC service stubs
// ---------------------------------------------------------------------------

interface BlockchainGrpcService {
  recordEvent(request: {
    event_type: string;
    exam_id: string;
    entity_hash: string;
    actor_id: string;
    actor_org: string;
    actor_type: string;
    metadata_json: string;
  }): Observable<{ event_id: string; tx_id: string; timestamp: string }>;
}

interface PaperGeneratorGrpcService {
  getPaper(request: {
    exam_id: string;
    center_id: string;
    seat_num: number;
  }): Observable<{ paper_json: string; question_count: number }>;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface StartSessionResult {
  sessionId: string;
  examId: string;
  candidateId: string;
  paperJson: string;
  durationMinutes: number;
  startedAt: string;
}

export interface SubmitResult {
  submissionHash: string;
  verificationUrl: string;
  submittedAt: string;
}

export interface VerificationResult {
  verified: boolean;
  timestamp: string;
  blockchainEventId: string;
}

@Injectable()
export class ResponsesService implements OnModuleInit {
  private readonly logger = new Logger(ResponsesService.name);
  private blockchainService!: BlockchainGrpcService;
  private paperGeneratorService!: PaperGeneratorGrpcService;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    @Inject(GCS_STORAGE) private readonly storage: Storage,
    @Inject(BLOCKCHAIN_SERVICE) private readonly blockchainClient: ClientGrpc,
    @Inject(PAPER_GENERATOR_SERVICE)
    private readonly paperGeneratorClient: ClientGrpc,
    private readonly encryptionService: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.blockchainService =
      this.blockchainClient.getService<BlockchainGrpcService>(
        'BlockchainService',
      );
    this.paperGeneratorService =
      this.paperGeneratorClient.getService<PaperGeneratorGrpcService>(
        'PaperGeneratorService',
      );
  }

  // ---------------------------------------------------------------------------
  // startExamSession
  // ---------------------------------------------------------------------------

  async startExamSession(
    candidateId: string,
    examId: string,
    centerId: string,
    seatNum: number,
  ): Promise<StartSessionResult> {
    // 1. Verify candidate assignment exists in Firestore
    const candidateDoc = await this.firestore
      .collection('candidates')
      .doc(candidateId)
      .get();

    if (!candidateDoc.exists) {
      throw new NotFoundException(
        `Candidate ${candidateId} not found`,
      );
    }

    const candidateData = candidateDoc.data();
    if (!candidateData) {
      throw new NotFoundException(
        `Candidate ${candidateId} data is empty`,
      );
    }

    if (
      candidateData.profile?.examId !== examId ||
      candidateData.profile?.centerId !== centerId ||
      candidateData.profile?.seatNum !== seatNum
    ) {
      throw new BadRequestException(
        `Candidate ${candidateId} is not assigned to exam=${examId}, center=${centerId}, seat=${seatNum}`,
      );
    }

    // 2. Load pre-rendered paper from paper-generator via gRPC
    let paperJson: string;
    let questionCount: number;

    try {
      const paperResponse = await firstValueFrom(
        this.paperGeneratorService.getPaper({
          exam_id: examId,
          center_id: centerId,
          seat_num: seatNum,
        }),
      );
      paperJson = paperResponse.paper_json;
      questionCount = paperResponse.question_count;
    } catch (error) {
      this.logger.error(
        `Failed to load paper for candidate=${candidateId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to load exam paper — please retry',
      );
    }

    // 3. Verify exam is in ACTIVE status
    const examDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .get();

    if (!examDoc.exists) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }

    const examData = examDoc.data();
    if (!examData || examData.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Exam ${examId} is not currently active (status: ${examData?.status})`,
      );
    }

    const durationMinutes: number = examData.durationMinutes ?? 180;

    // 4. Initialize response state — mark session as started
    const sessionId = uuidv4();
    const startedAt = new Date().toISOString();

    await this.firestore
      .collection('candidates')
      .doc(candidateId)
      .update({
        'session.sessionId': sessionId,
        'session.startedAt': startedAt,
        'session.examId': examId,
        'session.centerId': centerId,
        'session.seatNum': seatNum,
        'session.questionCount': questionCount,
        'session.status': 'in_progress',
      });

    // 5. Record blockchain event: session start
    const entityHash = createHash('sha256')
      .update(`${candidateId}||${examId}||session_start||${startedAt}`)
      .digest('hex');

    try {
      await firstValueFrom(
        this.blockchainService.recordEvent({
          event_type: 'submit',
          exam_id: examId,
          entity_hash: entityHash,
          actor_id: candidateId,
          actor_org: 'ParikshaSurakshaMSP',
          actor_type: 'system',
          metadata_json: JSON.stringify({
            action: 'session_start',
            candidateId,
            centerId,
            seatNum,
            sessionId,
            startedAt,
          }),
        }),
      );
    } catch (error) {
      // Non-fatal: session can proceed even if blockchain event fails.
      // It will be reconciled during audit.
      this.logger.warn(
        `Blockchain event for session start failed: ${(error as Error).message}`,
      );
    }

    this.logger.log(
      `Session started: candidate=${candidateId}, exam=${examId}, session=${sessionId}`,
    );

    return {
      sessionId,
      examId,
      candidateId,
      paperJson,
      durationMinutes,
      startedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // submitResponses
  // ---------------------------------------------------------------------------

  async submitResponses(
    candidateId: string,
    examId: string,
    responses: ReadonlyArray<QuestionResponse>,
  ): Promise<SubmitResult> {
    const submittedAt = new Date().toISOString();

    // 1. Serialize the response blob
    const responseBlob = Buffer.from(JSON.stringify(responses), 'utf-8');

    // 2. Encrypt with AES-256-GCM using candidate-specific key
    const candidateKey = this.encryptionService.generateCandidateKey(
      candidateId,
      examId,
    );
    const encryptedPayload = this.encryptionService.encryptResponse(
      responseBlob,
      candidateKey,
    );
    const packed = this.encryptionService.packEncrypted(encryptedPayload);

    // 3. Store encrypted blob to GCS
    const responseBucket = this.config.get<string>('storage.responseBucket')!;
    const gcsPath = `${examId}/${candidateId}/responses_${submittedAt.replace(/[:.]/g, '-')}.enc`;

    try {
      const file = this.storage.bucket(responseBucket).file(gcsPath);
      await file.save(packed, {
        contentType: 'application/octet-stream',
        resumable: false,
        metadata: {
          metadata: {
            candidateId,
            examId,
            submittedAt,
            type: 'final_submission',
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `GCS response upload failed for ${candidateId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to store encrypted responses',
      );
    }

    // 4. Compute submission hash: SHA-256(candidateId || responseBlob || timestamp)
    const submissionHash = createHash('sha256')
      .update(candidateId)
      .update(responseBlob)
      .update(submittedAt)
      .digest('hex');

    // 5. Store hash + metadata to Firestore: candidates/{candidateId}/responses
    const encryptedBlobUri = `gs://${responseBucket}/${gcsPath}`;

    const candidateResponseDoc: CandidateResponse = {
      candidateId,
      examId,
      encryptedBlobUri,
      submittedAt,
      checkpointCount: responses.length,
      submissionHash,
    };

    try {
      await this.firestore
        .collection('candidates')
        .doc(candidateId)
        .set(
          {
            responses: candidateResponseDoc,
            'session.status': 'submitted',
            'session.submittedAt': submittedAt,
          },
          { merge: true },
        );
    } catch (error) {
      this.logger.error(
        `Firestore response metadata write failed for ${candidateId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to record response metadata',
      );
    }

    // 6. Record blockchain event: submit
    let blockchainEventId = '';
    try {
      const bcResult = await firstValueFrom(
        this.blockchainService.recordEvent({
          event_type: 'submit',
          exam_id: examId,
          entity_hash: submissionHash,
          actor_id: candidateId,
          actor_org: 'ParikshaSurakshaMSP',
          actor_type: 'system',
          metadata_json: JSON.stringify({
            action: 'final_submission',
            candidateId,
            encryptedBlobUri,
            submittedAt,
          }),
        }),
      );
      blockchainEventId = bcResult.event_id;
    } catch (error) {
      this.logger.warn(
        `Blockchain event for submission failed: ${(error as Error).message}`,
      );
    }

    // Store the blockchain event ID alongside the submission for verification lookups
    if (blockchainEventId) {
      try {
        await this.firestore
          .collection('submissionIndex')
          .doc(submissionHash)
          .set({
            candidateId,
            examId,
            submissionHash,
            blockchainEventId,
            submittedAt,
          });
      } catch (error) {
        this.logger.warn(
          `Submission index write failed: ${(error as Error).message}`,
        );
      }
    }

    const verificationUrl = `/api/v1/verify/${submissionHash}`;

    this.logger.log(
      `Responses submitted: candidate=${candidateId}, exam=${examId}, hash=${submissionHash.substring(0, 16)}...`,
    );

    return {
      submissionHash,
      verificationUrl,
      submittedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // getSubmissionVerification
  // ---------------------------------------------------------------------------

  async getSubmissionVerification(
    submissionHash: string,
  ): Promise<VerificationResult> {
    if (!submissionHash || submissionHash.length !== 64) {
      throw new BadRequestException('Invalid submission hash format');
    }

    // Look up the submission index to find the blockchain event
    const indexDoc = await this.firestore
      .collection('submissionIndex')
      .doc(submissionHash)
      .get();

    if (!indexDoc.exists) {
      return {
        verified: false,
        timestamp: '',
        blockchainEventId: '',
      };
    }

    const indexData = indexDoc.data()!;

    return {
      verified: true,
      timestamp: indexData.submittedAt as string,
      blockchainEventId: (indexData.blockchainEventId as string) || '',
    };
  }
}
