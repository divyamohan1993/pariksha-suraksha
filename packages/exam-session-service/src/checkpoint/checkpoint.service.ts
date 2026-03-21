import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { Storage } from '@google-cloud/storage';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { Observable, firstValueFrom } from 'rxjs';

import { REDIS } from '../infrastructure/redis.module';
import { GCS_STORAGE } from '../infrastructure/storage.module';
import { BLOCKCHAIN_SERVICE } from '../infrastructure/blockchain-client.module';
import { EncryptionService } from '../encryption/encryption.service';

import type { QuestionResponse, ExamCheckpoint } from '@pariksha/shared';

/** Shape of the gRPC blockchain service stub. */
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

@Injectable()
export class CheckpointService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckpointService.name);
  private blockchainService!: BlockchainGrpcService;

  /** Track the last checkpoint hash per candidate to detect significant state changes. */
  private readonly lastCheckpointHashes = new Map<string, string>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GCS_STORAGE) private readonly storage: Storage,
    @Inject(BLOCKCHAIN_SERVICE) private readonly blockchainClient: ClientGrpc,
    private readonly encryptionService: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.blockchainService =
      this.blockchainClient.getService<BlockchainGrpcService>(
        'BlockchainService',
      );
  }

  onModuleDestroy(): void {
    this.lastCheckpointHashes.clear();
  }

  /**
   * Save a checkpoint of the candidate's current response state.
   *
   * 1. Encrypt the response snapshot with the candidate-specific key.
   * 2. Store to Redis as hot cache with TTL.
   * 3. Store to GCS as durable backup.
   * 4. If the state has changed significantly, record a blockchain event.
   */
  async saveCheckpoint(
    candidateId: string,
    examId: string,
    responses: ReadonlyArray<QuestionResponse>,
    currentQuestionPosition: number,
    elapsedMs: number,
  ): Promise<{ success: boolean; savedAt: string }> {
    const savedAt = new Date().toISOString();

    const checkpoint: ExamCheckpoint = {
      candidateId,
      examId,
      responses: responses as QuestionResponse[],
      currentQuestionPosition,
      elapsedMs,
      savedAt,
    };

    const plaintext = Buffer.from(JSON.stringify(checkpoint), 'utf-8');
    const candidateKey = this.encryptionService.generateCandidateKey(
      candidateId,
      examId,
    );

    // Encrypt the checkpoint
    const encryptedPayload = this.encryptionService.encryptResponse(
      plaintext,
      candidateKey,
    );
    const packed = this.encryptionService.packEncrypted(encryptedPayload);

    const redisKey = `exam:${examId}:candidate:${candidateId}:checkpoint`;
    const ttlSeconds = this.config.get<number>('checkpoint.ttlSeconds') ?? 14400;

    // Store to Redis and GCS in parallel
    const [redisResult, gcsResult] = await Promise.allSettled([
      this.saveToRedis(redisKey, packed, ttlSeconds),
      this.saveToGcs(candidateId, examId, packed, savedAt),
    ]);

    if (redisResult.status === 'rejected') {
      this.logger.error(
        `Redis checkpoint save failed for ${candidateId}: ${redisResult.reason}`,
      );
    }

    if (gcsResult.status === 'rejected') {
      this.logger.error(
        `GCS checkpoint save failed for ${candidateId}: ${gcsResult.reason}`,
      );
    }

    // Both failed — this is a real problem
    if (
      redisResult.status === 'rejected' &&
      gcsResult.status === 'rejected'
    ) {
      throw new InternalServerErrorException(
        'Checkpoint save failed on both Redis and GCS',
      );
    }

    // Check for significant state change and record blockchain event
    await this.maybeRecordBlockchainEvent(
      candidateId,
      examId,
      plaintext,
      savedAt,
    );

    return { success: true, savedAt };
  }

  /**
   * Load a checkpoint for a candidate.
   * Try Redis first; fall back to the most recent GCS backup.
   */
  async loadCheckpoint(
    candidateId: string,
    examId: string,
  ): Promise<ExamCheckpoint | null> {
    const candidateKey = this.encryptionService.generateCandidateKey(
      candidateId,
      examId,
    );

    // Attempt Redis first
    const redisKey = `exam:${examId}:candidate:${candidateId}:checkpoint`;
    try {
      const redisData = await this.redis.getBuffer(redisKey);
      if (redisData) {
        return this.decryptCheckpoint(redisData, candidateKey);
      }
    } catch (error) {
      this.logger.warn(
        `Redis checkpoint load failed for ${candidateId}, falling back to GCS: ${(error as Error).message}`,
      );
    }

    // Fallback to GCS — load most recent checkpoint file
    try {
      return await this.loadFromGcs(candidateId, examId, candidateKey);
    } catch (error) {
      this.logger.warn(
        `GCS checkpoint load failed for ${candidateId}: ${(error as Error).message}`,
      );
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async saveToRedis(
    key: string,
    data: Buffer,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(key, data, 'EX', ttlSeconds);
  }

  private async saveToGcs(
    candidateId: string,
    examId: string,
    data: Buffer,
    timestamp: string,
  ): Promise<void> {
    const bucket = this.config.get<string>('storage.backupBucket')!;
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');
    const path = `${examId}/${candidateId}/checkpoint_${safeTimestamp}.enc`;

    const file = this.storage.bucket(bucket).file(path);
    await file.save(data, {
      contentType: 'application/octet-stream',
      resumable: false,
      metadata: {
        metadata: {
          candidateId,
          examId,
          timestamp,
          type: 'checkpoint',
        },
      },
    });
  }

  private async loadFromGcs(
    candidateId: string,
    examId: string,
    candidateKey: Buffer,
  ): Promise<ExamCheckpoint | null> {
    const bucket = this.config.get<string>('storage.backupBucket')!;
    const prefix = `${examId}/${candidateId}/checkpoint_`;

    const [files] = await this.storage.bucket(bucket).getFiles({
      prefix,
      delimiter: '/',
    });

    if (files.length === 0) {
      return null;
    }

    // Sort by name descending — timestamp is embedded in the filename,
    // so lexicographic sort gives us the most recent checkpoint.
    files.sort((a, b) => b.name.localeCompare(a.name));

    const [data] = await files[0]!.download();
    return this.decryptCheckpoint(data, candidateKey);
  }

  private decryptCheckpoint(
    packed: Buffer,
    candidateKey: Buffer,
  ): ExamCheckpoint {
    const { iv, authTag, encrypted } =
      this.encryptionService.unpackEncrypted(packed);

    const plaintext = this.encryptionService.decryptResponse(
      encrypted,
      candidateKey,
      iv,
      authTag,
    );

    return JSON.parse(plaintext.toString('utf-8')) as ExamCheckpoint;
  }

  /**
   * Record a blockchain event if the checkpoint represents a significant
   * state change (i.e., the response content hash has changed since the
   * last recorded event for this candidate).
   */
  private async maybeRecordBlockchainEvent(
    candidateId: string,
    examId: string,
    plaintext: Buffer,
    savedAt: string,
  ): Promise<void> {
    const currentHash = createHash('sha256').update(plaintext).digest('hex');
    const cacheKey = `${examId}:${candidateId}`;
    const previousHash = this.lastCheckpointHashes.get(cacheKey);

    if (previousHash === currentHash) {
      // No significant change — skip blockchain event
      return;
    }

    this.lastCheckpointHashes.set(cacheKey, currentHash);

    try {
      await firstValueFrom(
        this.blockchainService.recordEvent({
          event_type: 'submit',
          exam_id: examId,
          entity_hash: currentHash,
          actor_id: candidateId,
          actor_org: 'ParikshaSurakshaMSP',
          actor_type: 'system',
          metadata_json: JSON.stringify({
            action: 'checkpoint',
            candidateId,
            savedAt,
          }),
        }),
      );
    } catch (error) {
      // Blockchain event recording failure is non-fatal for checkpoints.
      // The checkpoint itself is already saved to Redis + GCS.
      this.logger.warn(
        `Blockchain event for checkpoint failed for ${candidateId}: ${(error as Error).message}`,
      );
    }
  }
}
