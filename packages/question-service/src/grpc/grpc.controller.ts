import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { TemplatesService } from '../templates/templates.service';
import { ExamService } from '../exam/exam.service';
import {
  BloomLevel,
  ParameterType,
  DistractorType,
  QuestionTemplate,
  Exam,
} from '../common/interfaces';

interface GetTemplateRequest {
  templateId: string;
}

interface ListTemplatesRequest {
  subject: string;
  topic: string;
  bloomLevel: string;
  status: string;
  limit: number;
  startAfter: string;
}

interface CreateTemplateRequest {
  subject: string;
  topic: string;
  subtopic: string;
  bloomLevel: string;
  templateText: string;
  parameters: Array<{
    name: string;
    type: string;
    min: number;
    max: number;
    step: number;
    allowedValues: string[];
    unit: string;
    description: string;
  }>;
  answerFormula: string;
  distractors: Array<{
    formula: string;
    type: string;
    label: string;
    explanation: string;
  }>;
  createdBy: string;
}

interface GenerateTemplateRequest {
  subject: string;
  topic: string;
  subtopic: string;
  bloomLevel: string;
  exampleTemplate: string;
  createdBy: string;
}

interface GetExamRequest {
  examId: string;
}

interface CreateExamRequest {
  name: string;
  date: string;
  subjects: string[];
  totalQuestions: number;
  totalCandidates: number;
  createdBy: string;
}

interface DefineBlueprintRequest {
  examId: string;
  difficultyDist: { easy: number; medium: number; hard: number };
  topicCoverage: Array<{
    topic: string;
    subtopics: string[];
    questionCount: number;
    weight: number;
  }>;
  questionsPerPaper: number;
}

interface TriggerMatrixSolverRequest {
  examId: string;
}

function mapBloomLevel(level: string): BloomLevel {
  const mapping: Record<string, BloomLevel> = {
    remember: BloomLevel.REMEMBER,
    understand: BloomLevel.UNDERSTAND,
    apply: BloomLevel.APPLY,
    analyze: BloomLevel.ANALYZE,
    evaluate: BloomLevel.EVALUATE,
    create: BloomLevel.CREATE,
  };
  return mapping[level.toLowerCase()] || BloomLevel.APPLY;
}

function mapParameterType(type: string): ParameterType {
  const mapping: Record<string, ParameterType> = {
    integer: ParameterType.INTEGER,
    float: ParameterType.FLOAT,
    string: ParameterType.STRING,
  };
  return mapping[type.toLowerCase()] || ParameterType.FLOAT;
}

function mapDistractorType(type: string): DistractorType {
  const mapping: Record<string, DistractorType> = {
    common_misconception: DistractorType.COMMON_MISCONCEPTION,
    calculation_error: DistractorType.CALCULATION_ERROR,
    unit_error: DistractorType.UNIT_ERROR,
  };
  return mapping[type.toLowerCase()] || DistractorType.COMMON_MISCONCEPTION;
}

function templateToGrpc(template: QuestionTemplate): Record<string, unknown> {
  return {
    id: template.id,
    metadata: {
      subject: template.metadata.subject,
      topic: template.metadata.topic,
      subtopic: template.metadata.subtopic,
      bloomLevel: template.metadata.bloomLevel,
      fieldTestCount: template.metadata.fieldTestCount,
      calibrationDate: template.metadata.calibrationDate || '',
      createdAt: template.metadata.createdAt,
      updatedAt: template.metadata.updatedAt,
      createdBy: template.metadata.createdBy,
      status: template.metadata.status,
      isDeleted: template.metadata.isDeleted,
    },
    template: {
      text: template.template.text,
      parameters: template.template.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        min: p.min ?? 0,
        max: p.max ?? 0,
        step: p.step ?? 0,
        allowedValues: p.allowedValues || [],
        unit: p.unit || '',
        description: p.description,
      })),
      answerFormula: template.template.answerFormula,
      distractors: template.template.distractors.map((d) => ({
        formula: d.formula,
        type: d.type,
        label: d.label,
        explanation: d.explanation,
      })),
    },
    irtParams: {
      aMean: template.irtParams.aMean,
      aStd: template.irtParams.aStd,
      bMean: template.irtParams.bMean,
      bStd: template.irtParams.bStd,
      cMean: template.irtParams.cMean,
      cStd: template.irtParams.cStd,
    },
    distractorProfile: {
      a: template.distractorProfile.A,
      b: template.distractorProfile.B,
      c: template.distractorProfile.C,
      d: template.distractorProfile.D,
    },
  };
}

