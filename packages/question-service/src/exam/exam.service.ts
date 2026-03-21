import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirestoreService } from '../firestore/firestore.service';
import { PubSubService } from '../pubsub/pubsub.service';
import { Exam, ExamMetadata, ExamBlueprint } from '../common/interfaces';
import { CreateExamDto, DefineExamBlueprintDto } from '../common/dto/create-exam.dto';

const COLLECTION = 'exams';

@Injectable()
export class ExamService {
  private readonly logger = new Logger(ExamService.name);

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly pubsubService: PubSubService,
  ) {}

  async create(dto: CreateExamDto): Promise<Exam> {
    const examId = uuidv4();
    const now = new Date().toISOString();

    const metadata: ExamMetadata = {
      name: dto.name,
      date: dto.date,
      subjects: dto.subjects,
      totalQuestions: dto.totalQuestions,
      totalCandidates: dto.totalCandidates,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      createdBy: dto.createdBy || 'system',
    };

    const exam: Exam = {
      id: examId,
      metadata,
      blueprint: null,
    };

    await this.firestoreService.create(COLLECTION, examId, exam);

    this.logger.log(`Created exam ${examId}: "${dto.name}" on ${dto.date}`);

    return exam;
  }

  async getById(examId: string): Promise<Exam> {
    const exam = await this.firestoreService.getById<Exam>(COLLECTION, examId);

    if (!exam) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }

    return exam;
  }

  async listExams(limit = 20, startAfter?: string): Promise<{ items: Exam[]; nextPageToken: string | null }> {
    const { items, lastDocId } = await this.firestoreService.list<Exam>(COLLECTION, {
      limit,
      startAfterDocId: startAfter,
      orderBy: { field: 'metadata.createdAt', direction: 'desc' },
    });

    return { items, nextPageToken: lastDocId };
  }

  async defineBlueprint(examId: string, dto: DefineExamBlueprintDto): Promise<Exam> {
    const exam = await this.getById(examId);

    if (exam.metadata.status !== 'created' && exam.metadata.status !== 'blueprint_defined') {
      throw new BadRequestException(
        `Cannot define blueprint for exam in status "${exam.metadata.status}". Exam must be in "created" or "blueprint_defined" status.`,
      );
    }

    // Validate difficulty distribution sums to 1
    const totalDifficulty = dto.difficultyDist.easy + dto.difficultyDist.medium + dto.difficultyDist.hard;
    if (Math.abs(totalDifficulty - 1.0) > 0.01) {
      throw new BadRequestException(
        `Difficulty distribution must sum to 1.0 (got ${totalDifficulty.toFixed(4)}). ` +
          `easy=${dto.difficultyDist.easy}, medium=${dto.difficultyDist.medium}, hard=${dto.difficultyDist.hard}`,
      );
    }

    // Validate topic coverage question counts match questionsPerPaper
    const totalTopicQuestions = dto.topicCoverage.reduce((sum, tc) => sum + tc.questionCount, 0);
    if (totalTopicQuestions !== dto.questionsPerPaper) {
      throw new BadRequestException(
        `Total topic questions (${totalTopicQuestions}) must equal questionsPerPaper (${dto.questionsPerPaper}).`,
      );
    }

    // Validate topic coverage weights sum to 1
    const totalWeight = dto.topicCoverage.reduce((sum, tc) => sum + tc.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new BadRequestException(
        `Topic coverage weights must sum to 1.0 (got ${totalWeight.toFixed(4)}).`,
      );
    }

    const blueprint: ExamBlueprint = {
      difficultyDist: dto.difficultyDist,
      topicCoverage: dto.topicCoverage,
      questionsPerPaper: dto.questionsPerPaper,
    };

    const now = new Date().toISOString();

    await this.firestoreService.update(COLLECTION, examId, {
      blueprint,
      'metadata.status': 'blueprint_defined',
      'metadata.updatedAt': now,
    });

    this.logger.log(
      `Defined blueprint for exam ${examId}: ${dto.questionsPerPaper} questions/paper, ${dto.topicCoverage.length} topics`,
    );

    return this.getById(examId);
  }

  async triggerMatrixSolver(examId: string): Promise<{ messageId: string; correlationId: string }> {
    const exam = await this.getById(examId);

    if (exam.metadata.status !== 'blueprint_defined') {
      throw new BadRequestException(
        `Cannot trigger matrix solver for exam in status "${exam.metadata.status}". ` +
          'Exam must have a defined blueprint.',
      );
    }

    if (!exam.blueprint) {
      throw new BadRequestException('Exam blueprint is not defined. Define it first via POST /exams/:id/blueprint.');
    }

    const correlationId = uuidv4();

    await this.firestoreService.update(COLLECTION, examId, {
      'metadata.status': 'matrix_generating',
      'metadata.updatedAt': new Date().toISOString(),
    });

    const messageId = await this.pubsubService.publishToMatrixSolver(examId, correlationId);

    this.logger.log(
      `Triggered matrix solver for exam ${examId} (messageId: ${messageId}, correlationId: ${correlationId})`,
    );

    return { messageId, correlationId };
  }

  async updateStatus(examId: string, status: Exam['metadata']['status']): Promise<void> {
    await this.getById(examId); // verify exists

    await this.firestoreService.update(COLLECTION, examId, {
      'metadata.status': status,
      'metadata.updatedAt': new Date().toISOString(),
    });

    this.logger.log(`Updated exam ${examId} status to "${status}"`);
  }
}
