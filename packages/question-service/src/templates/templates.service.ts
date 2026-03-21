import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirestoreService, FirestoreQueryFilter } from '../firestore/firestore.service';
import { GeminiService } from '../gemini/gemini.service';
import { ValidationService } from '../validation/validation.service';
import {
  QuestionTemplate,
  QuestionTemplateMetadata,
  IrtParameters,
  DistractorAttractivenessProfile,
  BloomLevel,
} from '../common/interfaces';
import { CreateTemplateDto } from '../common/dto/create-template.dto';
import { UpdateTemplateDto } from '../common/dto/update-template.dto';
import { GenerateTemplateDto } from '../common/dto/generate-template.dto';
import { ListTemplatesQueryDto } from '../common/dto/list-templates-query.dto';

const COLLECTION = 'questions';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly geminiService: GeminiService,
    private readonly validationService: ValidationService,
  ) {}

  async create(dto: CreateTemplateDto): Promise<QuestionTemplate> {
    const templateId = uuidv4();
    const now = new Date().toISOString();

    // Validate template
    const validationResult = await this.validationService.validateTemplate(
      dto.templateText,
      dto.parameters,
      dto.answerFormula,
      dto.distractors,
    );

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Template validation failed',
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
    }

    // Check for duplicates
    const duplicateCheck = await this.validationService.checkDuplicates(
      dto.templateText,
      dto.subject,
      dto.topic,
    );

    if (duplicateCheck.isDuplicate) {
      throw new ConflictException({
        message: 'Similar template already exists',
        similarTemplateIds: duplicateCheck.similarTemplateIds,
      });
    }

    const metadata: QuestionTemplateMetadata = {
      subject: dto.subject,
      topic: dto.topic,
      subtopic: dto.subtopic,
      bloomLevel: dto.bloomLevel,
      fieldTestCount: 0,
      calibrationDate: null,
      createdAt: now,
      updatedAt: now,
      createdBy: dto.createdBy || 'system',
      status: 'draft',
      isDeleted: false,
    };

    const defaultIrtParams: IrtParameters = {
      aMean: 1.0,
      aStd: 0.0,
      bMean: 0.0,
      bStd: 0.0,
      cMean: 0.25,
      cStd: 0.0,
    };

    const defaultProfile: DistractorAttractivenessProfile = {
      A: 0.25,
      B: 0.25,
      C: 0.25,
      D: 0.25,
    };

    const template: QuestionTemplate = {
      id: templateId,
      metadata,
      template: {
        text: dto.templateText,
        parameters: dto.parameters,
        answerFormula: dto.answerFormula,
        distractors: dto.distractors,
      },
      irtParams: defaultIrtParams,
      distractorProfile: defaultProfile,
    };

    await this.firestoreService.create(COLLECTION, templateId, template);

    this.logger.log(`Created template ${templateId} for ${dto.subject}/${dto.topic}/${dto.subtopic}`);

    if (validationResult.warnings.length > 0) {
      this.logger.warn(`Template ${templateId} warnings: ${validationResult.warnings.join('; ')}`);
    }

    return template;
  }

  async generateAndCreate(dto: GenerateTemplateDto): Promise<QuestionTemplate> {
    this.logger.log(
      `Generating template via Gemini: ${dto.subject}/${dto.topic}/${dto.subtopic} (bloom: ${dto.bloomLevel})`,
    );

    const generated = await this.geminiService.generateTemplate(
      dto.subject,
      dto.topic,
      dto.subtopic,
      dto.bloomLevel,
      dto.exampleTemplate,
    );

    return this.create({
      subject: dto.subject,
      topic: dto.topic,
      subtopic: dto.subtopic,
      bloomLevel: dto.bloomLevel,
      templateText: generated.templateText,
      parameters: generated.parameters,
      answerFormula: generated.answerFormula,
      distractors: generated.distractors,
      createdBy: dto.createdBy || 'gemini',
    });
  }

  async getById(templateId: string): Promise<QuestionTemplate> {
    const template = await this.firestoreService.getById<QuestionTemplate>(COLLECTION, templateId);

    if (!template || template.metadata.isDeleted) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return template;
  }

  async list(
    query: ListTemplatesQueryDto,
  ): Promise<{ items: QuestionTemplate[]; nextPageToken: string | null }> {
    const filters: FirestoreQueryFilter[] = [
      { field: 'metadata.isDeleted', operator: '==', value: false },
    ];

    if (query.subject) {
      filters.push({ field: 'metadata.subject', operator: '==', value: query.subject });
    }

    if (query.topic) {
      filters.push({ field: 'metadata.topic', operator: '==', value: query.topic });
    }

    if (query.bloomLevel) {
      filters.push({ field: 'metadata.bloomLevel', operator: '==', value: query.bloomLevel });
    }

    if (query.status) {
      filters.push({ field: 'metadata.status', operator: '==', value: query.status });
    }

    const { items, lastDocId } = await this.firestoreService.list<QuestionTemplate>(COLLECTION, {
      filters,
      limit: query.limit || 20,
      startAfterDocId: query.startAfter,
      orderBy: { field: 'metadata.createdAt', direction: 'desc' },
    });

    return { items, nextPageToken: lastDocId };
  }

  async update(templateId: string, dto: UpdateTemplateDto): Promise<QuestionTemplate> {
    const existing = await this.getById(templateId);
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      'metadata.updatedAt': now,
    };

    if (dto.subject !== undefined) updateData['metadata.subject'] = dto.subject;
    if (dto.topic !== undefined) updateData['metadata.topic'] = dto.topic;
    if (dto.subtopic !== undefined) updateData['metadata.subtopic'] = dto.subtopic;
    if (dto.bloomLevel !== undefined) updateData['metadata.bloomLevel'] = dto.bloomLevel;
    if (dto.status !== undefined) updateData['metadata.status'] = dto.status;

    // If template content is being updated, re-validate
    const newText = dto.templateText ?? existing.template.text;
    const newParams = dto.parameters ?? existing.template.parameters;
    const newFormula = dto.answerFormula ?? existing.template.answerFormula;
    const newDistractors = dto.distractors ?? existing.template.distractors;

    if (dto.templateText || dto.parameters || dto.answerFormula || dto.distractors) {
      const validationResult = await this.validationService.validateTemplate(
        newText,
        newParams,
        newFormula,
        newDistractors,
      );

      if (!validationResult.valid) {
        throw new BadRequestException({
          message: 'Template validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        });
      }

      // Check for duplicates (excluding self)
      const duplicateCheck = await this.validationService.checkDuplicates(
        newText,
        dto.subject ?? existing.metadata.subject,
        dto.topic ?? existing.metadata.topic,
        templateId,
      );

      if (duplicateCheck.isDuplicate) {
        throw new ConflictException({
          message: 'Similar template already exists',
          similarTemplateIds: duplicateCheck.similarTemplateIds,
        });
      }

      if (dto.templateText !== undefined) updateData['template.text'] = dto.templateText;
      if (dto.parameters !== undefined) updateData['template.parameters'] = dto.parameters;
      if (dto.answerFormula !== undefined) updateData['template.answerFormula'] = dto.answerFormula;
      if (dto.distractors !== undefined) updateData['template.distractors'] = dto.distractors;
    }

    if (dto.irtParams) {
      updateData['irtParams'] = dto.irtParams;
    }

    await this.firestoreService.update(COLLECTION, templateId, updateData);

    this.logger.log(`Updated template ${templateId}`);

    return this.getById(templateId);
  }

  async delete(templateId: string): Promise<void> {
    // Verify it exists first
    await this.getById(templateId);

    // Soft delete
    await this.firestoreService.softDelete(COLLECTION, templateId);

    this.logger.log(`Soft-deleted template ${templateId}`);
  }

  async triggerFieldTest(templateId: string): Promise<{ messageId: string }> {
    const template = await this.getById(templateId);

    if (template.metadata.status !== 'review' && template.metadata.status !== 'draft') {
      throw new BadRequestException(
        `Template must be in "draft" or "review" status to trigger field testing. Current status: "${template.metadata.status}".`,
      );
    }

    await this.firestoreService.update(COLLECTION, templateId, {
      'metadata.status': 'field_testing',
      'metadata.updatedAt': new Date().toISOString(),
    });

    const messageId = await this.validationService.triggerIrtCalibration(templateId);

    this.logger.log(`Triggered field test for template ${templateId} (messageId: ${messageId})`);

    return { messageId };
  }
}
