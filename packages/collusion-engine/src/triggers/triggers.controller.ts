import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

import {
  TriggersService,
  CollusionTriggerResult,
  CollusionStatusResult,
} from './triggers.service';
import { RunCollusionDetectionDto } from './dto';

@Controller('collusion')
export class TriggersController {
  private readonly logger = new Logger(TriggersController.name);

  constructor(private readonly triggersService: TriggersService) {}

  // ---------------------------------------------------------------------------
  // HTTP endpoints
  // ---------------------------------------------------------------------------

  @Post('run')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async runCollusionDetection(
    @Body() dto: RunCollusionDetectionDto,
  ): Promise<CollusionTriggerResult> {
    return this.triggersService.runCollusionDetection(dto.examId);
  }

  @Get('status/:examId')
  async getCollusionStatus(
    @Param('examId') examId: string,
  ): Promise<CollusionStatusResult> {
    return this.triggersService.getCollusionStatus(examId);
  }

  // ---------------------------------------------------------------------------
  // gRPC handlers
  // ---------------------------------------------------------------------------

  @GrpcMethod('CollusionEngineService', 'RunCollusionDetection')
  async grpcRunCollusionDetection(data: {
    exam_id: string;
  }): Promise<{
    exam_id: string;
    jobs_published: number;
    triggered_at: string;
  }> {
    const result = await this.triggersService.runCollusionDetection(
      data.exam_id,
    );
    return {
      exam_id: result.examId,
      jobs_published: result.jobsPublished,
      triggered_at: result.triggeredAt,
    };
  }

  @GrpcMethod('CollusionEngineService', 'GetCollusionStatus')
  async grpcGetCollusionStatus(data: {
    exam_id: string;
  }): Promise<{
    exam_id: string;
    overall_status: string;
    total_centers: number;
    completed_centers: number;
    failed_centers: number;
    center_statuses: Array<{
      center_id: string;
      status: string;
      started_at: string;
      completed_at: string;
      error_message: string;
    }>;
  }> {
    const result = await this.triggersService.getCollusionStatus(data.exam_id);
    return {
      exam_id: result.examId,
      overall_status: result.overallStatus,
      total_centers: result.totalCenters,
      completed_centers: result.completedCenters,
      failed_centers: result.failedCenters,
      center_statuses: result.centerStatuses.map((cs) => ({
        center_id: cs.centerId,
        status: cs.status,
        started_at: cs.startedAt,
        completed_at: cs.completedAt,
        error_message: cs.errorMessage,
      })),
    };
  }
}
