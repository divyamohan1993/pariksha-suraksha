export enum BloomLevel {
  REMEMBER = 'remember',
  UNDERSTAND = 'understand',
  APPLY = 'apply',
  ANALYZE = 'analyze',
  EVALUATE = 'evaluate',
  CREATE = 'create',
}

export enum DistractorType {
  COMMON_MISCONCEPTION = 'common_misconception',
  CALCULATION_ERROR = 'calculation_error',
  UNIT_ERROR = 'unit_error',
}

export enum ParameterType {
  INTEGER = 'integer',
  FLOAT = 'float',
  STRING = 'string',
}

export interface ParameterDefinition {
  name: string;
  type: ParameterType;
  min?: number;
  max?: number;
  step?: number;
  allowedValues?: string[];
  unit?: string;
  description: string;
}

export interface DistractorDefinition {
  formula: string;
  type: DistractorType;
  label: string;
  explanation: string;
}

export interface IrtParameters {
  aMean: number;
  aStd: number;
  bMean: number;
  bStd: number;
  cMean: number;
  cStd: number;
}

export interface DistractorAttractivenessProfile {
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface QuestionTemplateMetadata {
  subject: string;
  topic: string;
  subtopic: string;
  bloomLevel: BloomLevel;
  fieldTestCount: number;
  calibrationDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: 'draft' | 'review' | 'field_testing' | 'calibrated' | 'production' | 'retired';
  isDeleted: boolean;
}

export interface QuestionTemplate {
  id: string;
  metadata: QuestionTemplateMetadata;
  template: {
    text: string;
    parameters: ParameterDefinition[];
    answerFormula: string;
    distractors: DistractorDefinition[];
  };
  irtParams: IrtParameters;
  distractorProfile: DistractorAttractivenessProfile;
}

export interface Instantiation {
  id: string;
  templateId: string;
  params: Record<string, number | string>;
  irt: {
    a: number;
    b: number;
    c: number;
  };
  distractorProfile: DistractorAttractivenessProfile;
}
