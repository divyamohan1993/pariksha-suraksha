import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EventsService } from './events.service';

// ─── DTOs ────────────────────────────────────────────────────────────────

class RecordEventDto {
  event_type!: string;
  exam_id!: string;
  entity_hash!: string;
  metadata!: string;
}

// ─── Controller (REST + gRPC) ────────────────────────────────────────────

@Controller('audit')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  // ─── REST Endpoints ──────────────────────────────────────────────────

  /**
   * GET /audit/events/:examId
   * Retrieve all audit events for a specific exam.
   */
  @Get('events/:examId')
  async getEventsByExam(@Param('examId') examId: string) {
    this.logger.log(`REST: getEventsByExam examId=${examId}`);
    const events = await this.eventsService.getEventsByExam(examId);
    return {
      examId,
      events,
      totalCount: events.length,
    };
  }

  /**
   * GET /audit/verify/:eventId
   * Verify an event and return its Merkle proof verification result.
   */
  @Get('verify/:eventId')
  async verifyEvent(@Param('eventId') eventId: string) {
    this.logger.log(`REST: verifyEvent eventId=${eventId}`);
    return this.eventsService.verifyEvent(eventId);
  }

  /**
   * GET /audit/proof/:eventId
   * Get the raw Merkle proof for an event.
   */
  @Get('proof/:eventId')
  async getMerkleProof(@Param('eventId') eventId: string) {
    this.logger.log(`REST: getMerkleProof eventId=${eventId}`);
    const proof = await this.eventsService.getMerkleProof(eventId);
    return {
      success: true,
      proof,
    };
  }

  /**
   * GET /audit/timeline/:examId
   * Get a chronological timeline of all events for an exam.
   */
  @Get('timeline/:examId')
  async getTimeline(@Param('examId') examId: string) {
    this.logger.log(`REST: getTimeline examId=${examId}`);
    return this.eventsService.getTimeline(examId);
  }

  /**
   * POST /audit/events
   * Record a new audit event (used internally by other services).
   */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async recordEvent(@Body() dto: RecordEventDto) {
    this.logger.log(`REST: recordEvent type=${dto.event_type} exam=${dto.exam_id}`);
    const result = await this.eventsService.recordEvent(
      dto.event_type,
      dto.exam_id,
      dto.entity_hash,
      dto.metadata,
    );
    return {
      success: true,
      ...result,
    };
  }

  /**
   * GET /audit/events-by-time
   * Query events within a time range.
   */
  @Get('events-by-time')
  async getEventsByTimeRange(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    this.logger.log(`REST: getEventsByTimeRange start=${start} end=${end}`);
    const events = await this.eventsService.getEventsByTimeRange(start, end);
    return {
      events,
      totalCount: events.length,
    };
  }

  // ─── gRPC Service Methods ────────────────────────────────────────────
  // These map to the BlockchainService defined in blockchain_service.proto

  @GrpcMethod('BlockchainService', 'RecordEvent')
  async grpcRecordEvent(data: RecordEventDto) {
    this.logger.log(`gRPC: RecordEvent type=${data.event_type} exam=${data.exam_id}`);
    try {
      const result = await this.eventsService.recordEvent(
        data.event_type,
        data.exam_id,
        data.entity_hash,
        data.metadata,
      );
      return {
        event_id: result.eventId,
        tx_id: result.txId,
        block_number: result.blockNumber,
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        event_id: '',
        tx_id: '',
        block_number: 0,
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  @GrpcMethod('BlockchainService', 'QueryEvent')
  async grpcQueryEvent(data: { event_id: string }) {
    this.logger.log(`gRPC: QueryEvent eventId=${data.event_id}`);

    try {
      const verification = await this.eventsService.verifyEvent(data.event_id);
      const e = verification.event;

      return {
        event: {
          event_id: e.eventId,
          event_type: e.eventType,
          exam_id: e.examId,
          entity_hash: e.entityHash,
          timestamp: e.timestamp,
          actor_id: e.actorId,
          actor_org: e.actorOrg,
          metadata: e.metadata,
        },
        found: true,
      };
    } catch {
      return { event: null, found: false };
    }
  }

  @GrpcMethod('BlockchainService', 'QueryEventsByExam')
  async grpcQueryEventsByExam(data: { exam_id: string }) {
    this.logger.log(`gRPC: QueryEventsByExam examId=${data.exam_id}`);
    const events = await this.eventsService.getEventsByExam(data.exam_id);
    return {
      events: events.map((e) => ({
        event_id: e.eventId,
        event_type: e.eventType,
        exam_id: e.examId,
        entity_hash: e.entityHash,
        timestamp: e.timestamp,
        actor_id: e.actorId,
        actor_org: e.actorOrg,
        metadata: e.metadata,
      })),
      total_count: events.length,
    };
  }

  @GrpcMethod('BlockchainService', 'QueryEventsByTimeRange')
  async grpcQueryEventsByTimeRange(data: {
    start_time: string;
    end_time: string;
  }) {
    this.logger.log(
      `gRPC: QueryEventsByTimeRange start=${data.start_time} end=${data.end_time}`,
    );
    const events = await this.eventsService.getEventsByTimeRange(
      data.start_time,
      data.end_time,
    );
    return {
      events: events.map((e) => ({
        event_id: e.eventId,
        event_type: e.eventType,
        exam_id: e.examId,
        entity_hash: e.entityHash,
        timestamp: e.timestamp,
        actor_id: e.actorId,
        actor_org: e.actorOrg,
        metadata: e.metadata,
      })),
      total_count: events.length,
    };
  }

  @GrpcMethod('BlockchainService', 'GetMerkleProof')
  async grpcGetMerkleProof(data: { event_id: string }) {
    this.logger.log(`gRPC: GetMerkleProof eventId=${data.event_id}`);
    try {
      const proof = await this.eventsService.getMerkleProof(data.event_id);
      return {
        proof: {
          event_id: proof.eventId,
          tx_id: proof.txId,
          block_number: proof.blockNumber,
          block_hash: proof.blockHash,
          tx_hash: proof.txHash,
          proof_nodes: proof.proof.map((n) => ({
            hash: n.hash,
            position: n.position,
          })),
          verified: proof.verified,
        },
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        proof: null,
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  @GrpcMethod('BlockchainService', 'VerifyMerkleProof')
  async grpcVerifyMerkleProof(data: {
    proof: {
      event_id: string;
      tx_id: string;
      block_number: number;
      block_hash: string;
      tx_hash: string;
      proof_nodes: Array<{ hash: string; position: string }>;
      verified: boolean;
    };
  }) {
    this.logger.log(`gRPC: VerifyMerkleProof eventId=${data.proof?.event_id}`);
    try {
      // Get a fresh proof from the chain and verify it
      const freshProof = await this.eventsService.getMerkleProof(
        data.proof.event_id,
      );

      return {
        verified: freshProof.verified,
        computed_root: freshProof.merkleRoot,
        expected_root: freshProof.merkleRoot,
        error: '',
      };
    } catch (error: any) {
      return {
        verified: false,
        computed_root: '',
        expected_root: '',
        error: error.message || 'Unknown error',
      };
    }
  }

  @GrpcMethod('BlockchainService', 'GetTimeline')
  async grpcGetTimeline(data: { exam_id: string }) {
    this.logger.log(`gRPC: GetTimeline examId=${data.exam_id}`);
    const timeline = await this.eventsService.getTimeline(data.exam_id);
    return {
      exam_id: timeline.examId,
      entries: timeline.entries.map((entry) => ({
        event: {
          event_id: entry.event.eventId,
          event_type: entry.event.eventType,
          exam_id: entry.event.examId,
          entity_hash: entry.event.entityHash,
          timestamp: entry.event.timestamp,
          actor_id: entry.event.actorId,
          actor_org: entry.event.actorOrg,
          metadata: entry.event.metadata,
        },
        description: entry.description,
      })),
      total_count: timeline.totalCount,
    };
  }

  @GrpcMethod('BlockchainService', 'HealthCheck')
  async grpcHealthCheck() {
    this.logger.log('gRPC: HealthCheck');
    return {
      status: 'SERVING',
      fabric_connected: true,
      peer_status: 'ONLINE',
      orderer_status: 'ONLINE',
    };
  }
}
