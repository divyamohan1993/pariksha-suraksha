import { Injectable, Logger } from '@nestjs/common';
import * as katex from 'katex';
import { createHash } from 'crypto';
import {
  DecryptedQuestion,
  RenderedQuestion,
  RenderedOption,
  PreRenderedPaper,
  PaperMetadata,
  SectionMetadata,
  QuestionAssignment,
} from '../common/interfaces/paper.interfaces';

@Injectable()
export class RenderingService {
  private readonly logger = new Logger(RenderingService.name);

  /**
   * Render a complete paper from decrypted question data.
   * Produces a PreRenderedPaper JSON suitable for direct delivery to the exam terminal.
   */
  renderPaper(
    examId: string,
    centerId: string,
    seatNum: string,
    questions: DecryptedQuestion[],
    durationMinutes: number,
  ): PreRenderedPaper {
    const renderedQuestions = questions.map((q) => this.renderQuestion(q));

    const metadata = this.buildMetadata(renderedQuestions, questions, durationMinutes);

    const paperContent = JSON.stringify({ examId, centerId, seatNum, questions: renderedQuestions });
    const paperHash = createHash('sha256').update(paperContent).digest('hex');

    return {
      examId,
      centerId,
      seatNum,
      renderedAt: new Date().toISOString(),
      paperHash,
      metadata,
      questions: renderedQuestions,
    };
  }

  /**
   * Render a single question: resolve template parameters and apply KaTeX for math expressions.
   */
  renderQuestion(question: DecryptedQuestion): RenderedQuestion {
    // Resolve template text with parameter values
    const resolvedText = this.resolveTemplate(question.templateText, question.params);

    // Render KaTeX expressions in the resolved text
    const renderedText = this.renderKaTeX(resolvedText);

    // Render each option
    const options: RenderedOption[] = question.options.map((opt) => ({
      label: opt.label,
      renderedText: this.renderKaTeX(
        this.resolveTemplate(opt.text, question.params),
      ),
    }));

    return {
      position: question.position,
      questionId: `${question.templateId}:${question.paramInstantiationId}`,
      renderedText,
      options,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
      section: question.section,
      bloomLevel: question.bloomLevel,
    };
  }

  /**
   * Generate a printable PDF version of the paper (future hybrid mode — Phase 3).
   * Currently returns a structured object that downstream services can convert to PDF.
   */
  renderPaperPdf(
    examId: string,
    centerId: string,
    seatNum: string,
    questions: DecryptedQuestion[],
    durationMinutes: number,
  ): { paper: PreRenderedPaper; pdfReady: boolean; format: string } {
    const paper = this.renderPaper(examId, centerId, seatNum, questions, durationMinutes);

    // Phase 1: return structured data for future PDF generation
    // Phase 3: integrate with secure printer service for decrypt-then-print mode
    return {
      paper,
      pdfReady: false,
      format: 'json-printable',
    };
  }

  /**
   * Resolve parameter placeholders in a template string.
   * Placeholders use double-brace syntax: {{paramName}}
   */
  private resolveTemplate(template: string, params: Record<string, string | number>): string {
    let resolved = template;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = new RegExp(`\\{\\{\\s*${this.escapeRegex(key)}\\s*\\}\\}`, 'g');
      resolved = resolved.replace(placeholder, String(value));
    }
    return resolved;
  }

  /**
   * Render LaTeX expressions using KaTeX.
   * Supports both inline ($...$) and display ($$...$$) math.
   */
  private renderKaTeX(text: string): string {
    // First pass: render display math ($$...$$)
    let rendered = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex: string) => {
      return this.katexRender(latex.trim(), true);
    });

    // Second pass: render inline math ($...$) — avoid matching already-rendered display math
    rendered = rendered.replace(/(?<!\$)\$(?!\$)(.*?)\$(?!\$)/g, (_match, latex: string) => {
      return this.katexRender(latex.trim(), false);
    });

    // Third pass: render \( ... \) inline math
    rendered = rendered.replace(/\\\((.*?)\\\)/g, (_match, latex: string) => {
      return this.katexRender(latex.trim(), false);
    });

    // Fourth pass: render \[ ... \] display math
    rendered = rendered.replace(/\\\[([\s\S]*?)\\\]/g, (_match, latex: string) => {
      return this.katexRender(latex.trim(), true);
    });

    return rendered;
  }

  /**
   * Safely render a LaTeX string with KaTeX, falling back to raw text on error.
   */
  private katexRender(latex: string, displayMode: boolean): string {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'htmlAndMathml',
      });
    } catch (err) {
      this.logger.warn(`KaTeX rendering failed for: ${latex.substring(0, 50)}...`, (err as Error).message);
      return displayMode ? `<div class="math-error">${latex}</div>` : `<span class="math-error">${latex}</span>`;
    }
  }

  /**
   * Build paper metadata including section breakdown and time allocation.
   */
  private buildMetadata(
    renderedQuestions: RenderedQuestion[],
    sourceQuestions: DecryptedQuestion[],
    durationMinutes: number,
  ): PaperMetadata {
    const totalQuestions = renderedQuestions.length;
    const totalMarks = renderedQuestions.reduce((sum, q) => sum + q.marks, 0);

    // Group questions by section
    const sectionMap = new Map<string, { questions: RenderedQuestion[]; startPos: number; endPos: number }>();
    for (const q of renderedQuestions) {
      const existing = sectionMap.get(q.section);
      if (existing) {
        existing.questions.push(q);
        existing.endPos = Math.max(existing.endPos, q.position);
      } else {
        sectionMap.set(q.section, {
          questions: [q],
          startPos: q.position,
          endPos: q.position,
        });
      }
    }

    const sections: SectionMetadata[] = [];
    const timeAllocation: Record<string, number> = {};

    for (const [name, data] of sectionMap.entries()) {
      const sectionMarks = data.questions.reduce((sum, q) => sum + q.marks, 0);
      sections.push({
        name,
        questionCount: data.questions.length,
        startPosition: data.startPos,
        endPosition: data.endPos,
        totalMarks: sectionMarks,
      });
      // Allocate time proportional to marks
      timeAllocation[name] = Math.round((sectionMarks / totalMarks) * durationMinutes);
    }

    return {
      totalQuestions,
      totalMarks,
      durationMinutes,
      sections,
      timeAllocation,
    };
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
