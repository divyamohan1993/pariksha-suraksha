import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Firestore } from '@google-cloud/firestore';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { gf256EvalPoly, gf256LagrangeInterpolateAtZero } from './gf256';
import { KmsService } from '../kms/kms.service';
import type { CryptoLifecycleConfig } from '../config/configuration';

/**
 * A single fragment produced by Shamir's Secret Sharing.
 */
export interface ShamirFragment {
  /** Unique fragment identifier */
  fragmentId: string;
  /** The exam this fragment belongs to */
  examId: string;
  /** Share index (1-based, used as the x-coordinate in GF(256)) */
  index: number;
  /** The share data (one byte per byte of the secret) */
  data: Buffer;
  /** Role of the designated holder */
  holderRole: string;
}

/**
 * Collected fragment awaiting reconstruction.
 */
interface CollectedFragment {
  index: number;
  data: Buffer;
  collectedAt: string;
  holderRole: string;
}

/**
 * Shamir's Secret Sharing service implementing 3-of-5 threshold scheme.
 *
 * Uses GF(256) finite field arithmetic for byte-level splitting.
 * Each byte of the master key is independently split using a random
 * polynomial of degree (threshold - 1) over GF(256).
 *
 * Per addendum Fix 13: Shamir splits the per-exam KEK (Key Encrypting Key),
 * not a global master key. Each exam has its own KEK and fragment set.
 */
@Injectable()
export class ShamirService implements OnModuleInit {
  private readonly logger = new Logger(ShamirService.name);
  private firestore!: Firestore;
  private readonly config: CryptoLifecycleConfig;

  /** In-memory store of collected fragments per exam, pending reconstruction */
  private readonly pendingFragments = new Map<string, CollectedFragment[]>();

  /** Default holder roles for the 5 fragments */
  private static readonly HOLDER_ROLES = [
    'exam_controller_1',
    'exam_controller_2',
    'nta_official_1',
    'nta_official_2',
    'independent_auditor',
  ] as const;

  constructor(
    private readonly configService: ConfigService,
    private readonly kmsService: KmsService,
  ) {
    this.config = this.configService.get<CryptoLifecycleConfig>('crypto')!;
  }

  async onModuleInit(): Promise<void> {
    this.firestore = new Firestore({
      projectId: this.config.gcpProjectId,
      databaseId: this.config.firestoreDatabase,
    });
    this.logger.log('Shamir service initialized');
  }

  /**
   * Split a master key into shares using Shamir's Secret Sharing over GF(256).
   *
   * For each byte of the key, a random polynomial of degree (threshold - 1)
   * is constructed with the byte as the constant term. Each share receives
   * the polynomial evaluated at a distinct non-zero x-coordinate.
   *
   * @param masterKey  The secret key to split (arbitrary length)
   * @param threshold  Minimum number of shares needed to reconstruct (default: 3)
   * @param shares     Total number of shares to produce (default: 5)
   * @returns Array of ShamirFragment objects
   */
  splitKey(
    masterKey: Buffer,
    threshold: number = 3,
    shares: number = 5,
    examId: string = '',
  ): ShamirFragment[] {
    if (threshold < 2) {
      throw new Error('Threshold must be at least 2');
    }
    if (shares < threshold) {
      throw new Error('Number of shares must be >= threshold');
    }
    if (shares > 255) {
      throw new Error('Cannot have more than 255 shares in GF(256)');
    }
    if (masterKey.length === 0) {
      throw new Error('Master key must not be empty');
    }

    const keyLength = masterKey.length;

    // Initialize share data buffers
    const shareBuffers: Buffer[] = [];
    for (let s = 0; s < shares; s++) {
      shareBuffers.push(Buffer.alloc(keyLength));
    }

    // For each byte of the master key, create a random polynomial and evaluate
    for (let byteIdx = 0; byteIdx < keyLength; byteIdx++) {
      // Build polynomial coefficients: coefficients[0] = secret byte,
      // coefficients[1..threshold-1] = random bytes from CSPRNG
      const coefficients: number[] = new Array(threshold);
      coefficients[0] = masterKey[byteIdx]!;

      // Generate cryptographically random coefficients for higher-degree terms
      const randomCoeffs = crypto.randomBytes(threshold - 1);
      for (let c = 1; c < threshold; c++) {
        coefficients[c] = randomCoeffs[c - 1]!;
      }

      // Evaluate the polynomial at x = 1, 2, ..., shares
      // x-coordinates are 1-based (x=0 would reveal the secret directly)
      for (let s = 0; s < shares; s++) {
        const x = s + 1; // x-coordinates: 1, 2, 3, 4, 5
        shareBuffers[s]![byteIdx] = gf256EvalPoly(coefficients, x);
      }

      // Zeroize polynomial coefficients
      coefficients.fill(0);
    }

    // Build the fragment objects
    const fragments: ShamirFragment[] = [];
    for (let s = 0; s < shares; s++) {
      const holderRole =
        s < ShamirService.HOLDER_ROLES.length
          ? ShamirService.HOLDER_ROLES[s]!
          : `holder_${s + 1}`;

      fragments.push({
        fragmentId: uuidv4(),
        examId,
        index: s + 1,
        data: shareBuffers[s]!,
        holderRole,
      });
    }

    this.logger.log(
      `Split ${keyLength}-byte key into ${shares} shares (threshold=${threshold})` +
        (examId ? ` for exam ${examId}` : ''),
    );

    return fragments;
  }

