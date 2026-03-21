import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ExamService } from './exam.service';
import { CreateExamDto, DefineExamBlueprintDto } from '../common/dto/create-exam.dto';
import { Exam } from '../common/interfaces';

@Controller('exams')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExamDto): Promise<Exam> {
    return this.examService.create(dto);
  }

  @Get()
  async list(
    @Query('limit') limit?: number,
    @Query('startAfter') startAfter?: string,
  ): Promise<{ items: Exam[]; nextPageToken: string | null }> {
    return this.examService.listExams(limit ? Number(limit) : undefined, startAfter);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<Exam> {
    return this.examService.getById(id);
  }

  @Post(':id/blueprint')
  @HttpCode(HttpStatus.OK)
  async defineBlueprint(
    @Param('id') id: string,
    @Body() dto: DefineExamBlueprintDto,
  ): Promise<Exam> {
    return this.examService.defineBlueprint(id, dto);
  }

  @Post(':id/matrix')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerMatrixSolver(
    @Param('id') id: string,
  ): Promise<{ messageId: string; correlationId: string }> {
    return this.examService.triggerMatrixSolver(id);
  }
}
