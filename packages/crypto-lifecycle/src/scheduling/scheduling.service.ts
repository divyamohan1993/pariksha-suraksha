import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudSchedulerClient } from '@google-cloud/scheduler';
import { Firestore } from '@google-cloud/firestore';
import * as crypto from 'crypto';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { KmsService } from '../kms/kms.service';
import type { CryptoLifecycleConfig } from '../config/configuration';

/**
 * Paper generator gRPC client interface.
 */
interface PaperGeneratorClient {
  preWarmCache(
    request: { exam_id: string },
    callback: (
      error: grpc.ServiceError | null,
      response: { success: boolean; papers_cached: number; message: string },
    ) => void,
  ): void;
}

@Injectable()
export class SchedulingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulingService.name);
  private schedulerClient!: CloudSchedulerClient;
  private firestore!: Firestore;
  private paperGeneratorClient!: PaperGeneratorClient;
  private readonly config: CryptoLifecycleConfig;

  /** Map of examId -> in-process backup timer handles */
  private readonly backupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configService: ConfigService,
    private readonly kmsService: KmsService,
  ) {
    this.config = this.configService.get<CryptoLifecycleConfig>('crypto')!;
  }

  async onModuleInit(): Promise<void> {
    this.schedulerClient = new CloudSchedulerClient();
    this.firestore = new Firestore({
      projectId: this.config.gcpProjectId,
      databaseId: this.config.firestoreDatabase,
    });
    this.initPaperGeneratorClient();
    this.logger.log('Scheduling service initialized');
  }

  async onModuleDestroy(): Promise<void> {
    // Clear all backup timers on shutdown
    for (const [examId, timer] of this.backupTimers) {
      clearTimeout(timer);
      this.logger.log(`Cleared backup timer for exam ${examId}`);
    }
    this.backupTimers.clear();
    this.logger.log('Scheduling service destroyed');
  }

  /**
   * Initialize gRPC client for paper-generator service.
   */
  private initPaperGeneratorClient(): void {
    const protoPath = path.join(__dirname, '..', 'proto', 'paper-generator.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
    const paperGenPkg = proto['papergenerator'] as {
      PaperGeneratorService: new (
        address: string,
        credentials: grpc.ChannelCredentials,
      ) => PaperGeneratorClient;
    };
    const address = `${this.config.paperGeneratorHost}:${this.config.paperGeneratorPort}`;
    this.paperGeneratorClient = new paperGenPkg.PaperGeneratorService(
      address,
      grpc.credentials.createInsecure(),
    );
    this.logger.log(`Paper generator gRPC client connected to ${address}`);
  }

  /**
   * Convert a Date to a Cloud Scheduler cron expression for a one-time execution.
   * Cloud Scheduler uses unix-cron format.
   * For a one-time job, we use the specific minute/hour/day/month pattern.
   */
  private dateToCron(date: Date): string {
    const minutes = date.getUTCMinutes();
    const hours = date.getUTCHours();
    const dayOfMonth = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    return `${minutes} ${hours} ${dayOfMonth} ${month} *`;
  }

  /**
   * Schedule key release for an exam at a specific time.
   *
   * Implements dual redundancy per spec:
   * 1. Cloud Scheduler job that triggers at releaseTime
   * 2. In-process backup timer as failsafe
   *
   * The Cloud Scheduler job calls the /internal/release-keys endpoint.
   */
  async scheduleKeyRelease(
    examId: string,
    releaseTime: Date,
  ): Promise<{ schedulerJobName: string; backupTimerSet: boolean }> {
    this.logger.log(
      `Scheduling key release for exam ${examId} at ${releaseTime.toISOString()}`,
    );

    const now = new Date();
    if (releaseTime <= now) {
      throw new Error(
        `Release time ${releaseTime.toISOString()} is in the past`,
      );
    }

    // 1. Create Cloud Scheduler job
    const parent = `projects/${this.config.gcpProjectId}/locations/${this.config.schedulerLocation}`;
    const jobId = `key-release-${examId}`;
    const jobName = `${parent}/jobs/${jobId}`;

    const schedule = this.dateToCron(releaseTime);
    const targetUri = `${this.config.serviceUrl}/internal/release-keys`;

    try {
      // Delete existing job if it exists (idempotent reschedule)
      try {
        await this.schedulerClient.deleteJob({ name: jobName });
        this.logger.log(`Deleted existing scheduler job: ${jobName}`);
      } catch {
        // Job doesn't exist yet — that's fine
      }

      const [job] = await this.schedulerClient.createJob({
        parent,
        job: {
          name: jobName,
          schedule,
          timeZone: 'UTC',
          httpTarget: {
            uri: targetUri,
            httpMethod: 'POST',
            body: Buffer.from(JSON.stringify({ examId })).toString('base64'),
            headers: {
              'Content-Type': 'application/json',
            },
            oidcToken: {
              serviceAccountEmail: this.config.schedulerServiceAccountEmail,
              audience: targetUri,
            },
          },
          retryConfig: {
            retryCount: 3,
            maxRetryDuration: { seconds: 60 },
            minBackoffDuration: { seconds: 5 },
            maxBackoffDuration: { seconds: 30 },
          },
        },
      });

      this.logger.log(`Cloud Scheduler job created: ${job.name}`);
    } catch (error) {
      this.logger.error(
        `Failed to create Cloud Scheduler job: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue — the backup timer will handle the release
    }

    // 2. Set in-process backup timer as failsafe
    const delayMs = releaseTime.getTime() - now.getTime();

    // Clear any existing backup timer for this exam
    const existingTimer = this.backupTimers.get(examId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.logger.warn(`Backup timer fired for exam ${examId} — executing key release`);
      try {
        await this.releaseKeys(examId);
      } catch (err) {
        this.logger.error(
          `Backup timer key release failed for exam ${examId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, delayMs);

    // Ensure the timer doesn't prevent process exit
    timer.unref();
    this.backupTimers.set(examId, timer);

    // Store scheduling metadata in Firestore
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('release')
      .set({
        examId,
        schedulerJobName: jobName,
        releaseTime: releaseTime.toISOString(),
        backupTimerDelayMs: delayMs,
        scheduledAt: now.toISOString(),
        status: 'scheduled',
      });

    this.logger.log(
      `Key release scheduled for exam ${examId}: Cloud Scheduler + backup timer (${delayMs}ms)`,
    );

    return { schedulerJobName: jobName, backupTimerSet: true };
  }

  /**
   * Release keys for an exam. Triggered at exam start time by either:
   * - Cloud Scheduler job calling /internal/release-keys
   * - In-process backup timer
   *
   * Steps:
   * 1. Decrypt all DEKs for the exam
   * 2. Push decrypted papers to Redis via bulkDecryptAndCache
   * 3. Notify paper-generator via gRPC preWarmCache
   * 4. Record key_release blockchain event
   * 5. Log precise timing (target: +/-5 seconds of scheduled time)
   */
  async releaseKeys(examId: string): Promise<{
    questionsDecrypted: number;
    papersWritten: number;
    timingDeviationMs: number;
  }> {
    const releaseStart = Date.now();
    this.logger.log(`Starting key release for exam ${examId}`);

    // Load the scheduled release time for timing measurement
    const releaseDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('release')
      .get();

    let scheduledReleaseTime: number | null = null;
    if (releaseDoc.exists) {
      const data = releaseDoc.data()!;
      scheduledReleaseTime = new Date(data.releaseTime as string).getTime();
    }

    // Check if already released (idempotency: both Cloud Scheduler and backup timer may fire)
    const kekDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .get();

    if (kekDoc.exists) {
      const kekData = kekDoc.data()!;
      if (kekData.status === 'released') {
        this.logger.log(`Keys for exam ${examId} already released — skipping (idempotent)`);
        return { questionsDecrypted: 0, papersWritten: 0, timingDeviationMs: 0 };
      }
    }

    // Step 1 & 2: Bulk decrypt all questions and cache to Redis
    const { questionsDecrypted, papersWritten } =
      await this.kmsService.bulkDecryptAndCache(examId);

    // Step 3: Notify paper-generator to pre-warm its cache
    await this.notifyPaperGenerator(examId);

    // Step 4: Record blockchain key_release event
    await this.kmsService.recordBlockchainEvent(
      'key_release',
      examId,
      crypto.createHash('sha256').update(`release-${examId}-${releaseStart}`).digest('hex'),
      {
        questionsDecrypted,
        papersWritten,
        releasedAt: new Date(releaseStart).toISOString(),
      },
    );

    // Step 5: Update Firestore key schedule
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .update({
        status: 'released',
        actualReleaseTime: new Date(releaseStart).toISOString(),
      });

    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('release')
      .update({
        status: 'completed',
        actualReleaseTime: new Date(releaseStart).toISOString(),
      });

    // Clear the backup timer (release completed, no need for backup)
    const timer = this.backupTimers.get(examId);
    if (timer) {
      clearTimeout(timer);
      this.backupTimers.delete(examId);
    }

    // Step 6: Log precise timing
    const releaseEnd = Date.now();
    const timingDeviationMs = scheduledReleaseTime
      ? releaseStart - scheduledReleaseTime
      : 0;

    this.logger.log(
      `Key release completed for exam ${examId}: ` +
        `${questionsDecrypted} questions, ${papersWritten} papers, ` +
        `duration=${releaseEnd - releaseStart}ms, ` +
        `timing deviation=${timingDeviationMs}ms ` +
        `(target: +/-5000ms)`,
    );

    if (Math.abs(timingDeviationMs) > 5000) {
      this.logger.warn(
        `Key release timing deviation ${timingDeviationMs}ms exceeds +/-5s target for exam ${examId}`,
      );
    }

    return { questionsDecrypted, papersWritten, timingDeviationMs };
  }

  /**
   * Notify paper-generator service to pre-warm its cache via gRPC.
   */
  private async notifyPaperGenerator(examId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.paperGeneratorClient.preWarmCache(
        { exam_id: examId },
        (error, response) => {
          if (error) {
            this.logger.error(
              `Paper generator pre-warm notification failed: ${error.message}`,
            );
            // Non-fatal: papers are already in Redis from bulkDecryptAndCache
            resolve();
            return;
          }
          this.logger.log(
            `Paper generator notified: ${response.papers_cached} papers pre-warmed for exam ${examId}`,
          );
          resolve();
        },
      );
    });
  }

  /**
   * Cancel a scheduled key release (e.g., exam postponed).
   */
  async cancelScheduledRelease(examId: string): Promise<void> {
    this.logger.log(`Cancelling scheduled key release for exam ${examId}`);

    // Cancel Cloud Scheduler job
    const parent = `projects/${this.config.gcpProjectId}/locations/${this.config.schedulerLocation}`;
    const jobName = `${parent}/jobs/key-release-${examId}`;

    try {
      await this.schedulerClient.deleteJob({ name: jobName });
      this.logger.log(`Deleted Cloud Scheduler job: ${jobName}`);
    } catch {
      this.logger.warn(`Cloud Scheduler job ${jobName} not found (may already be deleted)`);
    }

    // Cancel backup timer
    const timer = this.backupTimers.get(examId);
    if (timer) {
      clearTimeout(timer);
      this.backupTimers.delete(examId);
      this.logger.log(`Cleared backup timer for exam ${examId}`);
    }

    // Update Firestore
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('release')
      .update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      });
  }
}
