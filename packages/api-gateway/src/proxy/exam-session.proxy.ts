import {
  Controller,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles, Role } from '../decorators';
import { AuthenticatedUser } from '../dto';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for exam-session-service.
 * Handles candidate response lifecycle: start, checkpoint, submit.
 * Per addendum Fix 6, this service orchestrates crypto-lifecycle + blockchain-service.
 */
@Controller('exam-session')
export class ExamSessionProxyController {
  private readonly serviceName = 'exam-session-service';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * POST /api/v1/exam-session/start
   * Start an exam session for a candidate. Loads the paper via paper-generator.
   * Returns the decrypted paper (if keys are released) or encrypted paper reference.
   */
  @Post('start')
  @Roles(Role.CANDIDATE)
  async startSession(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<unknown> {
    const user = req.user as AuthenticatedUser;
    const response = await this.grpcClient.forward(
      this.serviceName,
      'StartSession',
      {
        candidateId: user.userId,
        examId: user.examId,
        centerId: user.centerId,
        ...body,
      },
    );
    return response.data;
  }

  /**
   * POST /api/v1/exam-session/checkpoint
   * Save a response checkpoint. Auto-called every 30 seconds by the exam terminal.
   * Encrypts the response snapshot via crypto-lifecycle and stores to GCS.
   */
  @Post('checkpoint')
  @Roles(Role.CANDIDATE)
  async checkpoint(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<unknown> {
    const user = req.user as AuthenticatedUser;
    const response = await this.grpcClient.forward(
      this.serviceName,
      'Checkpoint',
      {
        candidateId: user.userId,
        examId: user.examId,
        ...body,
      },
    );
    return response.data;
  }

  /**
   * POST /api/v1/exam-session/submit
   * Final submission of exam responses.
   * Encrypts the response blob, stores to GCS, and records a blockchain audit event.
   * Returns a submission hash for candidate verification.
   */
  @Post('submit')
  @Roles(Role.CANDIDATE)
  async submitSession(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<unknown> {
    const user = req.user as AuthenticatedUser;
    const response = await this.grpcClient.forward(
      this.serviceName,
      'SubmitSession',
      {
        candidateId: user.userId,
        examId: user.examId,
        centerId: user.centerId,
        ...body,
      },
    );
    return response.data;
  }
}
