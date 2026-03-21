import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, Role, LongRunning } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for the question-service.
 * Routes question CRUD, Gemini-based generation, and exam management endpoints.
 */
@Controller('questions')
export class QuestionsProxyController {
  private readonly serviceName = 'question-service';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * GET /api/v1/questions
   * List question templates with optional filters.
   */
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.QUESTION_SETTER)
  async listQuestions(
    @Query('subject') subject?: string,
    @Query('topic') topic?: string,
    @Query('bloomLevel') bloomLevel?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'ListQuestions',
      { subject, topic, bloomLevel, page: page || 1, limit: limit || 50 },
    );
    return response.data;
  }

  /**
   * POST /api/v1/questions
   * Create a new question template manually.
   */
  @Post()
  @Roles(Role.SUPER_ADMIN, Role.QUESTION_SETTER)
  async createQuestion(@Body() body: Record<string, unknown>): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'CreateQuestion',
      body,
    );
    return response.data;
  }

  /**
   * POST /api/v1/questions/generate
   * Generate a question template using Gemini AI.
   */
  @Post('generate')
  @Roles(Role.SUPER_ADMIN, Role.QUESTION_SETTER)
  @LongRunning()
  async generateQuestion(@Body() body: Record<string, unknown>): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GenerateQuestion',
      body,
    );
    return response.data;
  }

  /**
   * PUT /api/v1/questions/:id
   * Update an existing question template.
   */
  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.QUESTION_SETTER)
  async updateQuestion(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'UpdateQuestion',
      { ...body, templateId: id },
    );
    return response.data;
  }
}

/**
 * Proxy controller for exam management endpoints routed to question-service.
 */
@Controller('exams')
export class ExamsProxyController {
  private readonly serviceName = 'question-service';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * POST /api/v1/exams
   * Create a new exam.
   */
  @Post()
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  async createExam(@Body() body: Record<string, unknown>): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'CreateExam',
      body,
    );
    return response.data;
  }

  /**
   * POST /api/v1/exams/:id/blueprint
   * Set the exam blueprint (topic/difficulty distribution).
   */
  @Post(':id/blueprint')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  async setBlueprint(
    @Param('id') examId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'SetBlueprint',
      { ...body, examId },
    );
    return response.data;
  }

  /**
   * POST /api/v1/exams/:id/equate
   * Trigger score equating (addendum Fix 1).
   */
  @Post(':id/equate')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  @LongRunning()
  async equateScores(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'EquateScores',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/exams/:id/results
   * Get equated exam results (addendum Fix 1).
   */
  @Get(':id/results')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async getResults(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetResults',
      { examId },
    );
    return response.data;
  }
}
