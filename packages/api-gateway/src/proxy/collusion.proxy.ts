import {
  Controller,
  Get,
  Post,
  Param,
} from '@nestjs/common';
import { Roles, Role, LongRunning } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for collusion-engine service.
 * Routes collusion detection trigger and results retrieval.
 */
@Controller('exams')
export class CollusionProxyController {
  private readonly serviceName = 'collusion-engine';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * POST /api/v1/exams/:id/collusion/run
   * Trigger collusion detection for an exam.
   * Publishes a job to Pub/Sub for the Python collusion-detector worker.
   * SLA: < 20 minutes for full exam (200 centers, 500 candidates each).
   */
  @Post(':id/collusion/run')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  @LongRunning()
  async runCollusionDetection(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'RunCollusionDetection',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/exams/:id/collusion/results
   * Retrieve collusion detection results for an exam.
   * Returns flagged pairs with log-likelihood ratios and evidence summaries.
   */
  @Get(':id/collusion/results')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async getCollusionResults(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetCollusionResults',
      { examId },
    );
    return response.data;
  }
}