  /**
   * Reconstruct the master key from a set of Shamir fragments.
   *
   * Uses Lagrange interpolation at x=0 in GF(256) for each byte position.
   * Requires at least `threshold` fragments.
   *
   * @param fragments Array of at least `threshold` fragments
   * @returns The reconstructed master key
   */
  reconstructKey(fragments: ShamirFragment[]): Buffer {
    if (fragments.length < 2) {
      throw new Error('Need at least 2 fragments to reconstruct');
    }

    // Verify all fragments have the same data length
    const dataLength = fragments[0]!.data.length;
    for (const f of fragments) {
      if (f.data.length !== dataLength) {
        throw new Error(
          `Fragment length mismatch: expected ${dataLength}, got ${f.data.length} for index ${f.index}`,
        );
      }
    }

    // Check for duplicate indices
    const indices = new Set(fragments.map((f) => f.index));
    if (indices.size !== fragments.length) {
      throw new Error('Duplicate fragment indices detected');
    }

    // Extract x-coordinates and prepare result buffer
    const xs = fragments.map((f) => f.index);
    const result = Buffer.alloc(dataLength);

    // Lagrange interpolation at x=0 for each byte position
    for (let byteIdx = 0; byteIdx < dataLength; byteIdx++) {
      const ys = fragments.map((f) => f.data[byteIdx]!);
      result[byteIdx] = gf256LagrangeInterpolateAtZero(xs, ys);
    }

    this.logger.log(
      `Reconstructed ${dataLength}-byte key from ${fragments.length} fragments`,
    );

    return result;
  }

  /**
   * Collect a fragment from a holder for emergency reconstruction.
   * Stores the fragment in memory and in Firestore for durability.
   *
   * @param examId       The exam the fragment belongs to
   * @param fragmentIndex The 1-based index of the fragment
   * @param fragmentData The fragment data (Buffer)
   * @param holderRole   The role of the person submitting
   * @returns Number of fragments collected so far
   */
  async collectFragment(
    examId: string,
    fragmentIndex: number,
    fragmentData: Buffer,
    holderRole: string,
  ): Promise<{ fragmentsCollected: number; thresholdMet: boolean }> {
    this.logger.log(
      `Collecting fragment ${fragmentIndex} from ${holderRole} for exam ${examId}`,
    );

    // Validate fragment index
    if (fragmentIndex < 1 || fragmentIndex > 5) {
      throw new Error(`Invalid fragment index: ${fragmentIndex}. Must be 1-5.`);
    }

    // Get or create the pending fragments list for this exam
    let collected = this.pendingFragments.get(examId);
    if (!collected) {
      collected = [];
      this.pendingFragments.set(examId, collected);
    }

    // Check for duplicate submission
    const existing = collected.find((f) => f.index === fragmentIndex);
    if (existing) {
      throw new Error(
        `Fragment ${fragmentIndex} for exam ${examId} has already been submitted`,
      );
    }

    // Store the fragment
    const fragment: CollectedFragment = {
      index: fragmentIndex,
      data: fragmentData,
      collectedAt: new Date().toISOString(),
      holderRole,
    };
    collected.push(fragment);

    // Persist to Firestore for durability
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('emergencyFragments')
      .doc(`fragment-${fragmentIndex}`)
      .set({
        fragmentIndex,
        holderRole,
        dataHash: crypto.createHash('sha256').update(fragmentData).digest('hex'),
        collectedAt: fragment.collectedAt,
        // Note: actual fragment data is NOT stored in Firestore for security.
        // Only the hash is stored for audit purposes.
      });

    // Record blockchain audit event
    await this.kmsService.recordBlockchainEvent(
      'emergency_release',
      examId,
      crypto.createHash('sha256').update(fragmentData).digest('hex'),
      {
        operation: 'fragment_collected',
        fragmentIndex,
        holderRole,
        fragmentsCollected: collected.length,
        thresholdRequired: 3,
      },
    );

    const thresholdMet = collected.length >= 3;

    this.logger.log(
      `Fragment ${fragmentIndex} collected for exam ${examId}: ${collected.length}/3 threshold`,
    );

    return { fragmentsCollected: collected.length, thresholdMet };
  }

