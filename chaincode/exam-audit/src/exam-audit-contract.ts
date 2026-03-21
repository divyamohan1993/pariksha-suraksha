import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import * as crypto from 'crypto';

// ─── Event Types ─────────────────────────────────────────────────────────

/**
 * Valid audit event types for the ParikshaSuraksha exam lifecycle.
 * Each mutation in the system produces one of these event types,
 * creating a complete, immutable audit trail.
 */
const VALID_EVENT_TYPES = [
  'question_create',
  'encrypt',
  'key_generate',
  'distribute',
  'key_release',
  'decrypt',
  'submit',
  'grade',
  'scribe_action',
  'emergency_release',
] as const;

type EventType = (typeof VALID_EVENT_TYPES)[number];

// ─── Audit Event Interface ───────────────────────────────────────────────

interface AuditEvent {
  eventId: string;
  eventType: EventType;
  examId: string;
  entityHash: string;
  timestamp: string;
  actorId: string;
  actorOrg: string;
  metadata: string;
  txId: string;
}

// ─── Contract Implementation ─────────────────────────────────────────────

@Info({
  title: 'ExamAuditContract',
  description:
    'Hyperledger Fabric chaincode for ParikshaSuraksha immutable exam audit trail. ' +
    'Records lifecycle events (question creation, encryption, key release, submission, grading) ' +
    'with composite key indexes for efficient exam-scoped, type-scoped, and temporal queries.',
})
export class ExamAuditContract extends Contract {
  constructor() {
    super('ExamAuditContract');
  }

  /**
   * Record a new audit event to the ledger.
   *
   * Endorsement policy for writes: AND(ParikshaSurakshaMSP.peer, NTAMSP.peer)
   * Both ParikshaSuraksha and NTA peers must endorse every write transaction,
   * ensuring no single organization can unilaterally modify the audit trail.
   *
   * @param ctx - Transaction context (provides client identity, stub, txId)
   * @param eventType - One of the VALID_EVENT_TYPES
   * @param examId - Exam identifier this event belongs to
   * @param entityHash - SHA-256 hash of the affected entity (question, key, response, etc.)
   * @param metadata - JSON string with event-specific metadata
   * @returns The recorded AuditEvent including generated eventId and transaction info
   */
  @Transaction()
  @Returns('string')
  async recordEvent(
    ctx: Context,
    eventType: string,
    examId: string,
    entityHash: string,
    metadata: string,
  ): Promise<string> {
    // Validate event type
    if (!VALID_EVENT_TYPES.includes(eventType as EventType)) {
      throw new Error(
        `Invalid event type: "${eventType}". ` +
          `Valid types: ${VALID_EVENT_TYPES.join(', ')}`,
      );
    }

    // Validate required fields
    if (!examId || examId.trim().length === 0) {
      throw new Error('examId is required');
    }
    if (!entityHash || entityHash.trim().length === 0) {
      throw new Error('entityHash is required');
    }

    // Validate entityHash is a valid SHA-256 hex string (64 chars)
    if (!/^[a-fA-F0-9]{64}$/.test(entityHash)) {
      throw new Error(
        'entityHash must be a valid SHA-256 hash (64 hex characters)',
      );
    }

    // Validate metadata is valid JSON
    try {
      JSON.parse(metadata);
    } catch {
      throw new Error('metadata must be a valid JSON string');
    }

    // Generate unique event ID using txId + timestamp to guarantee uniqueness
    const txId = ctx.stub.getTxID();
    const txTimestamp = ctx.stub.getTxTimestamp();
    const timestamp = new Date(
      txTimestamp.seconds.toNumber() * 1000 +
        Math.floor(txTimestamp.nanos / 1_000_000),
    ).toISOString();

    // Generate deterministic eventId from txId (unique per transaction)
    const eventId = crypto
      .createHash('sha256')
      .update(`${txId}:${eventType}:${examId}:${timestamp}`)
      .digest('hex')
      .substring(0, 32);

    // Extract actor identity from the transaction's client certificate
    const actorId = ctx.clientIdentity.getID();
    const actorOrg = ctx.clientIdentity.getMSPID();

    // Construct the event
    const event: AuditEvent = {
      eventId,
      eventType: eventType as EventType,
      examId,
      entityHash,
      timestamp,
      actorId,
      actorOrg,
      metadata,
      txId,
    };

    // Serialize deterministically for consistent hashing across peers
    const eventBytes = Buffer.from(deterministicStringify(event));

    // Store the event keyed by eventId (primary key)
    await ctx.stub.putState(eventId, eventBytes);

    // ─── Composite Keys for Efficient Queries ───────────────────────

    // exam~event: enables getEventsByExam(examId) range queries
    const examEventKey = ctx.stub.createCompositeKey('exam~event', [
      examId,
      eventId,
    ]);
    await ctx.stub.putState(examEventKey, eventBytes);

    // type~event: enables filtering by event type
    const typeEventKey = ctx.stub.createCompositeKey('type~event', [
      eventType,
      eventId,
    ]);
    await ctx.stub.putState(typeEventKey, eventBytes);

    // time~event: enables temporal range queries
    // Use ISO-8601 timestamp as key prefix for natural sort order
    const timeEventKey = ctx.stub.createCompositeKey('time~event', [
      timestamp,
      eventId,
    ]);
    await ctx.stub.putState(timeEventKey, eventBytes);

    // Emit chaincode event for external listeners (e.g., monitoring dashboards)
    ctx.stub.setEvent('AuditEventRecorded', eventBytes);

    return JSON.stringify(event);
  }

