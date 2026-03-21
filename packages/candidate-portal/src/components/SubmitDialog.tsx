"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExamStore, type QuestionStatus } from "@/lib/exam-store";
import { announceToScreenReader } from "@/lib/accessibility";

const STATUS_LABELS: Record<QuestionStatus, string> = {
  "not-visited": "Not Visited",
  "not-answered": "Not Answered",
  answered: "Answered",
  review: "Marked for Review",
  "review-answered": "Answered & Marked for Review",
};

interface SubmitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function SubmitDialog({ isOpen, onClose, onConfirm }: SubmitDialogProps) {
  const getStatusCounts = useExamStore((s) => s.getStatusCounts);
  const questions = useExamStore((s) => s.questions);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const counts = getStatusCounts();
  const totalQuestions = questions.length;
  const unanswered = counts["not-answered"] + counts["not-visited"];
  const reviewPending = counts.review;

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    announceToScreenReader("Submitting your exam. Please wait.", "assertive");
    try {
      await onConfirm();
    } catch {
      setIsSubmitting(false);
      announceToScreenReader("Submission failed. Please try again.", "assertive");
    }
  }, [onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-dialog-title"
      aria-describedby="submit-dialog-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={isSubmitting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-card rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="submit-dialog-title" className="text-lg font-bold text-card-foreground">
            Submit Exam
          </h2>
          {!isSubmitting && (
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Cancel submission"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p id="submit-dialog-desc" className="text-sm text-muted-foreground">
            Please review your response summary before submitting. Once submitted,
            you cannot modify your answers.
          </p>

          {/* Response summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-card-foreground">Response Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryRow
                label="Total Questions"
                value={totalQuestions}
                className="font-semibold"
              />
              <SummaryRow label="Answered" value={counts.answered + counts["review-answered"]} className="text-green-600" />
              <SummaryRow label="Not Answered" value={counts["not-answered"]} className="text-red-600" />
              <SummaryRow label="Not Visited" value={counts["not-visited"]} className="text-gray-500" />
              <SummaryRow label="Marked for Review" value={counts.review} className="text-purple-600" />
              <SummaryRow
                label="Answered & Review"
                value={counts["review-answered"]}
                className="text-purple-800"
              />
            </div>
          </div>

          {/* Warnings */}
          {unanswered > 0 && (
            <div
              className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">
                  {unanswered} question{unanswered > 1 ? "s" : ""} unanswered
                </p>
                <p className="text-yellow-700 mt-1">
                  You have {unanswered} question{unanswered > 1 ? "s" : ""} that{" "}
                  {unanswered > 1 ? "are" : "is"} not yet answered. Are you sure you
                  want to submit?
                </p>
              </div>
            </div>
          )}

          {reviewPending > 0 && (
            <div
              className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-purple-700">
                {reviewPending} question{reviewPending > 1 ? "s" : ""} marked for
                review have not been answered.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          {!isSubmitting && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Go Back
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSubmitting
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-pariksha-600 text-white hover:bg-pariksha-700"
            )}
            aria-label={isSubmitting ? "Submitting exam..." : "Confirm and submit exam"}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Submit Exam
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold", className)} aria-label={`${label}: ${value}`}>
        {value}
      </span>
    </div>
  );
}
