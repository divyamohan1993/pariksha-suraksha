import {
  Controller,
  Get,
  Post,
  Param,
} from '@nestjs/common';
import { Roles, Role, LongRunning } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for paper-generator service.
 * Routes matrix generation, status checking, and O(1) paper delivery.
 */
@Controller('exams')
export class PapersProxyController {
  private readonly serviceName = 'paper-generator';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * POST /api/v1/exams/:id/matrix
   * Trigger the matrix solver (constraint satisfaction + simulated annealing).
   * This is a long-running operation that publishes a Pub/Sub job.
   */
  @Post(':id/matrix')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  @LongRunning()
  async generateMatrix(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GenerateMatrix',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/exams/:id/matrix/status
   * Check the progress of matrix generation.
   * Returns progress percentage, centers processed, constraint violations, etc.
   */
  @Get(':id/matrix/status')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  async getMatrixStatus(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetMatrixStatus',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/exams/:id/paper/:centerId/:seatNum
   * O(1) paper lookup — single Redis call to retrieve pre-rendered paper.
   * This is the hot path on exam day (< 1ms latency per addendum Fix 7).
   */
  @Get(':id/paper/:centerId/:seatNum')
  @Roles(Role.CANDIDATE, Role.INVIGILATOR, Role.SUPER_ADMIN)
  async getPaper(
    @Param('id') examId: string,
    @Param('centerId') centerId: string,
    @Param('seatNum') seatNum: string,
  ): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetPaper',
      { examId, centerId, seatNum: parseInt(seatNum, 10) },
    );
    return response.data;
  }
}
