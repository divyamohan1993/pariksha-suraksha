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

import { ResponsesService, StartSessionResult, SubmitResult, VerificationResult } from './responses.service';
import { CheckpointService } from '../checkpoint/checkpoint.service';
import { StartExamSessionDto, SubmitResponsesDto, SaveCheckpointDto } from './dto';

import type { QuestionResponse } from '@pariksha/shared';

@Controller('exam-session')
export class ResponsesController {
  private readonly logger = new Logger(ResponsesController.name);

  constructor(
    private readonly responsesService: ResponsesService,
    private readonly checkpointService: CheckpointService,
  ) {}

  // ---------------------------------------------------------------------------
  // HTTP endpoints
  // ---------------------------------------------------------------------------

  @Post('start')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async startExamSession(
    @Body() dto: StartExamSessionDto,
  ): Promise<StartSessionResult> {
    return this.responsesService.startExamSession(
      dto.candidateId,
      dto.examId,
      dto.centerId,
      dto.seatNum,
    );
  }

  @Post('submit')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async submitResponses(
    @Body() dto: SubmitResponsesDto,
  ): Promise<SubmitResult> {
    const responses: QuestionResponse[] = dto.responses.map((r) => ({
      questionPosition: r.questionPosition,
      templateId: r.templateId,
      paramInstantiationId: r.paramInstantiationId,
      selectedChoice: r.selectedChoice,
      markedForReview: r.markedForReview,
      visited: r.visited,
      timeSpentMs: r.timeSpentMs,
    }));

    return this.responsesService.submitResponses(
      dto.candidateId,
      dto.examId,
      responses,
    );
  }

  @Post('checkpoint')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async saveCheckpoint(
    @Body() dto: SaveCheckpointDto,
  ): Promise<{ success: boolean; savedAt: string }> {
    const responses: QuestionResponse[] = dto.responses.map((r) => ({
      questionPosition: r.questionPosition,
      templateId: r.templateId,
      paramInstantiationId: r.paramInstantiationId,
      selectedChoice: r.selectedChoice,
      markedForReview: r.markedForReview,
      visited: r.visited,
      timeSpentMs: r.timeSpentMs,
    }));

    return this.checkpointService.saveCheckpoint(
      dto.candidateId,
      dto.examId,
      responses,
      dto.currentQuestionPosition,
      dto.elapsedMs,
    );
  }

  @Get('verify/:submissionHash')
  async getSubmissionVerification(
    @Param('submissionHash') submissionHash: string,
  ): Promise<VerificationResult> {
    return this.responsesService.getSubmissionVerification(submissionHash);
  }

  // ---------------------------------------------------------------------------
  // gRPC handlers
  // ---------------------------------------------------------------------------

  @GrpcMethod('ExamSessionService', 'StartExamSession')
  async grpcStartExamSession(data: {
    candidate_id: string;
    exam_id: string;
    center_id: string;
    seat_num: number;
  }): Promise<{
    session_id: string;
    exam_id: string;
    candidate_id: string;
    paper_json: string;
    duration_minutes: number;
    started_at: string;
  }> {
    const result = await this.responsesService.startExamSession(
      data.candidate_id,
      data.exam_id,
      data.center_id,
      data.seat_num,
    );

    return {
      session_id: result.sessionId,
      exam_id: result.examId,
      candidate_id: result.candidateId,
      paper_json: result.paperJson,
      duration_minutes: result.durationMinutes,
      started_at: result.startedAt,
    };
  }

  @GrpcMethod('ExamSessionService', 'SubmitResponses')
  async grpcSubmitResponses(data: {
    candidate_id: string;
    exam_id: string;
    responses: Array<{
      question_position: number;
      template_id: string;
      param_instantiation_id: string;
      selected_choice: string;
      marked_for_review: boolean;
      visited: boolean;
      time_spent_ms: number;
    }>;
  }): Promise<{
    submission_hash: string;
    verification_url: string;
    submitted_at: string;
  }> {
    const responses: QuestionResponse[] = (data.responses || []).map((r) => ({
      questionPosition: r.question_position,
      templateId: r.template_id,
      paramInstantiationId: r.param_instantiation_id,
      selectedChoice: r.selected_choice || null,
      markedForReview: r.marked_for_review,
      visited: r.visited,
      timeSpentMs: r.time_spent_ms,
    }));

    const result = await this.responsesService.submitResponses(
      data.candidate_id,
      data.exam_id,
      responses,
    );

    return {
      submission_hash: result.submissionHash,
      verification_url: result.verificationUrl,
      submitted_at: result.submittedAt,
    };
  }

  @GrpcMethod('ExamSessionService', 'SaveCheckpoint')
  async grpcSaveCheckpoint(data: {
    candidate_id: string;
    exam_id: string;
    responses: Array<{
      question_position: number;
      template_id: string;
      param_instantiation_id: string;
      selected_choice: string;
      marked_for_review: boolean;
      visited: boolean;
      time_spent_ms: number;
    }>;
    current_question_position: number;
    elapsed_ms: number;
  }): Promise<{ success: boolean; saved_at: string }> {
    const responses: QuestionResponse[] = (data.responses || []).map((r) => ({
      questionPosition: r.question_position,
      templateId: r.template_id,
      paramInstantiationId: r.param_instantiation_id,
      selectedChoice: r.selected_choice || null,
      markedForReview: r.marked_for_review,
      visited: r.visited,
      timeSpentMs: r.time_spent_ms,
    }));

    const result = await this.checkpointService.saveCheckpoint(
      data.candidate_id,
      data.exam_id,
      responses,
      data.current_question_position,
      data.elapsed_ms,
    );

    return { success: result.success, saved_at: result.savedAt };
  }

  @GrpcMethod('ExamSessionService', 'LoadCheckpoint')
  async grpcLoadCheckpoint(data: {
    candidate_id: string;
    exam_id: string;
  }): Promise<{
    found: boolean;
    responses: Array<{
      question_position: number;
      template_id: string;
      param_instantiation_id: string;
      selected_choice: string;
      marked_for_review: boolean;
      visited: boolean;
      time_spent_ms: number;
    }>;
    current_question_position: number;
    elapsed_ms: number;
    saved_at: string;
  }> {
    const checkpoint = await this.checkpointService.loadCheckpoint(
      data.candidate_id,
      data.exam_id,
    );

    if (!checkpoint) {
      return {
        found: false,
        responses: [],
        current_question_position: 0,
        elapsed_ms: 0,
        saved_at: '',
      };
    }

    return {
      found: true,
      responses: checkpoint.responses.map((r) => ({
        question_position: r.questionPosition,
        template_id: r.templateId,
        param_instantiation_id: r.paramInstantiationId,
        selected_choice: r.selectedChoice || '',
        marked_for_review: r.markedForReview,
        visited: r.visited,
        time_spent_ms: r.timeSpentMs,
      })),
      current_question_position: checkpoint.currentQuestionPosition,
      elapsed_ms: checkpoint.elapsedMs,
      saved_at: checkpoint.savedAt,
    };
  }

  @GrpcMethod('ExamSessionService', 'GetSubmissionVerification')
  async grpcGetSubmissionVerification(data: {
    submission_hash: string;
  }): Promise<{
    verified: boolean;
    timestamp: string;
    blockchain_event_id: string;
  }> {
    const result = await this.responsesService.getSubmissionVerification(
      data.submission_hash,
    );

    return {
      verified: result.verified,
      timestamp: result.timestamp,
      blockchain_event_id: result.blockchainEventId,
    };
  }
}
