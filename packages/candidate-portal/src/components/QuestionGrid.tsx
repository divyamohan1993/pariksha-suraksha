"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useExamStore, type QuestionStatus } from "@/lib/exam-store";
import { announceToScreenReader } from "@/lib/accessibility";

const STATUS_COLORS: Record<QuestionStatus, string> = {
  "not-visited": "bg-q-not-visited text-white",
  "not-answered": "bg-q-not-answered text-white",
  answered: "bg-q-answered text-white",
  review: "bg-q-review text-white",
  "review-answered": "bg-q-review-answered text-white",
};

const STATUS_LABELS: Record<QuestionStatus, string> = {
  "not-visited": "Not Visited",
  "not-answered": "Not Answered",
  answered: "Answered",
  review: "Marked for Review",
  "review-answered": "Answered & Marked for Review",
};

const STATUS_CSS_CLASS: Record<QuestionStatus, string> = {
  "not-visited": "q-status-not-visited",
  "not-answered": "q-status-not-answered",
  answered: "q-status-answered",
  review: "q-status-review",
  "review-answered": "q-status-review-answered",
};

export default function QuestionGrid() {
  const questions = useExamStore((s) => s.questions);
  const sections = useExamStore((s) => s.sections);
  const activeSection = useExamStore((s) => s.activeSection);
  const currentIndex = useExamStore((s) => s.currentQuestionIndex);
  const goToQuestion = useExamStore((s) => s.goToQuestion);
  const getQuestionStatus = useExamStore((s) => s.getQuestionStatus);
  const getStatusCounts = useExamStore((s) => s.getStatusCounts);
  const setActiveSection = useExamStore((s) => s.setActiveSection);
  const getSectionQuestionIndices = useExamStore((s) => s.getSectionQuestionIndices);

  const statusCounts = getStatusCounts();
  const sectionIndices = getSectionQuestionIndices(activeSection);

  const handleQuestionClick = useCallback(
    (index: number) => {
      goToQuestion(index);
      const status = getQuestionStatus(index);
      announceToScreenReader(`Navigated to question ${index + 1}. Status: ${STATUS_LABELS[status]}.`);
    },
    [goToQuestion, getQuestionStatus]
  );

  return (
    <div className="flex flex-col h-full" role="navigation" aria-label="Question navigation panel">
      {/* Section tabs */}
      {sections.length > 1 && (
        <div className="px-3 py-2 border-b" role="tablist" aria-label="Exam sections">
          <div className="flex gap-1 overflow-x-auto">
            {sections.map((section) => (
              <button
                key={section}
                role="tab"
                aria-selected={activeSection === section}
                onClick={() => setActiveSection(section)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  activeSection === section
                    ? "bg-pariksha-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {section}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Question grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div
          className="grid grid-cols-5 gap-1.5"
          role="group"
          aria-label="Question numbers. Click to navigate."
        >
          {sectionIndices.map((index) => {
            const status = getQuestionStatus(index);
            const isCurrent = index === currentIndex;

            return (
              <button
                key={index}
                onClick={() => handleQuestionClick(index)}
                className={cn(
                  "relative w-full aspect-square flex items-center justify-center rounded-md text-sm font-bold transition-all",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  STATUS_COLORS[status],
                  STATUS_CSS_CLASS[status],
                  isCurrent && "ring-2 ring-foreground ring-offset-2 scale-110 z-10"
                )}
                aria-label={`Question ${index + 1}: ${STATUS_LABELS[status]}${isCurrent ? " (current)" : ""}`}
                aria-current={isCurrent ? "true" : undefined}
              >
                {index + 1}
                {/* Visual indicator shapes for color-blind safe mode */}
                {status === "answered" && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white"
                    aria-hidden="true"
                  />
                )}
                {status === "review" && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-white"
                    aria-hidden="true"
                  />
                )}
                {status === "review-answered" && (
                  <>
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white"
                      aria-hidden="true"
                    />
                    <span
                      className="absolute -bottom-0.5 -left-0.5 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-white"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status legend + counts */}
      <div className="border-t px-3 py-3 space-y-2" aria-label="Question status summary">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Summary
        </h3>
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          <StatusRow
            color="bg-q-answered"
            label="Answered"
            count={statusCounts.answered}
            cssClass="q-status-answered"
          />
          <StatusRow
            color="bg-q-not-answered"
            label="Not Answered"
            count={statusCounts["not-answered"]}
            cssClass="q-status-not-answered"
          />
          <StatusRow
            color="bg-q-not-visited"
            label="Not Visited"
            count={statusCounts["not-visited"]}
            cssClass="q-status-not-visited"
          />
          <StatusRow
            color="bg-q-review"
            label="Marked for Review"
            count={statusCounts.review}
            cssClass="q-status-review"
          />
          <StatusRow
            color="bg-q-review-answered"
            label="Answered & Review"
            count={statusCounts["review-answered"]}
            cssClass="q-status-review-answered"
          />
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  color,
  label,
  count,
  cssClass,
}: {
  color: string;
  label: string;
  count: number;
  cssClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className={cn("w-4 h-4 rounded-sm flex-shrink-0", color, cssClass)}
          aria-hidden="true"
        />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-bold text-foreground" aria-label={`${count} ${label}`}>
        {count}
      </span>
    </div>
  );
}