  /**
   * Attempt emergency reconstruction of the per-exam KEK.
   * Requires at least 3 of 5 fragments to have been collected.
   *
   * If successful:
   * 1. Reconstructs the master key
   * 2. Records the emergency_release blockchain event
   * 3. Clears collected fragments from memory
   * 4. Returns the reconstructed key
   *
   * All emergency operations are blockchain-audited.
   */
  async attemptReconstruction(examId: string): Promise<{
    success: boolean;
    reconstructedKey?: Buffer;
    fragmentsUsed: number;
  }> {
    const collected = this.pendingFragments.get(examId);

    if (!collected || collected.length < 3) {
      const count = collected?.length ?? 0;
      this.logger.warn(
        `Cannot reconstruct for exam ${examId}: only ${count}/3 fragments available`,
      );
      return { success: false, fragmentsUsed: count };
    }

    this.logger.log(
      `Attempting emergency reconstruction for exam ${examId} with ${collected.length} fragments`,
    );

    // Build ShamirFragment objects from collected data
    const fragments: ShamirFragment[] = collected.map((c) => ({
      fragmentId: uuidv4(),
      examId,
      index: c.index,
      data: c.data,
      holderRole: c.holderRole,
    }));

    // Use only the first 3 fragments (threshold) for reconstruction
    // (using more than threshold is fine and should yield the same result)
    const reconstructedKey = this.reconstructKey(fragments);

    // Record the emergency reconstruction as a blockchain event
    const keyHash = crypto.createHash('sha256').update(reconstructedKey).digest('hex');
    await this.kmsService.recordBlockchainEvent(
      'emergency_release',
      examId,
      keyHash,
      {
        operation: 'key_reconstructed',
        fragmentsUsed: collected.length,
        fragmentIndices: collected.map((c) => c.index),
        holderRoles: collected.map((c) => c.holderRole),
        reconstructedAt: new Date().toISOString(),
      },
    );

    // Update the key schedule in Firestore
    await this.firestore
      .collection('exams')
      .doc(examId)
      .collection('keySchedule')
      .doc('kek')
      .update({
        status: 'released',
        emergencyRelease: true,
        actualReleaseTime: new Date().toISOString(),
        fragmentsUsed: collected.length,
      });

    // Clear collected fragments from memory (security: minimize key material exposure)
    for (const c of collected) {
      c.data.fill(0);
    }
    this.pendingFragments.delete(examId);

    this.logger.log(
      `Emergency reconstruction successful for exam ${examId}: ${collected.length} fragments used`,
    );

    return {
      success: true,
      reconstructedKey,
      fragmentsUsed: collected.length,
    };
  }

  /**
   * Get the current emergency release status for an exam.
   */
  async getEmergencyStatus(examId: string): Promise<{
    fragmentsCollected: number;
    thresholdRequired: number;
    thresholdMet: boolean;
    submittedIndices: number[];
  }> {
    const collected = this.pendingFragments.get(examId) || [];
    return {
      fragmentsCollected: collected.length,
      thresholdRequired: 3,
      thresholdMet: collected.length >= 3,
      submittedIndices: collected.map((c) => c.index),
    };
  }
}
