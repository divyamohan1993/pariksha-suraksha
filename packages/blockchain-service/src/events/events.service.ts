import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FabricService, AuditEvent } from '../fabric/fabric.service';
import { MerkleService, MerkleProof } from '../merkle/merkle.service';

/** Human-readable descriptions for each audit event type. */
const EVENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  question_create: 'Question template created and added to the bank',
  encrypt: 'Question encrypted with AES-256-GCM',
  key_generate: 'Data encryption key generated via Cloud KMS',
  distribute: 'Encrypted question distributed to exam center',
  key_release: 'Decryption key released at scheduled exam start time',
  decrypt: 'Question decrypted at exam terminal',
  submit: 'Candidate response submitted and recorded',
  grade: 'Response graded and score computed',
  scribe_action: 'Scribe action recorded for PwD candidate',
  emergency_release: 'Emergency key release via Shamir 3-of-5 reconstruction',
};

/** Full verification result including event data and Merkle proof. */
export interface VerificationResult {
  eventId: string;
  event: AuditEvent;
  merkleProof: MerkleProof;
  verified: boolean;
  verifiedAt: string;
}

/** Timeline entry: event with human-readable description. */
export interface TimelineEntry {
  event: AuditEvent;
  description: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly fabricService: FabricService,
    private readonly merkleService: MerkleService,
  ) {}

  /**
   * Record a new audit event to the blockchain.
   */
  async recordEvent(
    eventType: string,
    examId: string,
    entityHash: string,
    metadata: string,
  ) {
    return this.fabricService.recordEvent(eventType, examId, entityHash, metadata);
  }

  /**
   * Get all audit events for a given exam, ordered by timestamp.
   */
  async getEventsByExam(examId: string): Promise<AuditEvent[]> {
    const events = await this.fabricService.queryEventsByExam(examId);
    // Sort chronologically
    return events.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Verify an event: retrieve the event, generate a Merkle proof,
   * and verify the proof against the block header.
   */
  async verifyEvent(eventId: string): Promise<VerificationResult> {
    // Retrieve the event
    const event = await this.fabricService.queryEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event not found: ${eventId}`);
    }

    // Generate and verify Merkle proof
    const merkleProof = await this.merkleService.getMerkleProof(eventId);
    const verification = this.merkleService.verifyMerkleProof(merkleProof);

    return {
      eventId,
      event,
      merkleProof,
      verified: verification.verified,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the raw Merkle proof for an event (without full verification response).
   */
  async getMerkleProof(eventId: string): Promise<MerkleProof> {
    return this.merkleService.getMerkleProof(eventId);
  }

  /**
   * Get a chronological timeline of all events for an exam,
   * with human-readable descriptions for each event type.
   */
  async getTimeline(examId: string): Promise<{
    examId: string;
    entries: TimelineEntry[];
    totalCount: number;
  }> {
    const events = await this.getEventsByExam(examId);

    const entries: TimelineEntry[] = events.map((event) => ({
      event,
      description:
        EVENT_TYPE_DESCRIPTIONS[event.eventType] ||
        `Unknown event type: ${event.eventType}`,
    }));

    return {
      examId,
      entries,
      totalCount: entries.length,
    };
  }

  /**
   * Get events within a time range.
   */
  async getEventsByTimeRange(
    startTime: string,
    endTime: string,
  ): Promise<AuditEvent[]> {
    return this.fabricService.queryEventsByTimeRange(startTime, endTime);
  }

  /**
   * Get event count for an exam.
   */
  async getEventCount(examId: string): Promise<number> {
    return this.fabricService.getEventCount(examId);
  }
}
