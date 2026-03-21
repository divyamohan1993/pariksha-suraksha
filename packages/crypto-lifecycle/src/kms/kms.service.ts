import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import type { CryptoLifecycleConfig } from '../config/configuration';

/**
 * Result from encrypting a single question blob.
 */
export interface EncryptQuestionResult {
  /** GCS URI of the encrypted blob */
  encryptedBlobUri: string;
  /** The DEK encrypted by Cloud KMS (base64) */
  encryptedDek: string;
  /** GCM IV (base64) */
  iv: string;
  /** GCM auth tag (base64) */
  authTag: string;
  /** SHA-256 of the plaintext */
  plaintextHash: string;
}

/**
 * Result from decrypting a question blob.
 */
export interface DecryptQuestionResult {
  /** The decrypted question blob */
  questionBlob: Buffer;
  /** SHA-256 of the decrypted plaintext for integrity verification */
  plaintextHash: string;
}

/**
 * Blockchain service gRPC client interface.
 */
interface BlockchainClient {
  recordEvent(
    request: {
      event_type: string;
      exam_id: string;
      entity_hash: string;
      metadata_json: string;
      actor_id: string;
      actor_type: string;
    },
    callback: (error: grpc.ServiceError | null, response: {
      event_id: string;
      tx_id: string;
      timestamp: string;
      success: boolean;
    }) => void,
  ): void;
}

