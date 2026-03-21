import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  VertexAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
  Content,
} from '@google-cloud/vertexai';
import {
  BloomLevel,
  ParameterDefinition,
  ParameterType,
  DistractorDefinition,
  DistractorType,
} from '../common/interfaces';

export interface GeminiGeneratedTemplate {
  templateText: string;
  parameters: ParameterDefinition[];
  answerFormula: string;
  distractors: DistractorDefinition[];
}

interface RateLimitEntry {
  timestamp: number;
}

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private model!: GenerativeModel;
  private readonly requestLog: RateLimitEntry[] = [];
  private readonly MAX_REQUESTS_PER_MINUTE = 60;

  async onModuleInit(): Promise<void> {
    const projectId = process.env['GCP_PROJECT_ID'] || 'pariksha-suraksha';
    const location = process.env['GCP_REGION'] || 'us-central1';

    const vertexAI = new VertexAI({ project: projectId, location });

    this.model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    });

    this.logger.log('Gemini 2.5 Pro model initialized via Vertex AI');
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    // Remove entries older than 1 minute
    while (this.requestLog.length > 0 && this.requestLog[0]!.timestamp < oneMinuteAgo) {
      this.requestLog.shift();
    }

    if (this.requestLog.length >= this.MAX_REQUESTS_PER_MINUTE) {
      const oldestInWindow = this.requestLog[0]!.timestamp;
      const waitMs = oldestInWindow + 60_000 - now;
      throw new Error(
        `Gemini rate limit exceeded (${this.MAX_REQUESTS_PER_MINUTE}/min). ` +
          `Retry after ${Math.ceil(waitMs / 1000)} seconds.`,
      );
    }

    this.requestLog.push({ timestamp: now });
  }

  private buildPrompt(
    subject: string,
    topic: string,
    subtopic: string,
    bloomLevel: BloomLevel,
    exampleTemplate?: string,
  ): Content[] {
    const exampleSection = exampleTemplate
      ? `
Here is an example template for reference (generate a DIFFERENT question, not a copy):
\`\`\`
${exampleTemplate}
\`\`\`
`
      : '';

    const systemPrompt = `You are an expert question designer for high-stakes competitive examinations in India (like JEE, NEET, GATE). You create parameterized question templates that produce unique but psychometrically equivalent question instances.

Your output must be valid JSON matching the exact schema below. Do not include any text outside the JSON.`;

    const userPrompt = `Generate a parameterized question template with the following specifications:

**Subject:** ${subject}
**Topic:** ${topic}
**Subtopic:** ${subtopic}
**Bloom's Taxonomy Level:** ${bloomLevel}
${exampleSection}

## Output JSON Schema

\`\`\`json
{
  "templateText": "string — The question text with {{param_name}} placeholders for variable parts. Use LaTeX for math: $...$. Every numerical value that can vary MUST be a placeholder.",
  "parameters": [
    {
      "name": "string — parameter name matching {{param_name}} in template text",
      "type": "integer | float | string",
      "min": "number — minimum value (for numeric types)",
      "max": "number — maximum value (for numeric types)",
      "step": "number — step increment (for numeric types)",
      "unit": "string — physical unit if applicable (e.g., 'm/s', 'kg')",
      "description": "string — what this parameter represents"
    }
  ],
  "answerFormula": "string — symbolic formula using parameter names that computes the correct answer. Use standard math notation: +, -, *, /, ^, sqrt(), sin(), cos(), log(), pi, e",
  "distractors": [
    {
      "formula": "string — symbolic formula that produces this distractor value",
      "type": "common_misconception | calculation_error | unit_error",
      "label": "string — short label for this distractor",
      "explanation": "string — why a student might choose this (the misconception or error)"
    }
  ]
}
\`\`\`

## Requirements

1. **Template text**: Must be a complete, well-formed question. Use {{param}} syntax for all variable numerical values. Include units where appropriate.
2. **Parameters**: Define 2-5 parameters. Each numeric parameter must have min, max, and step. Ranges should produce solvable problems with reasonable numbers (no fractions with huge denominators, no negative under square roots, etc.).
3. **Answer formula**: Must be a single symbolic expression using the parameter names. When evaluated with any valid parameter combination, it must produce a valid numeric answer.
4. **Distractors**: Exactly 3 distractors. Each must:
   - Have a formula that is symbolically different from the answer formula
   - Never equal the correct answer for ANY valid parameter combination
   - Represent a realistic student error:
     - \`common_misconception\`: applying a wrong concept (e.g., forgetting gravity direction)
     - \`calculation_error\`: arithmetic/algebraic mistake (e.g., forgetting to square, wrong sign)
     - \`unit_error\`: dimensional error (e.g., not converting km to m)
   - Include at least one \`common_misconception\` type

Respond with ONLY the JSON object, no markdown fences, no explanation.`;

    return [
      { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
    ];
  }

  private parseGeminiResponse(responseText: string): GeminiGeneratedTemplate {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error(`Failed to parse Gemini response as JSON: ${cleaned.slice(0, 200)}...`);
      throw new Error('Gemini returned invalid JSON. Please retry.');
    }

    // Validate required fields
    if (
      typeof parsed['templateText'] !== 'string' ||
      !Array.isArray(parsed['parameters']) ||
      typeof parsed['answerFormula'] !== 'string' ||
      !Array.isArray(parsed['distractors'])
    ) {
      throw new Error('Gemini response missing required fields (templateText, parameters, answerFormula, distractors).');
    }

    const parameters: ParameterDefinition[] = (parsed['parameters'] as Record<string, unknown>[]).map((p) => {
      const paramType = this.mapParameterType(p['type'] as string);
      return {
        name: String(p['name']),
        type: paramType,
        min: typeof p['min'] === 'number' ? p['min'] : undefined,
        max: typeof p['max'] === 'number' ? p['max'] : undefined,
        step: typeof p['step'] === 'number' ? p['step'] : undefined,
        allowedValues: Array.isArray(p['allowedValues'])
          ? (p['allowedValues'] as string[])
          : undefined,
        unit: typeof p['unit'] === 'string' ? p['unit'] : undefined,
        description: String(p['description'] || ''),
      };
    });

    const distractors: DistractorDefinition[] = (parsed['distractors'] as Record<string, unknown>[]).map(
      (d) => ({
        formula: String(d['formula']),
        type: this.mapDistractorType(d['type'] as string),
        label: String(d['label'] || ''),
        explanation: String(d['explanation'] || ''),
      }),
    );

    // Validate we have exactly 3 distractors
    if (distractors.length !== 3) {
      throw new Error(
        `Expected exactly 3 distractors, got ${distractors.length}. Please retry.`,
      );
    }

    // Validate at least one common_misconception
    const hasMisconception = distractors.some(
      (d) => d.type === DistractorType.COMMON_MISCONCEPTION,
    );
    if (!hasMisconception) {
      throw new Error('At least one distractor must be of type common_misconception.');
    }

    // Validate template text contains parameter placeholders
    for (const param of parameters) {
      if (!String(parsed['templateText']).includes(`{{${param.name}}}`)) {
        this.logger.warn(
          `Parameter "${param.name}" not found in template text. Accepting anyway.`,
        );
      }
    }

    return {
      templateText: String(parsed['templateText']),
      parameters,
      answerFormula: String(parsed['answerFormula']),
      distractors,
    };
  }

  private mapParameterType(type: string): ParameterType {
    switch (type?.toLowerCase()) {
      case 'integer':
      case 'int':
        return ParameterType.INTEGER;
      case 'float':
      case 'decimal':
      case 'number':
        return ParameterType.FLOAT;
      case 'string':
      case 'text':
        return ParameterType.STRING;
      default:
        return ParameterType.FLOAT;
    }
  }

  private mapDistractorType(type: string): DistractorType {
    switch (type?.toLowerCase()) {
      case 'common_misconception':
        return DistractorType.COMMON_MISCONCEPTION;
      case 'calculation_error':
        return DistractorType.CALCULATION_ERROR;
      case 'unit_error':
        return DistractorType.UNIT_ERROR;
      default:
        return DistractorType.COMMON_MISCONCEPTION;
    }
  }

  async generateTemplate(
    subject: string,
    topic: string,
    subtopic: string,
    bloomLevel: BloomLevel,
    exampleTemplate?: string,
  ): Promise<GeminiGeneratedTemplate> {
    this.enforceRateLimit();

    const contents = this.buildPrompt(subject, topic, subtopic, bloomLevel, exampleTemplate);

    this.logger.log(
      `Generating template: subject=${subject}, topic=${topic}, subtopic=${subtopic}, bloom=${bloomLevel}`,
    );

    const result = await this.model.generateContent({ contents });
    const response = result.response;

    if (
      !response.candidates ||
      response.candidates.length === 0 ||
      !response.candidates[0]?.content?.parts?.[0]
    ) {
      throw new Error('Gemini returned empty response. The request may have been blocked by safety filters.');
    }

    const textPart = response.candidates[0].content.parts[0];
    if (!('text' in textPart) || typeof textPart.text !== 'string') {
      throw new Error('Gemini response did not contain text content.');
    }

    const responseText = textPart.text;
    this.logger.debug(`Gemini raw response length: ${responseText.length} chars`);

    return this.parseGeminiResponse(responseText);
  }
}
