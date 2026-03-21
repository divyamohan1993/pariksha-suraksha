import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max } from 'class-validator';
import * as crypto from 'crypto';
import { KmsService } from './kms/kms.service';
import { TlpService } from './tlp/tlp.service';
import { ShamirService } from './shamir/shamir.service';
import { SchedulingService } from './scheduling/scheduling.service';

// --- DTOs ---

class EncryptQuestionDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  questionBlobBase64!: string;
}

class DecryptQuestionDto {
  @IsString()
  @IsNotEmpty()
  encryptedBlobUri!: string;

  @IsString()
  @IsNotEmpty()
  encryptedDek!: string;
}

class ScheduleKeyReleaseDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsDateString()
  releaseTime!: string;
}

class InternalReleaseKeysDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}

class CollectFragmentDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  fragmentIndex!: number;

  @IsString()
  @IsNotEmpty()
  fragmentDataBase64!: string;

  @IsString()
  @IsNotEmpty()
  holderRole!: string;
}

class SplitKeyDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  masterKeyBase64!: string;
}

@Controller()
export class CryptoLifecycleController {
  private readonly logger = new Logger(CryptoLifecycleController.name);

  constructor(
    private readonly kmsService: KmsService,
    private readonly tlpService: TlpService,
    private readonly shamirService: ShamirService,
    private readonly schedulingService: SchedulingService,
  ) {}

  // --- KMS Endpoints ---

  @Post('encrypt')
  @HttpCode(HttpStatus.CREATED)
  async encryptQuestion(@Body() dto: EncryptQuestionDto) {
    const questionBlob = Buffer.from(dto.questionBlobBase64, 'base64');
    if (questionBlob.length === 0) {
      throw new BadRequestException('Question blob is empty');
    }
    return this.kmsService.encryptQuestion(questionBlob, dto.examId, dto.questionId);
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  async decryptQuestion(@Body() dto: DecryptQuestionDto) {
    const result = await this.kmsService.decryptQuestion(
      dto.encryptedBlobUri,
      dto.encryptedDek,
    );
    return {
      questionBlobBase64: result.questionBlob.toString('base64'),
      plaintextHash: result.plaintextHash,
    };
  }

  @Post('exams/:examId/bulk-decrypt')
  @HttpCode(HttpStatus.OK)
  async bulkDecryptAndCache(@Param('examId') examId: string) {
    return this.kmsService.bulkDecryptAndCache(examId);
  }

  @Post('exams/:examId/generate-kek')
  @HttpCode(HttpStatus.CREATED)
  async generateExamKek(@Param('examId') examId: string) {
    return this.kmsService.generateExamKek(examId);
  }

  @Post('exams/:examId/destroy-keys')
  @HttpCode(HttpStatus.OK)
  async destroyKeys(@Param('examId') examId: string) {
    await this.kmsService.destroyKeys(examId);
    return { success: true, examId };
  }

  // --- TLP Endpoints ---

  @Post('exams/:examId/tlp/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerTlpGeneration(@Param('examId') examId: string) {
    return this.tlpService.triggerTlpGeneration(examId);
  }

  @Get('exams/:examId/tlp/status')
  async getTlpStatus(@Param('examId') examId: string) {
    return this.tlpService.getTlpStatus(examId);
  }

  @Get('exams/:examId/tlp/verify-timing')
  async verifyTlpTiming(@Param('examId') examId: string) {
    const result = await this.tlpService.verifyTlpTiming(examId);
    return {
      ...result,
      expectedSolveTime: result.expectedSolveTime.toISOString(),
      actualExamStartTime: result.actualExamStartTime.toISOString(),
    };
  }

  // --- Shamir Endpoints ---

  @Post('exams/:examId/shamir/split')
  @HttpCode(HttpStatus.CREATED)
  async splitKey(
    @Param('examId') examId: string,
    @Body() dto: SplitKeyDto,
  ) {
    const masterKey = Buffer.from(dto.masterKeyBase64, 'base64');
    if (masterKey.length === 0) {
      throw new BadRequestException('Master key is empty');
    }

    const fragments = this.shamirService.splitKey(masterKey, 3, 5, examId);

    // Zeroize the master key from the request buffer
    masterKey.fill(0);

    // Return fragments with data as base64 (do not log actual fragment data)
    return {
      examId,
      threshold: 3,
      totalShares: 5,
      fragments: fragments.map((f) => ({
        fragmentId: f.fragmentId,
        index: f.index,
        holderRole: f.holderRole,
        dataBase64: f.data.toString('base64'),
      })),
    };
  }

  @Post('exams/:examId/shamir/collect')
  @HttpCode(HttpStatus.OK)
  async collectFragment(
    @Param('examId') examId: string,
    @Body() dto: CollectFragmentDto,
  ) {
    const fragmentData = Buffer.from(dto.fragmentDataBase64, 'base64');
    if (fragmentData.length === 0) {
      throw new BadRequestException('Fragment data is empty');
    }

    return this.shamirService.collectFragment(
      examId,
      dto.fragmentIndex,
      fragmentData,
      dto.holderRole,
    );
  }

  @Post('exams/:examId/shamir/reconstruct')
  @HttpCode(HttpStatus.OK)
  async attemptReconstruction(@Param('examId') examId: string) {
    const result = await this.shamirService.attemptReconstruction(examId);
    return {
      success: result.success,
      fragmentsUsed: result.fragmentsUsed,
      // Only return key hash, not the actual key, in the HTTP response
      reconstructedKeyHash: result.reconstructedKey
        ? crypto.createHash('sha256').update(result.reconstructedKey).digest('hex')
        : null,
    };
  }

  @Get('exams/:examId/shamir/status')
  async getEmergencyStatus(@Param('examId') examId: string) {
    return this.shamirService.getEmergencyStatus(examId);
  }

  // --- Scheduling Endpoints ---

  @Post('schedule-release')
  @HttpCode(HttpStatus.CREATED)
  async scheduleKeyRelease(@Body() dto: ScheduleKeyReleaseDto) {
    const releaseTime = new Date(dto.releaseTime);
    return this.schedulingService.scheduleKeyRelease(dto.examId, releaseTime);
  }

  /**
   * Internal endpoint called by Cloud Scheduler at exam start time.
   * This is the primary key release trigger.
   */
  @Post('internal/release-keys')
  @HttpCode(HttpStatus.OK)
  async releaseKeys(@Body() dto: InternalReleaseKeysDto) {
    this.logger.log(`Key release triggered for exam ${dto.examId}`);
    return this.schedulingService.releaseKeys(dto.examId);
  }

  @Post('exams/:examId/cancel-release')
  @HttpCode(HttpStatus.OK)
  async cancelScheduledRelease(@Param('examId') examId: string) {
    await this.schedulingService.cancelScheduledRelease(examId);
    return { success: true, examId };
  }

  // --- Key Status Endpoint ---

  @Get('exams/:examId/keys/status')
  async getKeyStatus(@Param('examId') examId: string) {
    const [shamirStatus, tlpStatus] = await Promise.all([
      this.shamirService.getEmergencyStatus(examId),
      this.tlpService.getTlpStatus(examId),
    ]);

    return {
      examId,
      shamir: shamirStatus,
      tlp: tlpStatus,
    };
  }
}