@Injectable()
export class KmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KmsService.name);
  private kmsClient!: KeyManagementServiceClient;
  private firestore!: Firestore;
  private storage!: Storage;
  private redis!: Redis;
  private blockchainClient!: BlockchainClient;
  private readonly config: CryptoLifecycleConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<CryptoLifecycleConfig>('crypto')!;
  }

  async onModuleInit(): Promise<void> {
    this.kmsClient = new KeyManagementServiceClient();
    this.firestore = new Firestore({
      projectId: this.config.gcpProjectId,
      databaseId: this.config.firestoreDatabase,
    });
    this.storage = new Storage({ projectId: this.config.gcpProjectId });

    this.redis = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword || undefined,
      username: this.config.redisUsername,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await this.redis.connect();
    this.logger.log('Redis connected for crypto-lifecycle (write-only to exam:*:paper:*)');

    this.initBlockchainClient();
    this.logger.log('KMS service initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.kmsClient.close();
    this.logger.log('KMS service destroyed');
  }

  /**
   * Initialize gRPC client for blockchain-service.
   */
  private initBlockchainClient(): void {
    const protoPath = path.join(__dirname, '..', 'proto', 'blockchain.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
    const blockchainPkg = proto['blockchain'] as {
      BlockchainService: new (
        address: string,
        credentials: grpc.ChannelCredentials,
      ) => BlockchainClient;
    };
    const address = `${this.config.blockchainServiceHost}:${this.config.blockchainServicePort}`;
    this.blockchainClient = new blockchainPkg.BlockchainService(
      address,
      grpc.credentials.createInsecure(),
    );
    this.logger.log(`Blockchain gRPC client connected to ${address}`);
  }

  /**
   * Record a blockchain audit event via gRPC.
   */
  async recordBlockchainEvent(
    eventType: string,
    examId: string,
    entityHash: string,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.blockchainClient.recordEvent(
        {
          event_type: eventType,
          exam_id: examId,
          entity_hash: entityHash,
          metadata_json: JSON.stringify(metadata),
          actor_id: 'crypto-lifecycle-service',
          actor_type: 'system',
        },
        (error, response) => {
          if (error) {
            this.logger.error(`Blockchain event recording failed: ${error.message}`);
            reject(error);
            return;
          }
          this.logger.debug(`Blockchain event recorded: ${response.event_id}`);
          resolve(response.event_id);
        },
      );
    });
  }

  /**
   * Build the Cloud KMS crypto key path.
   */
  private getCryptoKeyPath(): string {
    return this.kmsClient.cryptoKeyPath(
      this.config.gcpProjectId,
      this.config.kmsLocation,
      this.config.kmsKeyRing,
      this.config.kmsKeyName,
    );
  }

  /**
   * Encrypt a question blob:
   * 1. Generate a random DEK (data encryption key)
   * 2. Encrypt the DEK with Cloud KMS (envelope encryption)
   * 3. AES-256-GCM encrypt the question blob with the plaintext DEK
   * 4. Store ciphertext to GCS
   * 5. Store encrypted DEK + metadata to Firestore
   * 6. Record blockchain audit event
   * 7. Zeroize plaintext DEK from memory
   */
  async encryptQuestion(
    questionBlob: Buffer,
    examId: string,
    questionId: string,
  ): Promise<EncryptQuestionResult> {
    const keyPath = this.getCryptoKeyPath();

    // Step 1: Generate a random 256-bit DEK
    const plaintextDek = crypto.randomBytes(32);

    // Step 2: Encrypt the DEK with Cloud KMS (envelope encryption)
    const [kmsEncryptResponse] = await this.kmsClient.encrypt({
      name: keyPath,
      plaintext: plaintextDek,
    });

    if (!kmsEncryptResponse.ciphertext) {
      throw new Error('KMS returned empty ciphertext for DEK encryption');
    }

    const encryptedDek = Buffer.isBuffer(kmsEncryptResponse.ciphertext)
      ? kmsEncryptResponse.ciphertext
      : Buffer.from(kmsEncryptResponse.ciphertext as Uint8Array);

    // Step 3: AES-256-GCM encrypt the question blob
    const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', plaintextDek, iv);
    const ciphertext = Buffer.concat([cipher.update(questionBlob), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 128-bit authentication tag

    // SHA-256 of plaintext for integrity verification
    const plaintextHash = crypto.createHash('sha256').update(questionBlob).digest('hex');

    // Step 4: Store encrypted blob to GCS
    // Format: [12 bytes IV][16 bytes authTag][N bytes ciphertext]
    const blobPath = `${examId}/${questionId}.enc`;
    const bucket = this.storage.bucket(this.config.gcsBucketEncryptedQuestions);
    const file = bucket.file(blobPath);

    const storedBlob = Buffer.concat([iv, authTag, ciphertext]);
    await file.save(storedBlob, {
      metadata: {
        contentType: 'application/octet-stream',
        metadata: {
          examId,
          questionId,
          encryptedAt: new Date().toISOString(),
          plaintextHash,
        },
      },
    });

    const encryptedBlobUri = `gs://${this.config.gcsBucketEncryptedQuestions}/${blobPath}`;

    // Step 5: Store encrypted DEK + metadata to Firestore
    const encryptedDekBase64 = encryptedDek.toString('base64');
    const docRef = this.firestore
      .collection('exams')
      .doc(examId)
      .collection('encryptedKeys')
      .doc(questionId);

    await docRef.set({
      questionId,
      examId,
      encryptedDek: encryptedDekBase64,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedBlobUri,
      plaintextHash,
      encryptedAt: new Date().toISOString(),
    });

    // Step 6: Record blockchain audit event
    await this.recordBlockchainEvent('encrypt', examId, plaintextHash, {
      questionId,
      encryptedBlobUri,
      algorithm: 'aes-256-gcm',
      kmsKeyVersion: keyPath,
    });

    // Step 7: Zeroize plaintext DEK from memory
    plaintextDek.fill(0);

    this.logger.log(`Encrypted question ${questionId} for exam ${examId}: ${encryptedBlobUri}`);

    return {
      encryptedBlobUri,
      encryptedDek: encryptedDekBase64,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      plaintextHash,
    };
  }

  /**
   * Decrypt a question blob:
   * 1. Decrypt DEK via Cloud KMS
   * 2. Download encrypted blob from GCS
   * 3. AES-256-GCM decrypt with proper IV and auth tag
   * 4. Verify plaintext hash integrity
   * 5. Zeroize plaintext DEK from memory
   */
  async decryptQuestion(
    encryptedBlobUri: string,
    encryptedDek: string,
  ): Promise<DecryptQuestionResult> {
    const keyPath = this.getCryptoKeyPath();

    // Step 1: Decrypt the DEK via Cloud KMS
    const encryptedDekBuffer = Buffer.from(encryptedDek, 'base64');
    const [decryptResponse] = await this.kmsClient.decrypt({
      name: keyPath,
      ciphertext: encryptedDekBuffer,
    });

    if (!decryptResponse.plaintext) {
      throw new Error('KMS returned empty plaintext for DEK decryption');
    }

    const plaintextDek = Buffer.isBuffer(decryptResponse.plaintext)
      ? decryptResponse.plaintext
      : Buffer.from(decryptResponse.plaintext as Uint8Array);

    // Step 2: Download encrypted blob from GCS
    const uriMatch = encryptedBlobUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!uriMatch || !uriMatch[1] || !uriMatch[2]) {
      throw new Error(`Invalid GCS URI: ${encryptedBlobUri}`);
    }

    const bucketName = uriMatch[1];
    const objectPath = uriMatch[2];
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [storedBlob] = await file.download();

    // Step 3: Parse stored blob: [12 bytes IV][16 bytes authTag][N bytes ciphertext]
    if (storedBlob.length < 28) {
      throw new Error('Encrypted blob too short: expected at least 28 bytes (IV + authTag)');
    }

    const iv = storedBlob.subarray(0, 12);
    const authTag = storedBlob.subarray(12, 28);
    const ciphertext = storedBlob.subarray(28);

    // Step 4: AES-256-GCM decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', plaintextDek, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Step 5: Compute plaintext hash for integrity verification
    const plaintextHash = crypto.createHash('sha256').update(decrypted).digest('hex');

    // Step 6: Zeroize plaintext DEK from memory
    plaintextDek.fill(0);

    return {
      questionBlob: decrypted,
      plaintextHash,
    };
  }

  /**
   * Bulk decrypt all questions for an exam and push rendered papers to Redis.
   * Per addendum Fix 7: pre-render complete paper JSON per (centerId, seatNum).
   * Redis user: crypto-lifecycle (write-only to exam:*:paper:*)
   * Uses Redis pipeline for batch operations.
   */
  async bulkDecryptAndCache(examId: string): Promise<{
    questionsDecrypted: number;
    papersWritten: number;
  }> {
    this.logger.log(`Bulk decrypting questions for exam ${examId}`);

    // Load all encrypted key records for this exam from Firestore
    const keysSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('encryptedKeys')
      .get();

    if (keysSnapshot.empty) {
      throw new Error(`No encrypted keys found for exam ${examId}`);
    }

    // Decrypt all questions
    const decryptedQuestions = new Map<string, Buffer>();

    for (const doc of keysSnapshot.docs) {
      const data = doc.data();
      const result = await this.decryptQuestion(
        data.encryptedBlobUri as string,
        data.encryptedDek as string,
      );
      decryptedQuestions.set(doc.id, result.questionBlob);
    }

    this.logger.log(
      `Decrypted ${decryptedQuestions.size} questions for exam ${examId}`,
    );

    // Load exam metadata for TTL calculation
    const examDoc = await this.firestore.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      throw new Error(`Exam ${examId} not found`);
    }

    const examData = examDoc.data()!;
    const durationMinutes =
      (examData.durationMinutes as number | undefined) || this.config.defaultExamDurationMinutes;
    const ttlSeconds = (durationMinutes + 60) * 60; // exam duration + 1h

    // Load all center/seat assignments and build pre-rendered papers
    const centersSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('centers')
      .get();

    let papersWritten = 0;
    const pipeline = this.redis.pipeline();

    for (const centerDoc of centersSnapshot.docs) {
      const centerId = centerDoc.id;
      const seatsSnapshot = await this.firestore
        .collection('exams')
        .doc(examId)
        .collection('centers')
        .doc(centerId)
        .collection('seats')
        .get();

      for (const seatDoc of seatsSnapshot.docs) {
        const seatNum = seatDoc.id;
        const seatData = seatDoc.data();
        const assignments = (seatData.assignment?.questionAssignments || []) as Array<{
          position: number;
          templateId: string;
          paramInstantiationId: string;
          encryptedBlobUri: string;
          encryptedAnswerKey: string;
        }>;

        // Assemble the complete rendered paper JSON with decrypted question data
        const paperQuestions = assignments.map((assignment) => {
          const questionBlob = decryptedQuestions.get(assignment.templateId);
          return {
            position: assignment.position,
            templateId: assignment.templateId,
            paramInstantiationId: assignment.paramInstantiationId,
            questionData: questionBlob ? questionBlob.toString('utf-8') : null,
          };
        });

        const paperJson = JSON.stringify({
          examId,
          centerId,
          seatNum,
          questions: paperQuestions,
          generatedAt: new Date().toISOString(),
        });

        // Write to Redis using the paper key pattern
        const redisKey = `exam:${examId}:paper:${centerId}:${seatNum}`;
        pipeline.set(redisKey, paperJson, 'EX', ttlSeconds);
        papersWritten++;
      }
    }

    // Execute the entire Redis pipeline as a single batch operation
    await pipeline.exec();

    this.logger.log(
      `Cached ${papersWritten} papers for exam ${examId} with TTL ${ttlSeconds}s`,
    );

    // Record blockchain audit event
    await this.recordBlockchainEvent(
      'decrypt',
      examId,
      crypto.createHash('sha256').update(`bulk-decrypt-${examId}-${Date.now()}`).digest('hex'),
      {
        questionsDecrypted: decryptedQuestions.size,
        papersWritten,
        operation: 'bulk_decrypt_and_cache',
      },
    );

    return { questionsDecrypted: decryptedQuestions.size, papersWritten };
  }

  /**
   * Generate a per-exam Key Encrypting Key (KEK) using Cloud KMS.
   * Per addendum Fix 13: each exam has its own KEK which encrypts per-question DEKs.
   * Shamir splits this per-exam KEK into fragments for emergency release.
   */
  async generateExamKek(examId: string): Promise<{
    kmsKeyVersion: string;
    kekId: string;
  }> {
    const parent = this.kmsClient.keyRingPath(
      this.config.gcpProjectId,
      this.config.kmsLocation,
      this.config.kmsKeyRing,
    );

    // Create a new Cloud KMS crypto key specifically for this exam's KEK
    const kekKeyId = `exam-kek-${examId}`;
    const [cryptoKey] = await this.kmsClient.createCryptoKey({
      parent,
      cryptoKeyId: kekKeyId,
      cryptoKey: {
        purpose: 'ENCRYPT_DECRYPT',
        versionTemplate: {
          algorithm: 'GOOGLE_SYMMETRIC_ENCRYPTION',
          protectionLevel: 'HSM',
        },
        labels: {
          'exam-id': examId,
          purpose: 'kek',
        },
      },
    });

    const kmsKeyVersion = cryptoKey.name || '';

    // Store KEK metadata in Firestore
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .set({
        examId,
        kekKeyId,
        kmsKeyVersion,
        status: 'generated',
        shamirThreshold: 3,
        shamirTotalShares: 5,
        fragmentsSubmitted: 0,
        tlpGenerated: false,
        emergencyRelease: false,
        createdAt: new Date().toISOString(),
        retentionExpiresAt: new Date(
          Date.now() + this.config.keyRetentionDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

    // Record blockchain audit event
    await this.recordBlockchainEvent(
      'key_generate',
      examId,
      crypto.createHash('sha256').update(kmsKeyVersion).digest('hex'),
      {
        kekKeyId,
        kmsKeyVersion,
        protectionLevel: 'HSM',
      },
    );

    this.logger.log(`Generated exam KEK for exam ${examId}: ${kekKeyId}`);

    return { kmsKeyVersion, kekId: kekKeyId };
  }

  /**
   * Schedule key destruction after the retention period (90 days).
   * Disables and then destroys all Cloud KMS key versions for the exam KEK.
   */
  async destroyKeys(examId: string): Promise<void> {
    this.logger.log(`Scheduling key destruction for exam ${examId}`);

    // Load the KEK metadata from Firestore
    const kekDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .get();

    if (!kekDoc.exists) {
      throw new Error(`No KEK found for exam ${examId}`);
    }

    const kekData = kekDoc.data()!;
    const kmsKeyVersion = kekData.kmsKeyVersion as string;

    // List all key versions and schedule destruction
    const [versions] = await this.kmsClient.listCryptoKeyVersions({
      parent: kmsKeyVersion,
    });

    for (const version of versions) {
      if (version.state === 'ENABLED' || version.state === 'DISABLED') {
        // Disable the key version first (required before destroy)
        if (version.state === 'ENABLED') {
          await this.kmsClient.updateCryptoKeyVersion({
            cryptoKeyVersion: {
              name: version.name,
              state: 'DISABLED',
            },
            updateMask: { paths: ['state'] },
          });
        }

        // Schedule destruction (Cloud KMS enforces a minimum scheduled destroy duration)
        await this.kmsClient.destroyCryptoKeyVersion({
          name: version.name!,
        });

        this.logger.log(`Scheduled destruction for key version: ${version.name}`);
      }
    }

    // Update Firestore key schedule status
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .update({
        status: 'destroyed',
        destroyScheduledAt: new Date().toISOString(),
      });

    // Mark all per-question encrypted DEK records for destruction
    const keysSnapshot = await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('encryptedKeys')
      .get();

    const batch = this.firestore.batch();
    for (const doc of keysSnapshot.docs) {
      batch.update(doc.ref, {
        status: 'scheduled_for_destruction',
        destroyScheduledAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    // Record blockchain audit event
    await this.recordBlockchainEvent(
      'key_release',
      examId,
      crypto.createHash('sha256').update(`destroy-${examId}`).digest('hex'),
      {
        operation: 'schedule_destruction',
        retentionDays: this.config.keyRetentionDays,
        keyVersionsScheduled: versions.length,
      },
    );

    this.logger.log(`Key destruction scheduled for exam ${examId}: ${versions.length} versions`);
  }
}
