"use client";

import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { cn, formatTimer } from "@/lib/utils";
import { useExamStore } from "@/lib/exam-store";
import { announceToScreenReader } from "@/lib/accessibility";

export default function ExamTimer() {
  const timeRemaining = useExamStore((s) => s.timeRemainingSeconds);
  const severity = useExamStore((s) => s.timerSeverity);
  const phase = useExamStore((s) => s.phase);
  const tickTimer = useExamStore((s) => s.tickTimer);

  const lastAnnouncedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start/stop timer based on phase
  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => {
        tickTimer();
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, tickTimer]);

  // Screen reader announcements at warning thresholds
  useEffect(() => {
    if (phase !== "active") return;

    const announcements: Record<number, string> = {
      900: "15 minutes remaining.",
      300: "5 minutes remaining. Please review your answers.",
      60: "1 minute remaining. The exam will auto-submit soon.",
      30: "30 seconds remaining.",
      0: "Time is up. Your exam is being submitted.",
    };

    const msg = announcements[timeRemaining];
    if (msg && msg !== lastAnnouncedRef.current) {
      lastAnnouncedRef.current = msg;
      announceToScreenReader(msg, "assertive");
    }
  }, [timeRemaining, phase]);

  const colorClasses = {
    normal: "bg-green-100 text-green-800 border-green-300",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-400",
    urgent: "bg-orange-100 text-orange-800 border-orange-400",
    critical: "bg-red-100 text-red-800 border-red-500 animate-timer-flash",
  };

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Time remaining: ${formatTimer(timeRemaining)}`}
      aria-atomic="true"
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-mono text-lg font-bold tabular-nums transition-colors",
        colorClasses[severity]
      )}
    >
      <Clock className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span>{formatTimer(timeRemaining)}</span>

      {/* Hidden live region for screen readers — updates every minute */}
      <span className="sr-only" role="status" aria-live="polite">
        {Math.ceil(timeRemaining / 60)} minutes remaining
      </span>
    </div>
  );
}
