import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { Roles, Role, LongRunning } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Proxy controller for crypto-lifecycle service.
 * Routes encryption, key distribution, key release, and emergency operations.
 */
@Controller('exams')
export class CryptoProxyController {
  private readonly serviceName = 'crypto-lifecycle';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * POST /api/v1/exams/:id/encrypt
   * Encrypt all questions for an exam using per-question AES-256-GCM.
   * Triggers TLP puzzle generation for each question.
   */
  @Post(':id/encrypt')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  @LongRunning()
  async encryptExam(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'EncryptExam',
      { examId },
    );
    return response.data;
  }

  /**
   * POST /api/v1/exams/:id/distribute
   * Distribute encrypted question blobs to GCS and pre-stage for key release.
   */
  @Post(':id/distribute')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
  @LongRunning()
  async distributeExam(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'DistributeExam',
      { examId },
    );
    return response.data;
  }

  /**
   * GET /api/v1/exams/:id/keys/status
   * Get the status of key scheduling and release for an exam.
   */
  @Get(':id/keys/status')
  @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER, Role.AUDITOR)
  async getKeysStatus(@Param('id') examId: string): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'GetKeysStatus',
      { examId },
    );
    return response.data;
  }

  /**
   * POST /api/v1/exams/:id/keys/release
   * Emergency manual key release using Shamir's Secret Sharing (3-of-5).
   * Requires SUPER_ADMIN role. All emergency events are blockchain-recorded.
   */
  @Post(':id/keys/release')
  @Roles(Role.SUPER_ADMIN)
  async emergencyKeyRelease(
    @Param('id') examId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.grpcClient.forward(
      this.serviceName,
      'EmergencyKeyRelease',
      { examId, ...body },
    );
    return response.data;
  }
}