  /**
   * Get a single event by its eventId.
   * Read-only: endorsement policy OR(ParikshaSurakshaMSP, NTAMSP, AuditorMSP).
   *
   * @param ctx - Transaction context
   * @param eventId - The unique event identifier
   * @returns The AuditEvent as a JSON string, or empty object if not found
   */
  @Transaction(false)
  @Returns('string')
  async getEvent(ctx: Context, eventId: string): Promise<string> {
    const eventBytes = await ctx.stub.getState(eventId);

    if (!eventBytes || eventBytes.length === 0) {
      return JSON.stringify({});
    }

    return eventBytes.toString();
  }

  /**
   * Verify an event exists on the ledger and return it with transaction metadata.
   * This is used by the Blockchain Service's MerkleService to get the txId
   * for block retrieval and Merkle proof construction.
   *
   * @param ctx - Transaction context
   * @param eventId - The unique event identifier
   * @returns Verification result with event data and txId for SDK-level proof
   */
  @Transaction(false)
  @Returns('string')
  async verifyEvent(ctx: Context, eventId: string): Promise<string> {
    const eventBytes = await ctx.stub.getState(eventId);

    if (!eventBytes || eventBytes.length === 0) {
      return JSON.stringify({
        verified: false,
        reason: 'Event not found on ledger',
        eventId,
      });
    }

    const event: AuditEvent = JSON.parse(eventBytes.toString());

    // Verify the entityHash is consistent (re-hash would require original data)
    // Here we confirm the event structure is intact
    if (
      !event.eventId ||
      !event.eventType ||
      !event.examId ||
      !event.entityHash
    ) {
      return JSON.stringify({
        verified: false,
        reason: 'Event structure is corrupted',
        eventId,
      });
    }

    return JSON.stringify({
      verified: true,
      event,
      txId: event.txId,
      eventId: event.eventId,
    });
  }

  /**
   * Get all events for a specific exam using composite key range query.
   * Uses the exam~event composite key for O(E) retrieval where E = events for this exam.
   *
   * @param ctx - Transaction context
   * @param examId - The exam identifier
   * @returns JSON array of AuditEvents for this exam
   */
  @Transaction(false)
  @Returns('string')
  async getEventsByExam(ctx: Context, examId: string): Promise<string> {
    const events: AuditEvent[] = [];

    const iterator = await ctx.stub.getStateByPartialCompositeKey(
      'exam~event',
      [examId],
    );

    let result = await iterator.next();
    while (!result.done) {
      if (result.value && result.value.value) {
        try {
          const event: AuditEvent = JSON.parse(
            result.value.value.toString('utf8'),
          );
          events.push(event);
        } catch {
          // Skip malformed entries
        }
      }
      result = await iterator.next();
    }

    await iterator.close();

    // Sort by timestamp (ISO-8601 strings sort lexicographically)
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return JSON.stringify(events);
  }

  /**
   * Get events within a time range using the time~event composite key.
   * The ISO-8601 timestamp prefix enables efficient range scanning.
   *
   * @param ctx - Transaction context
   * @param startTime - Start of range (ISO-8601)
   * @param endTime - End of range (ISO-8601)
   * @returns JSON array of AuditEvents within the time range
   */
  @Transaction(false)
  @Returns('string')
  async getEventsByTimeRange(
    ctx: Context,
    startTime: string,
    endTime: string,
  ): Promise<string> {
    const events: AuditEvent[] = [];

    // Use partial composite key query with the time prefix.
    // We scan all time~event keys and filter by range.
    // For production scale, a CouchDB rich query would be more efficient,
    // but composite keys work with LevelDB (default state DB).
    const iterator = await ctx.stub.getStateByPartialCompositeKey(
      'time~event',
      [],
    );

    let result = await iterator.next();
    while (!result.done) {
      if (result.value && result.value.key) {
        // Extract timestamp from composite key
        const compositeKey = ctx.stub.splitCompositeKey(result.value.key);
        const attributes = compositeKey.attributes;

        if (attributes.length >= 1) {
          const eventTimestamp = attributes[0];

          // Filter: startTime <= eventTimestamp <= endTime
          if (eventTimestamp >= startTime && eventTimestamp <= endTime) {
            try {
              const event: AuditEvent = JSON.parse(
                result.value.value.toString('utf8'),
              );
              events.push(event);
            } catch {
              // Skip malformed entries
            }
          }

          // Optimization: if we've passed endTime, we can stop
          // (timestamps are sorted lexicographically in composite keys)
          if (eventTimestamp > endTime) {
            break;
          }
        }
      }
      result = await iterator.next();
    }

    await iterator.close();

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return JSON.stringify(events);
  }

  /**
   * Get the count of events for a specific exam.
   * Useful for monitoring dashboards and health checks.
   *
   * @param ctx - Transaction context
   * @param examId - The exam identifier
   * @returns String representation of the event count
   */
  @Transaction(false)
  @Returns('string')
  async getEventCount(ctx: Context, examId: string): Promise<string> {
    let count = 0;

    const iterator = await ctx.stub.getStateByPartialCompositeKey(
      'exam~event',
      [examId],
    );

    let result = await iterator.next();
    while (!result.done) {
      count++;
      result = await iterator.next();
    }

    await iterator.close();

    return count.toString();
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────

/**
 * Deterministic JSON serialization.
 * Sorts object keys recursively to ensure identical byte representation
 * across all endorsing peers, which is critical for Fabric's
 * read-write set comparison during endorsement.
 */
function deterministicStringify(obj: any): string {
  return JSON.stringify(sortKeysRecursive(obj));
}

function sortKeysRecursive(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysRecursive);

  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortKeysRecursive(obj[key]);
  }
  return sorted;
}
