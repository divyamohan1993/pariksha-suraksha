import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { Roles, Role } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for blockchain-service.
 * Routes audit event queries, event verification, and Merkle proof retrieval.
 */
@Controller('audit')
export class AuditProxyController {
  private readonly serviceName = 'blockchain-service';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * GET /api/v1/audit/events/:examId
   * Retrieve all blockchain audit events for an exam.
   * Uses Fabric composite key range query (exam~event).
   */
  @Get('events/:examId')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async getEventsByExam(@Param('examId') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetEventsByExam',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/audit/verify/:eventId
   * Verify the integrity of a specific audit event on the blockchain.
   * Returns verification status and event data.
   */
  @Get('verify/:eventId')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async verifyEvent(@Param('eventId') eventId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'VerifyEvent',
      { eventId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/audit/proof/:eventId
   * Retrieve the Merkle proof for an audit event.
   * Returns the proof path (sibling hashes) for independent verification
   * (see addendum Fix 11).
   */
  @Get('proof/:eventId')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async getMerkleProof(@Param('eventId') eventId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetMerkleProof',
      { eventId },
    );
    return response.data;
  }
}
