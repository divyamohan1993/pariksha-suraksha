import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSub, Topic } from '@google-cloud/pubsub';
import { Firestore } from '@google-cloud/firestore';
import type { CryptoLifecycleConfig } from '../config/configuration';

/**
 * Status of TLP generation for an exam.
 */
export interface TlpStatus {
  examId: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  questionsTotal: number;
  questionsProcessed: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

/**
 * TLP timing verification result.
 */
export interface TlpTimingVerification {
  examId: string;
  expectedSolveTime: Date;
  actualExamStartTime: Date;
  deviationSeconds: number;
  withinTolerance: boolean;
  safetyMarginSeconds: number;
}

@Injectable()
export class TlpService implements OnModuleInit {
  private readonly logger = new Logger(TlpService.name);
  private pubsub!: PubSub;
  private firestore!: Firestore;
  private tlpTopic!: Topic;
  private readonly config: CryptoLifecycleConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<CryptoLifecycleConfig>('crypto')!;
  }

  async onModuleInit(): Promise<void> {
    this.pubsub = new PubSub({ projectId: this.config.gcpProjectId });
    this.firestore = new Firestore({
      projectId: this.config.gcpProjectId,
      databaseId: this.config.firestoreDatabase,
    });
    this.tlpTopic = this.pubsub.topic(this.config.pubsubTlpTopic);
    this.logger.log('TLP service initialized');
  }

  /**
   * Publish a TLP generation job to the tlp-generation-trigger Pub/Sub topic.
   * The Python TLP generator worker picks up this message and generates
   * time-lock puzzles for all questions in the exam.
   *
   * Per spec section 5.4: The worker generates RSA time-lock puzzles that
   * seal each question's encryption key until the scheduled exam start time.
   */
  async triggerTlpGeneration(examId: string): Promise<{ messageId: string }> {
    this.logger.log(`Triggering TLP generation for exam ${examId}`);

    // Load exam metadata to get scheduled start time
    const examDoc = await this.firestore.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      throw new Error(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const scheduledStartTime = examData.scheduledStartTime as string;
    if (!scheduledStartTime) {
      throw new Error(`Exam ${examId} has no scheduled start time`);
    }

    // Load TLP calibration data if available
    const calibrationDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('tlpCalibration')
      .doc('latest')
      .get();

    const calibration = calibrationDoc.exists ? calibrationDoc.data() : null;

    // Count total questions to process
    const keysSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('encryptedKeys')
      .get();

    const questionsTotal = keysSnapshot.size;

    // Publish the job to Pub/Sub
    const messagePayload = {
      examId,
      scheduledStartTime,
      questionsTotal,
      calibration: calibration
        ? {
            squaringsPerSec: calibration.squaringsPerSec as number,
            safetyMarginSec: calibration.safetyMarginSec as number,
            machineType: calibration.machineType as string,
          }
        : null,
      triggeredAt: new Date().toISOString(),
    };

    const messageId = await this.tlpTopic.publishMessage({
      data: Buffer.from(JSON.stringify(messagePayload)),
      attributes: {
        examId,
        jobType: 'tlp-generation',
      },
    });

    // Record the TLP generation status in Firestore
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('tlpStatus')
      .doc('current')
      .set({
        examId,
        status: 'pending',
        questionsTotal,
        questionsProcessed: 0,
        triggeredAt: new Date().toISOString(),
        messageId,
      });

    this.logger.log(
      `TLP generation triggered for exam ${examId}: ${questionsTotal} questions, messageId=${messageId}`,
    );

    return { messageId };
  }

  /**
   * Poll for TLP generation progress from Firestore.
   * The Python TLP generator worker updates this document as it processes questions.
   */
  async getTlpStatus(examId: string): Promise<TlpStatus> {
    const statusDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('tlpStatus')
      .doc('current')
      .get();

    if (!statusDoc.exists) {
      return {
        examId,
        status: 'pending',
        questionsTotal: 0,
        questionsProcessed: 0,
      };
    }

    const data = statusDoc.data()!;

    return {
      examId,
      status: data.status as TlpStatus['status'],
      questionsTotal: data.questionsTotal as number,
      questionsProcessed: data.questionsProcessed as number,
      startedAt: data.startedAt as string | undefined,
      completedAt: data.completedAt as string | undefined,
      errorMessage: data.errorMessage as string | undefined,
    };
  }

  /**
   * Verify TLP timing accuracy: compare the expected solve time
   * (when the puzzle becomes solvable without the trapdoor)
   * versus the actual exam start time.
   *
   * Per addendum Fix 9: TLP is calibrated to become solvable 30s before exam start.
   * KMS is the primary release mechanism; TLP is the fallback.
   */
  async verifyTlpTiming(examId: string): Promise<TlpTimingVerification> {
    // Load exam metadata
    const examDoc = await this.firestore.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      throw new Error(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const actualExamStartTime = new Date(examData.scheduledStartTime as string);

    // Load TLP calibration data
    const calibrationDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('tlpCalibration')
      .doc('latest')
      .get();

    const safetyMarginSeconds = calibrationDoc.exists
      ? (calibrationDoc.data()!.safetyMarginSec as number)
      : 30;

    // The expected TLP solve time is safetyMarginSeconds before exam start
    const expectedSolveTime = new Date(
      actualExamStartTime.getTime() - safetyMarginSeconds * 1000,
    );

    // Load actual TLP solve data if available (from TLP status)
    const statusDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('tlpStatus')
      .doc('current')
      .get();

    let deviationSeconds = 0;
    if (statusDoc.exists && statusDoc.data()!.actualSolveTime) {
      const actualSolveTime = new Date(statusDoc.data()!.actualSolveTime as string);
      deviationSeconds = (actualSolveTime.getTime() - expectedSolveTime.getTime()) / 1000;
    }

    // Per spec: TLP timing tolerance is +/- 60s since KMS is primary
    const toleranceSeconds = 60;
    const withinTolerance = Math.abs(deviationSeconds) <= toleranceSeconds;

    this.logger.log(
      `TLP timing for exam ${examId}: deviation=${deviationSeconds}s, within tolerance=${withinTolerance}`,
    );

    return {
      examId,
      expectedSolveTime,
      actualExamStartTime,
      deviationSeconds,
      withinTolerance,
      safetyMarginSeconds,
    };
  }
}
