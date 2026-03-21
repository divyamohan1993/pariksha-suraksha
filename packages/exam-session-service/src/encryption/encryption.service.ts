import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  createHash,
} from 'crypto';

/** AES-256-GCM IV size in bytes. */
const IV_LENGTH = 12;
/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_LENGTH = 16;
/** AES-256 key size in bytes. */
const KEY_LENGTH = 32;

export interface EncryptedPayload {
  /** The ciphertext with auth tag appended. */
  encrypted: Buffer;
  /** The 12-byte IV used for this encryption. */
  iv: Buffer;
  /** The 16-byte GCM authentication tag. */
  authTag: Buffer;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Encrypt a response buffer using AES-256-GCM with a random 12-byte IV.
   * Returns the ciphertext, IV, and auth tag as separate fields.
   */
  encryptResponse(response: Buffer, key: Buffer): EncryptedPayload {
    if (key.length !== KEY_LENGTH) {
      throw new InternalServerErrorException(
        `Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`,
      );
    }

    const iv = randomBytes(IV_LENGTH);

    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      const encrypted = Buffer.concat([
        cipher.update(response),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return { encrypted, iv, authTag };
    } catch (error) {
      this.logger.error('Encryption failed', (error as Error).stack);
      throw new InternalServerErrorException('Response encryption failed');
    }
  }

  /**
   * Decrypt an AES-256-GCM encrypted response buffer.
   * Throws on tampered ciphertext or incorrect key.
   */
  decryptResponse(
    encrypted: Buffer,
    key: Buffer,
    iv: Buffer,
    authTag: Buffer,
  ): Buffer {
    if (key.length !== KEY_LENGTH) {
      throw new InternalServerErrorException(
        `Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`,
      );
    }
    if (iv.length !== IV_LENGTH) {
      throw new InternalServerErrorException(
        `Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`,
      );
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new InternalServerErrorException(
        `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`,
      );
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', (error as Error).stack);
      throw new InternalServerErrorException(
        'Response decryption failed — possible tampering or wrong key',
      );
    }
  }

  /**
   * Derive a per-candidate encryption key from the exam KEK and candidate salt.
   *
   * Uses HMAC-SHA256(KEK, candidateId || examId) to produce a deterministic
   * 256-bit key unique to each (candidate, exam) pair.
   *
   * In production the KEK is fetched from Cloud KMS; here we read from config.
   */
  generateCandidateKey(candidateId: string, examId: string): Buffer {
    const kekBase64 = this.config.get<string>('encryption.examKekBase64');

    let kek: Buffer;
    if (kekBase64 && kekBase64.length > 0) {
      kek = Buffer.from(kekBase64, 'base64');
    } else {
      // Development fallback: derive a deterministic KEK from a fixed seed.
      // NEVER use this in production.
      this.logger.warn(
        'EXAM_KEK_BASE64 not set — using development fallback key derivation',
      );
      kek = createHash('sha256')
        .update('pariksha-dev-kek-seed')
        .digest();
    }

    if (kek.length !== KEY_LENGTH) {
      throw new InternalServerErrorException(
        `Invalid KEK length: expected ${KEY_LENGTH} bytes, got ${kek.length}`,
      );
    }

    // HMAC-SHA256(KEK, candidateId || examId) -> 32-byte candidate-specific key
    const candidateKey = createHmac('sha256', kek)
      .update(`${candidateId}||${examId}`)
      .digest();

    return candidateKey;
  }

  /**
   * Pack IV + authTag + ciphertext into a single buffer for storage.
   * Layout: [IV (12 bytes)] [AuthTag (16 bytes)] [Ciphertext (N bytes)]
   */
  packEncrypted(payload: EncryptedPayload): Buffer {
    return Buffer.concat([payload.iv, payload.authTag, payload.encrypted]);
  }

  /**
   * Unpack a single buffer into IV, authTag, and ciphertext.
   */
  unpackEncrypted(packed: Buffer): {
    iv: Buffer;
    authTag: Buffer;
    encrypted: Buffer;
  } {
    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new InternalServerErrorException(
        'Packed encrypted buffer too short',
      );
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    return { iv, authTag, encrypted };
  }
}
