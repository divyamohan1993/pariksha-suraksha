import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Firestore } from '@google-cloud/firestore';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RenderingService } from '../rendering/rendering.service';
import {
  PreRenderedPaper,
  DecryptedQuestion,
  SeatAssignment,
  QuestionAssignment,
} from '../common/interfaces/paper.interfaces';

/** Redis key patterns */
const PAPER_KEY = (examId: string, centerId: string, seatNum: string) =>
  `exam:${examId}:paper:${centerId}:${seatNum}`;

const MATRIX_KEY = (examId: string, centerId: string, seatNum: string) =>
  `exam:${examId}:matrix:${centerId}:${seatNum}`;

const DECRYPTED_QUESTION_KEY = (examId: string, questionId: string) =>
  `exam:${examId}:question:${questionId}:decrypted`;

/** Pipeline batch size for Redis operations */
const PIPELINE_BATCH_SIZE = 500;

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private firestore: Firestore;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly renderingService: RenderingService,
  ) {
    this.firestore = new Firestore({
      projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    });
  }

  onModuleInit() {
    this.logger.log('CacheService initialized');
  }

  /**
   * TRUE O(1) hot path — single Redis GET returning a complete pre-rendered paper.
   * Target latency: < 1ms.
   *
   * This is THE critical performance path for exam day paper delivery.
   * No sequential per-question lookups. No rendering. Just a single GET.
   */
  async getPreRenderedPaper(
    examId: string,
    centerId: string,
    seatNum: string,
  ): Promise<PreRenderedPaper | null> {
    const key = PAPER_KEY(examId, centerId, seatNum);
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached) as PreRenderedPaper;
    }

    return null;
  }

  /**
   * Fallback: if pre-rendered paper is not in Redis, reconstruct from Firestore
   * and cache it. This path should only run if pre-warming failed or was incomplete.
   */
  async getOrReconstructPaper(
    examId: string,
    centerId: string,
    seatNum: string,
  ): Promise<PreRenderedPaper | null> {
    // Try the O(1) hot path first
    const cached = await this.getPreRenderedPaper(examId, centerId, seatNum);
    if (cached) {
      return cached;
    }

    this.logger.warn(
      `Cache miss for ${PAPER_KEY(examId, centerId, seatNum)} — falling back to Firestore reconstruction`,
    );

    try {
      // Load assignment from Firestore
      const assignmentDoc = await this.firestore
        .collection('exams')
        .doc(examId)
        .collection('centers')
        .doc(centerId)
        .collection('seats')
        .doc(seatNum)
        .get();

      if (!assignmentDoc.exists) {
        this.logger.error(`No assignment found in Firestore for ${examId}/${centerId}/${seatNum}`);
        return null;
      }

      const seatData = assignmentDoc.data() as { assignment: SeatAssignment };
      const seatAssignment = seatData.assignment;

      // Default duration; in production this comes from exam metadata
      const durationMinutes = 180;

      // Reconstruct paper by loading decrypted questions from Redis
      const questions = await this.loadDecryptedQuestions(examId, seatAssignment.questionAssignments);

      if (questions.length === 0) {
        this.logger.error(`No decrypted questions available for ${examId}/${centerId}/${seatNum}`);
        return null;
      }

      // Render the paper
      const paper = this.renderingService.renderPaper(
        examId,
        centerId,
        seatNum,
        questions,
        durationMinutes,
      );

      // Cache it for subsequent requests (TTL: exam duration + 1 hour)
      const ttlSeconds = (durationMinutes + 60) * 60;
      await this.redis.set(
        PAPER_KEY(examId, centerId, seatNum),
        JSON.stringify(paper),
        'EX',
        ttlSeconds,
      );

      return paper;
    } catch (error) {
      this.logger.error(
        `Firestore fallback failed for ${examId}/${centerId}/${seatNum}`,
        (error as Error).stack,
      );
      return null;
    }
  }

  /**
   * Pre-warm the Redis cache at key release time.
   * Decrypts all questions and pre-renders all papers for an exam.
   *
   * For each (centerId, seatNum) in the exam:
   *   1. Assemble complete rendered paper JSON
   *   2. Redis.SET exam:{examId}:paper:{centerId}:{seatNum} -> complete paper JSON
   *   3. TTL = exam duration + 1 hour
   *
   * Uses Redis pipeline for batch SET operations (10,000+ keys).
   */
  async preWarmCache(examId: string, durationMinutes: number = 180): Promise<{
    totalPapers: number;
    cachedPapers: number;
    failedPapers: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    this.logger.log(`Starting cache pre-warm for exam ${examId}`);

    let totalPapers = 0;
    let cachedPapers = 0;
    let failedPapers = 0;
    const ttlSeconds = (durationMinutes + 60) * 60;

    try {
      // Load all centers for this exam
      const centersSnapshot = await this.firestore
        .collection('exams')
        .doc(examId)
        .collection('centers')
        .get();

      // Process each center
      for (const centerDoc of centersSnapshot.docs) {
        const centerId = centerDoc.id;

        // Load all seats for this center
        const seatsSnapshot = await this.firestore
          .collection('exams')
          .doc(examId)
          .collection('centers')
          .doc(centerId)
          .collection('seats')
          .get();

        // Collect all papers for this center, then batch-write to Redis
        const papersToCache: Array<{ key: string; value: string }> = [];

        for (const seatDoc of seatsSnapshot.docs) {
          totalPapers++;
          const seatNum = seatDoc.id;

          try {
            const seatDocData = seatDoc.data() as { assignment: SeatAssignment };
            const seatAssignment = seatDocData.assignment;

            // Load decrypted questions for this seat's assignment
            const questions = await this.loadDecryptedQuestions(
              examId,
              seatAssignment.questionAssignments,
            );

            if (questions.length === 0) {
              this.logger.warn(`No decrypted questions for ${centerId}/${seatNum} — skipping`);
              failedPapers++;
              continue;
            }

            // Render the complete paper
            const paper = this.renderingService.renderPaper(
              examId,
              centerId,
              seatNum,
              questions,
              durationMinutes,
            );

            papersToCache.push({
              key: PAPER_KEY(examId, centerId, seatNum),
              value: JSON.stringify(paper),
            });
          } catch (error) {
            this.logger.error(
              `Failed to render paper for ${centerId}/${seatNum}`,
              (error as Error).message,
            );
            failedPapers++;
          }
        }

        // Batch write to Redis using pipeline (handles 10,000+ keys efficiently)
        const batchResult = await this.batchSetWithPipeline(papersToCache, ttlSeconds);
        cachedPapers += batchResult;

        this.logger.log(
          `Center ${centerId}: cached ${batchResult}/${papersToCache.length} papers`,
        );
      }
    } catch (error) {
      this.logger.error(`Pre-warm failed for exam ${examId}`, (error as Error).stack);
      throw error;
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `Cache pre-warm complete for exam ${examId}: ${cachedPapers}/${totalPapers} papers in ${durationMs}ms (${failedPapers} failures)`,
    );

    return { totalPapers, cachedPapers, failedPapers, durationMs };
  }

  /**
   * Batch SET operation using Redis pipeline.
   * Splits into batches of PIPELINE_BATCH_SIZE to avoid overwhelming Redis.
   */
  private async batchSetWithPipeline(
    entries: Array<{ key: string; value: string }>,
    ttlSeconds: number,
  ): Promise<number> {
    let successCount = 0;

    for (let i = 0; i < entries.length; i += PIPELINE_BATCH_SIZE) {
      const batch = entries.slice(i, i + PIPELINE_BATCH_SIZE);
      const pipeline = this.redis.pipeline();

      for (const entry of batch) {
        pipeline.set(entry.key, entry.value, 'EX', ttlSeconds);
      }

      const results = await pipeline.exec();
      if (results) {
        successCount += results.filter(([err]) => err === null).length;
      }
    }

    return successCount;
  }

  /**
   * Load decrypted question data from Redis cache.
   * These are placed into Redis by the crypto-lifecycle service at key release time.
   */
  private async loadDecryptedQuestions(
    examId: string,
    assignments: QuestionAssignment[],
  ): Promise<DecryptedQuestion[]> {
    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Use pipeline to fetch all questions in a single round-trip
    const pipeline = this.redis.pipeline();
    for (const assignment of assignments) {
      const questionKey = DECRYPTED_QUESTION_KEY(
        examId,
        `${assignment.templateId}:${assignment.paramInstantiationId}`,
      );
      pipeline.get(questionKey);
    }

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    const questions: DecryptedQuestion[] = [];
    for (let i = 0; i < results.length; i++) {
      const [err, value] = results[i];
      if (err || !value) {
        this.logger.warn(
          `Missing decrypted question: ${assignments[i].templateId}:${assignments[i].paramInstantiationId}`,
        );
        continue;
      }

      try {
        const question = JSON.parse(value as string) as DecryptedQuestion;
        // Override position from the assignment (matrix determines order)
        question.position = assignments[i].position;
        questions.push(question);
      } catch (parseError) {
        this.logger.error(
          `Failed to parse decrypted question ${assignments[i].templateId}`,
          (parseError as Error).message,
        );
      }
    }

    // Sort by position to maintain paper order
    questions.sort((a, b) => a.position - b.position);
    return questions;
  }
}
