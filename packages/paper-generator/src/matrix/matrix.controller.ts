import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MatrixService } from './matrix.service';
import { CacheService } from '../cache/cache.service';
import {
  TriggerMatrixDto,
  GetAssignmentDto,
  PreloadMatrixDto,
  PreWarmCacheDto,
} from '../common/dto/matrix.dto';

@Controller()
export class MatrixController {
  private readonly logger = new Logger(MatrixController.name);

  constructor(
    private readonly matrixService: MatrixService,
    private readonly cacheService: CacheService,
  ) {}

  // ─── HTTP Endpoints ─────────────────────────────────────────────

  /**
   * POST /exams/:examId/matrix
   * Trigger matrix generation for an exam (publishes job to Pub/Sub).
   */
  @Post('exams/:examId/matrix')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerMatrix(@Param('examId') examId: string) {
    this.logger.log(`POST /exams/${examId}/matrix — triggering matrix generation`);
    return this.matrixService.triggerMatrixGeneration(examId);
  }

  /**
   * GET /exams/:examId/matrix/status
   * Poll matrix generation status from Firestore.
   */
  @Get('exams/:examId/matrix/status')
  async getMatrixStatus(@Param('examId') examId: string) {
    return this.matrixService.getMatrixStatus(examId);
  }

  /**
   * GET /exams/:examId/paper/:centerId/:seatNum
   * O(1) paper lookup — THE critical hot path.
   * Returns a complete pre-rendered paper from a single Redis GET.
   */
  @Get('exams/:examId/paper/:centerId/:seatNum')
  async getAssignment(
    @Param('examId') examId: string,
    @Param('centerId') centerId: string,
    @Param('seatNum') seatNum: string,
  ) {
    this.logger.debug(`GET /exams/${examId}/paper/${centerId}/${seatNum} — O(1) lookup`);
    return this.matrixService.getAssignment(examId, centerId, seatNum);
  }

  /**
   * POST /exams/:examId/matrix/preload
   * Preload the assignment matrix from Firestore into Redis.
   */
  @Post('exams/:examId/matrix/preload')
  @HttpCode(HttpStatus.OK)
  async preloadMatrix(@Param('examId') examId: string) {
    this.logger.log(`POST /exams/${examId}/matrix/preload — preloading to Redis`);
    return this.matrixService.preloadMatrix(examId);
  }

  /**
   * POST /exams/:examId/cache/prewarm
   * Pre-warm the complete rendered paper cache at key release time.
   * This is the step that enables O(1) paper delivery on exam day.
   */
  @Post('exams/:examId/cache/prewarm')
  @HttpCode(HttpStatus.OK)
  async preWarmCache(
    @Param('examId') examId: string,
    @Query('durationMinutes') durationMinutes?: string,
  ) {
    const duration = durationMinutes ? parseInt(durationMinutes, 10) : 180;
    this.logger.log(`POST /exams/${examId}/cache/prewarm — pre-rendering all papers`);
    return this.cacheService.preWarmCache(examId, duration);
  }

  // ─── gRPC Methods ───────────────────────────────────────────────

  /**
   * gRPC: TriggerMatrixGeneration
   */
  @GrpcMethod('PaperGeneratorService', 'TriggerMatrixGeneration')
  async grpcTriggerMatrix(data: TriggerMatrixDto) {
    return this.matrixService.triggerMatrixGeneration(data.examId);
  }

  /**
   * gRPC: GetMatrixStatus
   */
  @GrpcMethod('PaperGeneratorService', 'GetMatrixStatus')
  async grpcGetMatrixStatus(data: { examId: string }) {
    return this.matrixService.getMatrixStatus(data.examId);
  }

  /**
   * gRPC: GetAssignment — O(1) paper lookup via gRPC.
   */
  @GrpcMethod('PaperGeneratorService', 'GetAssignment')
  async grpcGetAssignment(data: GetAssignmentDto) {
    return this.matrixService.getAssignment(data.examId, data.centerId, data.seatNum);
  }

  /**
   * gRPC: PreloadMatrix
   */
  @GrpcMethod('PaperGeneratorService', 'PreloadMatrix')
  async grpcPreloadMatrix(data: PreloadMatrixDto) {
    return this.matrixService.preloadMatrix(data.examId);
  }

  /**
   * gRPC: PreWarmCache
   */
  @GrpcMethod('PaperGeneratorService', 'PreWarmCache')
  async grpcPreWarmCache(data: PreWarmCacheDto) {
    const duration = data.durationMinutes ? parseInt(data.durationMinutes, 10) : 180;
    return this.cacheService.preWarmCache(data.examId, duration);
  }
}