function examToGrpc(exam: Exam): Record<string, unknown> {
  return {
    id: exam.id,
    metadata: {
      name: exam.metadata.name,
      date: exam.metadata.date,
      subjects: exam.metadata.subjects,
      totalQuestions: exam.metadata.totalQuestions,
      totalCandidates: exam.metadata.totalCandidates,
      status: exam.metadata.status,
      createdAt: exam.metadata.createdAt,
      updatedAt: exam.metadata.updatedAt,
      createdBy: exam.metadata.createdBy,
    },
    blueprint: exam.blueprint
      ? {
          difficultyDist: exam.blueprint.difficultyDist,
          topicCoverage: exam.blueprint.topicCoverage.map((tc) => ({
            topic: tc.topic,
            subtopics: tc.subtopics,
            questionCount: tc.questionCount,
            weight: tc.weight,
          })),
          questionsPerPaper: exam.blueprint.questionsPerPaper,
        }
      : undefined,
  };
}

@Controller()
export class GrpcController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly examService: ExamService,
  ) {}

  @GrpcMethod('QuestionService', 'GetTemplate')
  async getTemplate(data: GetTemplateRequest): Promise<Record<string, unknown>> {
    const template = await this.templatesService.getById(data.templateId);
    return templateToGrpc(template);
  }

  @GrpcMethod('QuestionService', 'ListTemplates')
  async listTemplates(data: ListTemplatesRequest): Promise<Record<string, unknown>> {
    const result = await this.templatesService.list({
      subject: data.subject || undefined,
      topic: data.topic || undefined,
      bloomLevel: data.bloomLevel ? mapBloomLevel(data.bloomLevel) : undefined,
      status: data.status || undefined,
      limit: data.limit || undefined,
      startAfter: data.startAfter || undefined,
    });

    return {
      items: result.items.map(templateToGrpc),
      nextPageToken: result.nextPageToken || '',
    };
  }

  @GrpcMethod('QuestionService', 'CreateTemplate')
  async createTemplate(data: CreateTemplateRequest): Promise<Record<string, unknown>> {
    const template = await this.templatesService.create({
      subject: data.subject,
      topic: data.topic,
      subtopic: data.subtopic,
      bloomLevel: mapBloomLevel(data.bloomLevel),
      templateText: data.templateText,
      parameters: data.parameters.map((p) => ({
        name: p.name,
        type: mapParameterType(p.type),
        min: p.min || undefined,
        max: p.max || undefined,
        step: p.step || undefined,
        allowedValues: p.allowedValues.length > 0 ? p.allowedValues : undefined,
        unit: p.unit || undefined,
        description: p.description,
      })),
      answerFormula: data.answerFormula,
      distractors: data.distractors.map((d) => ({
        formula: d.formula,
        type: mapDistractorType(d.type),
        label: d.label,
        explanation: d.explanation,
      })),
      createdBy: data.createdBy || undefined,
    });

    return templateToGrpc(template);
  }

  @GrpcMethod('QuestionService', 'GenerateTemplate')
  async generateTemplate(data: GenerateTemplateRequest): Promise<Record<string, unknown>> {
    const template = await this.templatesService.generateAndCreate({
      subject: data.subject,
      topic: data.topic,
      subtopic: data.subtopic,
      bloomLevel: mapBloomLevel(data.bloomLevel),
      exampleTemplate: data.exampleTemplate || undefined,
      createdBy: data.createdBy || undefined,
    });

    return templateToGrpc(template);
  }

  @GrpcMethod('QuestionService', 'GetExam')
  async getExam(data: GetExamRequest): Promise<Record<string, unknown>> {
    const exam = await this.examService.getById(data.examId);
    return examToGrpc(exam);
  }

  @GrpcMethod('QuestionService', 'CreateExam')
  async createExam(data: CreateExamRequest): Promise<Record<string, unknown>> {
    const exam = await this.examService.create({
      name: data.name,
      date: data.date,
      subjects: data.subjects,
      totalQuestions: data.totalQuestions,
      totalCandidates: data.totalCandidates,
      createdBy: data.createdBy || undefined,
    });

    return examToGrpc(exam);
  }

  @GrpcMethod('QuestionService', 'DefineBlueprint')
  async defineBlueprint(data: DefineBlueprintRequest): Promise<Record<string, unknown>> {
    const exam = await this.examService.defineBlueprint(data.examId, {
      difficultyDist: data.difficultyDist,
      topicCoverage: data.topicCoverage,
      questionsPerPaper: data.questionsPerPaper,
    });

    return examToGrpc(exam);
  }

  @GrpcMethod('QuestionService', 'TriggerMatrixSolver')
  async triggerMatrixSolver(
    data: TriggerMatrixSolverRequest,
  ): Promise<{ messageId: string; correlationId: string }> {
    return this.examService.triggerMatrixSolver(data.examId);
  }
}
