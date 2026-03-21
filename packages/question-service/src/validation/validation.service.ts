import { Injectable, Logger } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { PubSubService } from '../pubsub/pubsub.service';
import {
  ParameterDefinition,
  ParameterType,
  DistractorDefinition,
  QuestionTemplate,
} from '../common/interfaces';
import { v4 as uuidv4 } from 'uuid';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ParameterSample {
  [paramName: string]: number;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  private static readonly SAMPLE_COUNT = 50;
  private static readonly COSINE_SIMILARITY_THRESHOLD = 0.92;

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly pubsubService: PubSubService,
  ) {}

  async validateTemplate(
    templateText: string,
    parameters: ParameterDefinition[],
    answerFormula: string,
    distractors: DistractorDefinition[],
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Parameter range check
    const rangeResult = this.validateParameterRanges(parameters);
    errors.push(...rangeResult.errors);
    warnings.push(...rangeResult.warnings);

    // Step 2: Generate sample instantiations
    const samples = this.generateSamples(parameters);

    // Step 3: Answer formula validation
    const formulaResult = this.validateAnswerFormula(answerFormula, samples);
    errors.push(...formulaResult.errors);
    warnings.push(...formulaResult.warnings);

    // Step 4: Distractor validation
    const distractorResult = this.validateDistractors(
      answerFormula,
      distractors,
      samples,
    );
    errors.push(...distractorResult.errors);
    warnings.push(...distractorResult.warnings);

    // Step 5: Template text placeholder validation
    const placeholderResult = this.validatePlaceholders(templateText, parameters);
    errors.push(...placeholderResult.errors);
    warnings.push(...placeholderResult.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateParameterRanges(parameters: ParameterDefinition[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (parameters.length === 0) {
      errors.push('Template must have at least one parameter.');
      return { valid: false, errors, warnings };
    }

    if (parameters.length > 10) {
      warnings.push(`Template has ${parameters.length} parameters. Consider simplifying.`);
    }

    for (const param of parameters) {
      if (param.type === ParameterType.STRING) {
        if (!param.allowedValues || param.allowedValues.length === 0) {
          errors.push(`String parameter "${param.name}" must have allowedValues defined.`);
        }
        continue;
      }

      if (param.min === undefined || param.max === undefined) {
        errors.push(`Numeric parameter "${param.name}" must have min and max defined.`);
        continue;
      }

      if (param.min >= param.max) {
        errors.push(`Parameter "${param.name}": min (${param.min}) must be less than max (${param.max}).`);
      }

      if (param.step !== undefined && param.step <= 0) {
        errors.push(`Parameter "${param.name}": step must be positive.`);
      }

      if (param.step !== undefined) {
        const range = param.max - param.min;
        const possibleValues = Math.floor(range / param.step) + 1;
        if (possibleValues < 3) {
          warnings.push(
            `Parameter "${param.name}" has only ${possibleValues} possible values. Consider widening the range.`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private generateSamples(parameters: ParameterDefinition[]): ParameterSample[] {
    const samples: ParameterSample[] = [];
    const numericParams = parameters.filter((p) => p.type !== ParameterType.STRING);

    for (let i = 0; i < ValidationService.SAMPLE_COUNT; i++) {
      const sample: ParameterSample = {};
      for (const param of numericParams) {
        const min = param.min ?? 0;
        const max = param.max ?? 100;
        const step = param.step ?? 1;

        const steps = Math.floor((max - min) / step);
        const randomStep = Math.floor(Math.random() * (steps + 1));
        sample[param.name] = min + randomStep * step;
      }
      samples.push(sample);
    }

    // Add boundary cases
    const minSample: ParameterSample = {};
    const maxSample: ParameterSample = {};
    for (const param of numericParams) {
      minSample[param.name] = param.min ?? 0;
      maxSample[param.name] = param.max ?? 100;
    }
    samples.push(minSample, maxSample);

    return samples;
  }

  evaluateFormula(formula: string, params: ParameterSample): number | null {
    try {
      // Replace ^ with ** for exponentiation
      let processedFormula = formula.replace(/\^/g, '**');

      // Replace parameter references with values
      for (const [name, value] of Object.entries(params)) {
        const regex = new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'g');
        processedFormula = processedFormula.replace(regex, String(value));
      }

      // Replace math function names with Math.xxx calls for safe evaluation
      const mathReplacements: [RegExp, string][] = [
        [/\bsqrt\b/g, 'Math.sqrt'],
        [/\babs\b/g, 'Math.abs'],
        [/\bsin\b/g, 'Math.sin'],
        [/\bcos\b/g, 'Math.cos'],
        [/\btan\b/g, 'Math.tan'],
        [/\blog10\b/g, 'Math.log10'],
        [/\blog2\b/g, 'Math.log2'],
        [/\blog\b/g, 'Math.log'],
        [/\bexp\b/g, 'Math.exp'],
        [/\bceil\b/g, 'Math.ceil'],
        [/\bfloor\b/g, 'Math.floor'],
        [/\bround\b/g, 'Math.round'],
        [/\bpi\b/gi, String(Math.PI)],
      ];

      for (const [pattern, replacement] of mathReplacements) {
        processedFormula = processedFormula.replace(pattern, replacement);
      }

      // Use indirect eval via Function constructor with no external scope access
      const fn = new Function(`"use strict"; return (${processedFormula});`);
      const result = fn() as unknown;

      if (typeof result !== 'number' || !isFinite(result)) {
        return null;
      }

      return result;
    } catch {
      return null;
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateAnswerFormula(
    answerFormula: string,
    samples: ParameterSample[],
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let failCount = 0;

    for (const sample of samples) {
      const result = this.evaluateFormula(answerFormula, sample);
      if (result === null) {
        failCount++;
      }
    }

    if (failCount === samples.length) {
      errors.push(
        `Answer formula "${answerFormula}" failed to produce a valid result for ALL ${samples.length} sample instantiations. The formula may be syntactically invalid.`,
      );
    } else if (failCount > 0) {
      const failRate = ((failCount / samples.length) * 100).toFixed(1);
      errors.push(
        `Answer formula failed for ${failCount}/${samples.length} (${failRate}%) sample instantiations. Some parameter combinations produce invalid results (NaN, Infinity, or division by zero).`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateDistractors(
    answerFormula: string,
    distractors: DistractorDefinition[],
    samples: ParameterSample[],
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (distractors.length === 0) {
      errors.push('Template must have at least one distractor.');
      return { valid: false, errors, warnings };
    }

    if (distractors.length !== 3) {
      errors.push(`Expected exactly 3 distractors, got ${distractors.length}.`);
    }

    for (let dIdx = 0; dIdx < distractors.length; dIdx++) {
      const distractor = distractors[dIdx]!;
      let collisionCount = 0;
      let evalFailCount = 0;

      for (const sample of samples) {
        const correctAnswer = this.evaluateFormula(answerFormula, sample);
        const distractorAnswer = this.evaluateFormula(distractor.formula, sample);

        if (correctAnswer === null || distractorAnswer === null) {
          evalFailCount++;
          continue;
        }

        // Check if distractor equals correct answer (within floating point tolerance)
        if (Math.abs(correctAnswer - distractorAnswer) < 1e-9) {
          collisionCount++;
        }
      }

      if (collisionCount > 0) {
        errors.push(
          `Distractor ${dIdx + 1} ("${distractor.label}") equals the correct answer for ${collisionCount}/${samples.length} sample instantiations. Formula: "${distractor.formula}".`,
        );
      }

      if (evalFailCount === samples.length) {
        errors.push(
          `Distractor ${dIdx + 1} ("${distractor.label}") formula "${distractor.formula}" failed to evaluate for ALL samples.`,
        );
      } else if (evalFailCount > samples.length * 0.1) {
        warnings.push(
          `Distractor ${dIdx + 1} ("${distractor.label}") formula failed for ${evalFailCount}/${samples.length} samples.`,
        );
      }
    }

    // Check distractors are distinct from each other
    for (let i = 0; i < distractors.length; i++) {
      for (let j = i + 1; j < distractors.length; j++) {
        let identicalCount = 0;
        for (const sample of samples) {
          const valI = this.evaluateFormula(distractors[i]!.formula, sample);
          const valJ = this.evaluateFormula(distractors[j]!.formula, sample);
          if (valI !== null && valJ !== null && Math.abs(valI - valJ) < 1e-9) {
            identicalCount++;
          }
        }
        if (identicalCount > samples.length * 0.9) {
          errors.push(
            `Distractors ${i + 1} and ${j + 1} produce identical values for ${identicalCount}/${samples.length} samples. They are effectively the same distractor.`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validatePlaceholders(
    templateText: string,
    parameters: ParameterDefinition[],
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check all parameters are referenced in template
    for (const param of parameters) {
      if (!templateText.includes(`{{${param.name}}}`)) {
        warnings.push(
          `Parameter "${param.name}" is defined but not used in template text.`,
        );
      }
    }

    // Check all placeholders in template have matching parameters
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(templateText)) !== null) {
      const placeholderName = match[1]!;
      const paramExists = parameters.some((p) => p.name === placeholderName);
      if (!paramExists) {
        errors.push(
          `Placeholder "{{${placeholderName}}}" in template text has no matching parameter definition.`,
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async checkDuplicates(
    templateText: string,
    subject: string,
    topic: string,
    excludeTemplateId?: string,
  ): Promise<{ isDuplicate: boolean; similarTemplateIds: string[] }> {
    // Fetch existing templates for the same subject/topic
    const { items: existingTemplates } = await this.firestoreService.list<QuestionTemplate>(
      'questions',
      {
        filters: [
          { field: 'metadata.subject', operator: '==', value: subject },
          { field: 'metadata.topic', operator: '==', value: topic },
          { field: 'metadata.isDeleted', operator: '==', value: false },
        ],
        limit: 100,
      },
    );

    const similarTemplateIds: string[] = [];
    const inputTokens = this.tokenize(templateText);
    const inputMagnitude = this.vectorMagnitude(inputTokens);

    if (inputMagnitude === 0) {
      return { isDuplicate: false, similarTemplateIds: [] };
    }

    for (const existing of existingTemplates) {
      if (excludeTemplateId && existing.id === excludeTemplateId) {
        continue;
      }

      const existingTokens = this.tokenize(existing.template.text);
      const existingMagnitude = this.vectorMagnitude(existingTokens);

      if (existingMagnitude === 0) {
        continue;
      }

      const similarity = this.cosineSimilarity(inputTokens, existingTokens, inputMagnitude, existingMagnitude);

      if (similarity >= ValidationService.COSINE_SIMILARITY_THRESHOLD) {
        similarTemplateIds.push(existing.id);
        this.logger.debug(
          `Template similar to ${existing.id} (cosine similarity: ${similarity.toFixed(4)})`,
        );
      }
    }

    return {
      isDuplicate: similarTemplateIds.length > 0,
      similarTemplateIds,
    };
  }

  private tokenize(text: string): Map<string, number> {
    const tokens = new Map<string, number>();
    // Remove LaTeX, placeholders, and punctuation; lowercase; split into words
    const cleaned = text
      .replace(/\$[^$]*\$/g, ' MATH ')
      .replace(/\{\{[^}]+\}\}/g, ' PARAM ')
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);

    for (const token of cleaned) {
      tokens.set(token, (tokens.get(token) || 0) + 1);
    }
    return tokens;
  }

  private vectorMagnitude(tokens: Map<string, number>): number {
    let sum = 0;
    for (const count of tokens.values()) {
      sum += count * count;
    }
    return Math.sqrt(sum);
  }

  private cosineSimilarity(
    a: Map<string, number>,
    b: Map<string, number>,
    magA: number,
    magB: number,
  ): number {
    let dotProduct = 0;
    for (const [token, countA] of a) {
      const countB = b.get(token);
      if (countB !== undefined) {
        dotProduct += countA * countB;
      }
    }
    return dotProduct / (magA * magB);
  }

  async triggerIrtCalibration(templateId: string): Promise<string> {
    const correlationId = uuidv4();
    const messageId = await this.pubsubService.publishToIrtCalibration(
      templateId,
      correlationId,
    );
    this.logger.log(
      `Triggered IRT calibration for template ${templateId} (messageId: ${messageId}, correlationId: ${correlationId})`,
    );
    return messageId;
  }
}
