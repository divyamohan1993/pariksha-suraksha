"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import katex from "katex";
import { Bookmark, BookmarkCheck, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/lib/exam-store";

/**
 * Renders question text with KaTeX math support.
 * LaTeX delimiters: $...$ for inline, $$...$$ for display mode.
 * Note: question text comes from the trusted exam API (pre-validated server-side
 * content from the question bank), not from user input.
 */
function renderMathToElements(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for display math $$...$$
    const displayIdx = remaining.indexOf("$$");
    if (displayIdx !== -1) {
      const endIdx = remaining.indexOf("$$", displayIdx + 2);
      if (endIdx !== -1) {
        // Text before the math
        if (displayIdx > 0) {
          elements.push(<span key={key++}>{remaining.slice(0, displayIdx)}</span>);
        }
        const mathStr = remaining.slice(displayIdx + 2, endIdx);
        try {
          const html = katex.renderToString(mathStr, { displayMode: true, throwOnError: false });
          elements.push(
            <span key={key++} className="block my-2" dangerouslySetInnerHTML={{ __html: html }} />
          );
        } catch {
          elements.push(<span key={key++}>$${mathStr}$$</span>);
        }
        remaining = remaining.slice(endIdx + 2);
        continue;
      }
    }

    // Check for inline math $...$
    const inlineIdx = remaining.indexOf("$");
    if (inlineIdx !== -1) {
      const endIdx = remaining.indexOf("$", inlineIdx + 1);
      if (endIdx !== -1) {
        if (inlineIdx > 0) {
          elements.push(<span key={key++}>{remaining.slice(0, inlineIdx)}</span>);
        }
        const mathStr = remaining.slice(inlineIdx + 1, endIdx);
        try {
          const html = katex.renderToString(mathStr, { displayMode: false, throwOnError: false });
          elements.push(
            <span key={key++} className="inline" dangerouslySetInnerHTML={{ __html: html }} />
          );
        } catch {
          elements.push(<span key={key++}>${mathStr}$</span>);
        }
        remaining = remaining.slice(endIdx + 1);
        continue;
      }
    }

    // No more math delimiters: output remaining text
    elements.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return elements;
}

function MathText({ text }: { text: string }) {
  const rendered = useMemo(() => renderMathToElements(text), [text]);
  return <>{rendered}</>;
}

export default function QuestionDisplay() {
  const questions = useExamStore((s) => s.questions);
  const currentIndex = useExamStore((s) => s.currentQuestionIndex);
  const responses = useExamStore((s) => s.responses);
  const selectChoice = useExamStore((s) => s.selectChoice);
  const clearResponse = useExamStore((s) => s.clearResponse);
  const toggleMarkForReview = useExamStore((s) => s.toggleMarkForReview);
  const previousQuestion = useExamStore((s) => s.previousQuestion);
  const saveAndNext = useExamStore((s) => s.saveAndNext);
  const nextQuestion = useExamStore((s) => s.nextQuestion);

  const question = questions[currentIndex];
  const response = responses.get(currentIndex);
  const selectedChoice = response?.selectedChoice ?? null;
  const markedForReview = response?.markedForReview ?? false;

  const questionRef = useRef<HTMLDivElement>(null);

  // Focus the question area when question changes (keyboard navigation)
  useEffect(() => {
    questionRef.current?.focus();
  }, [currentIndex]);

  // Keyboard shortcuts for option selection
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!question) return;

      // A/B/C/D keys for quick option selection
      const key = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(key)) {
        const option = question.options.find((o) => o.label === key);
        if (option) {
          e.preventDefault();
          selectChoice(option.label);
        }
      }

      // Arrow keys for question navigation
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          previousQuestion();
        }
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          nextQuestion();
        }
      }

      // M for mark for review
      if (e.key === "m" || e.key === "M") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleMarkForReview();
        }
      }
    },
    [question, selectChoice, previousQuestion, nextQuestion, toggleMarkForReview]
  );

  if (!question) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No question loaded.
      </div>
    );
  }

  return (
    <div
      ref={questionRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex flex-col h-full"
      role="region"
      aria-label={`Question ${currentIndex + 1} of ${questions.length}`}
    >
      {/* Question header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-foreground" aria-hidden="true">
            Q.{currentIndex + 1}
          </span>
          {question.section && (
            <span className="text-xs bg-pariksha-100 text-pariksha-700 px-2 py-0.5 rounded-full">
              {question.section}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mark for Review */}
          <button
            onClick={toggleMarkForReview}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              markedForReview
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            aria-pressed={markedForReview}
            aria-label={
              markedForReview
                ? "Unmark question for review"
                : "Mark question for review"
            }
          >
            {markedForReview ? (
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {markedForReview ? "Marked" : "Mark for Review"}
            </span>
          </button>

          {/* Clear Response */}
          <button
            onClick={clearResponse}
            disabled={selectedChoice === null}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selectedChoice !== null
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-muted text-muted-foreground/50 cursor-not-allowed"
            )}
            aria-label="Clear selected response"
          >
            <Eraser className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Question text */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="prose prose-lg max-w-none text-foreground"
          aria-label={`Question text`}
        >
          <MathText text={question.questionText} />
        </div>

        {/* Options */}
        <fieldset className="mt-8 space-y-3" aria-label="Answer options">
          <legend className="sr-only">
            Select your answer for question {currentIndex + 1}
          </legend>
          {question.options.map((option) => {
            const isSelected = selectedChoice === option.label;
            return (
              <label
                key={option.label}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                  "hover:border-pariksha-400 hover:bg-pariksha-50/50",
                  "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                  isSelected
                    ? "border-pariksha-600 bg-pariksha-50"
                    : "border-border bg-card"
                )}
              >
                <input
                  type="radio"
                  name={`question-${currentIndex}`}
                  value={option.label}
                  checked={isSelected}
                  onChange={() => selectChoice(option.label)}
                  className="mt-1 h-5 w-5 text-pariksha-600 border-2 border-gray-400 focus:ring-pariksha-500"
                  aria-label={`Option ${option.label}`}
                />
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span
                    className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      isSelected
                        ? "bg-pariksha-600 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                    aria-hidden="true"
                  >
                    {option.label}
                  </span>
                  <span className="text-foreground flex-1">
                    <MathText text={option.text} />
                  </span>
                </div>
              </label>
            );
          })}
        </fieldset>

        {/* Keyboard shortcut hints */}
        <div className="mt-6 text-xs text-muted-foreground flex flex-wrap gap-4" aria-hidden="true">
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">A</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs ml-0.5">B</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs ml-0.5">C</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs ml-0.5">D</kbd>
            {" "}Select option
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">M</kbd> Mark for review
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">Ctrl</kbd>+
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">Arrow</kbd> Navigate
          </span>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
        <button
          onClick={previousQuestion}
          disabled={currentIndex === 0}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            currentIndex > 0
              ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              : "bg-muted text-muted-foreground/50 cursor-not-allowed"
          )}
          aria-label="Go to previous question"
        >
          Previous
        </button>

        <span className="text-sm text-muted-foreground" aria-hidden="true">
          {currentIndex + 1} / {questions.length}
        </span>

        <div className="flex gap-2">
          {currentIndex < questions.length - 1 ? (
            <button
              onClick={saveAndNext}
              className="px-4 py-2 rounded-md text-sm font-medium bg-pariksha-600 text-white hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Save response and go to next question"
            >
              Save & Next
            </button>
          ) : (
            <span
              className="px-4 py-2 rounded-md text-sm font-medium bg-muted text-muted-foreground"
              aria-label="This is the last question"
            >
              Last Question
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
