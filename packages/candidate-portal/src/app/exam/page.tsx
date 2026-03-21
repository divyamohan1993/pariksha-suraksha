"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Shield,
  BookOpen,
  Calculator as CalcIcon,
  Globe,
  Send,
  CheckCircle2,
  Copy,
  LogIn,
  MapPin,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { useExamStore } from "@/lib/exam-store";
import {
  login,
  requestOtp,
  startExamSession,
  verifyCenterSeat,
  submitExam,
  setAuthToken,
  type LoginResponse,
} from "@/lib/api";
import {
  startAutoCheckpoint,
  stopAutoCheckpoint,
  finalCheckpoint,
  clearLocalCheckpoint,
} from "@/lib/checkpoint";
import { cacheQuestions, clearAllOfflineData } from "@/lib/offline";
import { announceToScreenReader } from "@/lib/accessibility";
import QuestionDisplay from "@/components/QuestionDisplay";
import QuestionGrid from "@/components/QuestionGrid";
import ExamTimer from "@/components/ExamTimer";
import SubmitDialog from "@/components/SubmitDialog";
import OfflineIndicator from "@/components/OfflineIndicator";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";

export default function ExamPage() {
  const phase = useExamStore((s) => s.phase);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AccessibilityToolbar />
      {phase === "idle" || phase === "authenticating" ? (
        <AuthenticationFlow />
      ) : phase === "center-verify" ? (
        <CenterVerification />
      ) : phase === "loading" ? (
        <LoadingExam />
      ) : phase === "active" ? (
        <ExamTerminal />
      ) : phase === "submitting" ? (
        <SubmittingState />
      ) : phase === "submitted" ? (
        <SubmittedState />
      ) : phase === "error" ? (
        <ErrorState />
      ) : null}
    </div>
  );
}

// --- Authentication Flow ---

function AuthenticationFlow() {
  const setPhase = useExamStore((s) => s.setPhase);

  const [step, setStep] = useState<"admit" | "otp">("admit");
  const [admitCard, setAdmitCard] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setLocalError] = useState<string | null>(null);

  const handleRequestOtp = useCallback(async () => {
    if (!admitCard.trim()) {
      setLocalError("Please enter your admit card number.");
      return;
    }
    setIsLoading(true);
    setLocalError(null);
    try {
      await requestOtp(admitCard.trim());
      setStep("otp");
      announceToScreenReader("OTP sent to your registered mobile number.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setIsLoading(false);
    }
  }, [admitCard]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length < 6) {
      setLocalError("Please enter the 6-digit OTP.");
      return;
    }
    setIsLoading(true);
    setLocalError(null);
    try {
      const result = await login({ admitCardNumber: admitCard.trim(), otp: otp.trim() });
      setAuthToken(result.token);
      setPhase("center-verify");
      announceToScreenReader("Login successful. Please verify your center and seat.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  }, [admitCard, otp, setPhase]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Shield className="h-12 w-12 text-pariksha-600 mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Exam Login</h1>
          <p className="text-muted-foreground mt-2">
            Authenticate to begin your examination
          </p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {step === "admit" ? (
            <>
              <div>
                <label htmlFor="admit-input" className="block text-sm font-medium text-card-foreground mb-1.5">
                  Admit Card Number
                </label>
                <input
                  id="admit-input"
                  type="text"
                  value={admitCard}
                  onChange={(e) => setAdmitCard(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                  placeholder="Enter your admit card number"
                  className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <button
                onClick={handleRequestOtp}
                disabled={isLoading || !admitCard.trim()}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isLoading || !admitCard.trim()
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-pariksha-600 text-white hover:bg-pariksha-700"
                )}
              >
                {isLoading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                )}
                {isLoading ? "Sending OTP..." : "Send OTP"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                OTP sent to registered mobile for admit card: <strong>{admitCard}</strong>
              </p>
              <div>
                <label htmlFor="exam-otp-input" className="block text-sm font-medium text-card-foreground mb-1.5">
                  One-Time Password
                </label>
                <input
                  id="exam-otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                  placeholder="Enter 6-digit OTP"
                  className="w-full px-4 py-3 rounded-lg border bg-background text-foreground text-center text-2xl tracking-[0.5em] font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("admit"); setOtp(""); setLocalError(null); }}
                  className="flex-1 py-3 rounded-lg font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Back
                </button>
                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length < 6}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-semibold transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isLoading || otp.length < 6
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-pariksha-600 text-white hover:bg-pariksha-700"
                  )}
                >
                  {isLoading ? "Verifying..." : "Login"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Center and Seat Verification ---

function CenterVerification() {
  const setPhase = useExamStore((s) => s.setPhase);
  const initializeExam = useExamStore((s) => s.initializeExam);

  const [centerId, setCenterId] = useState("");
  const [seatNum, setSeatNum] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    if (!centerId.trim() || !seatNum.trim()) {
      setError("Please enter both center ID and seat number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyCenterSeat(centerId.trim(), parseInt(seatNum.trim(), 10));
      if (!result.verified) {
        setError(result.message || "Center/seat verification failed. You must be at your assigned center and seat.");
        setIsLoading(false);
        return;
      }

      // Verification passed, load exam session
      setPhase("loading");
      announceToScreenReader("Center verified. Loading your exam. Please wait.");

      const session = await startExamSession();

      // Cache questions for offline support
      await cacheQuestions(
        session.questions.map((q) => ({ position: q.position, data: q }))
      );

      initializeExam(session);
      startAutoCheckpoint();
      announceToScreenReader(
        `Exam loaded. ${session.questions.length} questions. ${Math.floor(session.durationSeconds / 60)} minutes. You may begin.`
      );
    } catch (err) {
      setPhase("center-verify");
      setError(err instanceof Error ? err.message : "Failed to start exam session.");
    } finally {
      setIsLoading(false);
    }
  }, [centerId, seatNum, setPhase, initializeExam]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <MapPin className="h-12 w-12 text-pariksha-600 mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Verify Your Seat</h1>
          <p className="text-muted-foreground mt-2">
            Confirm your exam center and seat assignment
          </p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="center-input" className="block text-sm font-medium text-card-foreground mb-1.5">
              Center ID
            </label>
            <input
              id="center-input"
              type="text"
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              placeholder="Enter your center ID"
              className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="seat-input" className="block text-sm font-medium text-card-foreground mb-1.5">
              Seat Number
            </label>
            <input
              id="seat-input"
              type="text"
              inputMode="numeric"
              value={seatNum}
              onChange={(e) => setSeatNum(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="Enter your seat number"
              className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoComplete="off"
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={isLoading || !centerId.trim() || !seatNum.trim()}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isLoading || !centerId.trim() || !seatNum.trim()
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-pariksha-600 text-white hover:bg-pariksha-700"
            )}
          >
            {isLoading ? (
              <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {isLoading ? "Verifying..." : "Verify & Start Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Loading State ---

function LoadingExam() {
  return (
    <div className="flex-1 flex items-center justify-center p-4" role="status" aria-label="Loading exam">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-pariksha-600 border-t-transparent rounded-full mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-xl font-bold text-foreground">Loading Your Exam</h2>
        <p className="text-muted-foreground mt-2">
          Decrypting questions and preparing your exam terminal...
        </p>
      </div>
    </div>
  );
}

// --- Safe calculator evaluation ---

function safeCalculate(expression: string): string {
  const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, "");
  if (!sanitized || sanitized.trim().length === 0) return "0";
  // Use a simple stack-based parser instead of eval/Function
  // For safety, we parse and compute arithmetic expressions manually
  try {
    const result = parseExpression(sanitized);
    if (!isFinite(result)) return "Error";
    return String(Number(result.toFixed(10)));
  } catch {
    return "Error";
  }
}

// Recursive descent parser for safe arithmetic evaluation
function parseExpression(expr: string): number {
  let pos = 0;
  const str = expr.replace(/\s/g, "");

  function parseNum(): number {
    if (str[pos] === "(") {
      pos++; // skip (
      const val = parseAddSub();
      pos++; // skip )
      return val;
    }
    let numStr = "";
    if (str[pos] === "-" || str[pos] === "+") {
      numStr += str[pos++];
    }
    while (pos < str.length && (str[pos] >= "0" && str[pos] <= "9" || str[pos] === ".")) {
      numStr += str[pos++];
    }
    return parseFloat(numStr);
  }

  function parseMulDiv(): number {
    let left = parseNum();
    while (pos < str.length && (str[pos] === "*" || str[pos] === "/")) {
      const op = str[pos++];
      const right = parseNum();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (pos < str.length && (str[pos] === "+" || str[pos] === "-")) {
      const op = str[pos++];
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  return parseAddSub();
}

// --- Active Exam Terminal (THE CORE INTERFACE) ---

function ExamTerminal() {
  const phase = useExamStore((s) => s.phase);
  const examName = useExamStore((s) => s.examName);
  const candidateName = useExamStore((s) => s.candidateName);
  const timeRemaining = useExamStore((s) => s.timeRemainingSeconds);
  const allowCalculator = useExamStore((s) => s.allowCalculator);
  const languages = useExamStore((s) => s.languages);
  const activeLanguage = useExamStore((s) => s.activeLanguage);
  const setActiveLanguage = useExamStore((s) => s.setActiveLanguage);
  const sessionId = useExamStore((s) => s.sessionId);
  const totalDuration = useExamStore((s) => s.totalDurationSeconds);
  const getResponsesPayload = useExamStore((s) => s.getResponsesPayload);
  const setSubmissionResult = useExamStore((s) => s.setSubmissionResult);
  const setPhase = useExamStore((s) => s.setPhase);
  const setError = useExamStore((s) => s.setError);

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcExpression, setCalcExpression] = useState("");

  // Auto-submit on timer expiry
  const autoSubmitTriggered = useRef(false);
  useEffect(() => {
    if (timeRemaining <= 0 && phase === "active" && !autoSubmitTriggered.current) {
      autoSubmitTriggered.current = true;
      handleSubmit();
    }
  }, [timeRemaining, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent page refresh/close during exam
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (phase === "active") {
        e.preventDefault();
        e.returnValue = "Your exam is in progress. Are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  const handleSubmit = useCallback(async () => {
    setShowSubmitDialog(false);
    setPhase("submitting");
    announceToScreenReader("Submitting your exam. Please do not close this window.", "assertive");

    try {
      await finalCheckpoint();
      stopAutoCheckpoint();

      const result = await submitExam({
        sessionId: sessionId!,
        responses: getResponsesPayload(),
        totalElapsedMs: (totalDuration - timeRemaining) * 1000,
      });

      setSubmissionResult(result.submissionHash, result.submittedAt, result.blockchainEventId);
      clearLocalCheckpoint();
      await clearAllOfflineData();
      announceToScreenReader("Exam submitted successfully. Your response has been recorded on the blockchain.", "assertive");
    } catch (err) {
      setPhase("active");
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
      startAutoCheckpoint();
      announceToScreenReader("Submission failed. Your responses are saved. Please try again.", "assertive");
    }
  }, [sessionId, getResponsesPayload, totalDuration, timeRemaining, setPhase, setSubmissionResult, setError]);

  // Calculator logic using safe parser
  const handleCalcPress = useCallback((key: string) => {
    if (key === "C") {
      setCalcDisplay("0");
      setCalcExpression("");
    } else if (key === "=") {
      const result = safeCalculate(calcExpression);
      setCalcDisplay(result);
      setCalcExpression(result === "Error" ? "" : result);
    } else if (key === "DEL") {
      const newExpr = calcExpression.slice(0, -1) || "0";
      setCalcExpression(newExpr);
      setCalcDisplay(newExpr);
    } else {
      const newExpr = calcExpression === "0" && !isNaN(Number(key)) ? key : calcExpression + key;
      setCalcExpression(newExpr);
      setCalcDisplay(newExpr);
    }
  }, [calcExpression]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar: Timer + Controls */}
      <header
        className="flex items-center justify-between px-4 py-2 bg-card border-b shadow-sm flex-shrink-0"
        role="banner"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Shield className="h-5 w-5 text-pariksha-600 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-card-foreground truncate">{examName}</p>
            <p className="text-xs text-muted-foreground truncate">{candidateName}</p>
          </div>
        </div>

        <ExamTimer />

        <div className="flex items-center gap-2">
          <OfflineIndicator />

          {/* Language toggle */}
          {languages.length > 1 && (
            <div className="flex items-center gap-1">
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <select
                value={activeLanguage}
                onChange={(e) => setActiveLanguage(e.target.value)}
                className="text-xs bg-muted rounded px-2 py-1 border focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Select exam language"
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Main content: Question + Navigation sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question display area (70%) */}
        <div className="flex-1 flex flex-col min-w-0 lg:w-[70%]">
          <QuestionDisplay />
        </div>

        {/* Navigation panel (30%) */}
        <aside
          className="hidden lg:flex w-[30%] max-w-xs border-l bg-card flex-col"
          aria-label="Question navigation"
        >
          <QuestionGrid />
        </aside>
      </div>

      {/* Bottom control bar */}
      <footer
        className="flex items-center justify-between px-4 py-2 bg-card border-t shadow-sm flex-shrink-0"
        role="toolbar"
        aria-label="Exam controls"
      >
        <div className="flex items-center gap-2">
          {/* Instructions button */}
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="View exam instructions"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Instructions</span>
          </button>

          {/* Calculator button */}
          {allowCalculator && (
            <button
              onClick={() => setShowCalculator(!showCalculator)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                showCalculator
                  ? "bg-pariksha-100 text-pariksha-700"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              aria-label={showCalculator ? "Close calculator" : "Open calculator"}
              aria-expanded={showCalculator}
            >
              <CalcIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Calculator</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setShowSubmitDialog(true)}
          className="flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold bg-pariksha-600 text-white hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Submit exam"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Submit Exam
        </button>
      </footer>

      {/* Submit Dialog */}
      <SubmitDialog
        isOpen={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        onConfirm={handleSubmit}
      />

      {/* Instructions popup */}
      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Exam instructions"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInstructions(false)} aria-hidden="true" />
          <div className="relative bg-card rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-card-foreground mb-4">Exam Instructions</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>1. Answer all questions within the allotted time. The exam will auto-submit when time expires.</p>
              <p>2. Click on an option (A, B, C, or D) to select your answer. You can change your answer at any time.</p>
              <p>3. Use <strong>Save & Next</strong> to save and move forward. Use <strong>Previous</strong> to go back.</p>
              <p>4. <strong>Mark for Review</strong> flags a question for later. You can still answer marked questions.</p>
              <p>5. <strong>Clear Response</strong> removes your selected answer for the current question.</p>
              <p>6. The question navigation grid on the right shows your progress with color coding.</p>
              <p>7. Your responses are auto-saved every 30 seconds. If you lose network, responses are saved locally.</p>
              <p>8. Click <strong>Submit Exam</strong> when you are finished. You will see a summary before final submission.</p>
              <p className="font-medium text-card-foreground">Keyboard Shortcuts:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><kbd className="px-1 bg-muted rounded border text-xs">A</kbd>-<kbd className="px-1 bg-muted rounded border text-xs">D</kbd>: Select option</li>
                <li><kbd className="px-1 bg-muted rounded border text-xs">M</kbd>: Mark for review</li>
                <li><kbd className="px-1 bg-muted rounded border text-xs">Ctrl</kbd>+<kbd className="px-1 bg-muted rounded border text-xs">Arrow</kbd>: Navigate questions</li>
              </ul>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="mt-6 w-full py-2 rounded-lg bg-pariksha-600 text-white font-semibold hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoFocus
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Calculator popup */}
      {showCalculator && allowCalculator && (
        <div
          className="fixed bottom-16 left-4 z-40 bg-card rounded-xl shadow-2xl border w-72"
          role="dialog"
          aria-label="On-screen calculator"
        >
          <div className="p-3 border-b flex justify-between items-center">
            <span className="text-sm font-bold text-card-foreground">Calculator</span>
            <button
              onClick={() => setShowCalculator(false)}
              className="text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
              aria-label="Close calculator"
            >
              Close
            </button>
          </div>
          <div className="p-3">
            <div
              className="bg-muted rounded-lg px-3 py-2 mb-3 text-right font-mono text-lg text-card-foreground min-h-[2.5rem] overflow-x-auto"
              aria-live="polite"
              aria-label={`Calculator display: ${calcDisplay}`}
            >
              {calcDisplay}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {["C", "DEL", "(", ")", "7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+"].map((key) => (
                <button
                  key={key}
                  onClick={() => handleCalcPress(key)}
                  className={cn(
                    "py-2 rounded-md text-sm font-bold transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    key === "=" ? "bg-pariksha-600 text-white hover:bg-pariksha-700" :
                    key === "C" ? "bg-red-100 text-red-700 hover:bg-red-200" :
                    ["+", "-", "*", "/", "(", ")"].includes(key) ? "bg-pariksha-100 text-pariksha-700 hover:bg-pariksha-200" :
                    "bg-muted text-card-foreground hover:bg-muted/80"
                  )}
                  aria-label={
                    key === "DEL" ? "Delete last character" :
                    key === "C" ? "Clear calculator" :
                    key === "=" ? "Calculate result" :
                    key === "*" ? "Multiply" :
                    key === "/" ? "Divide" :
                    key === "+" ? "Add" :
                    key === "-" ? "Subtract" :
                    key
                  }
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile navigation drawer toggle (for small screens) */}
      <MobileNavDrawer />
    </div>
  );
}

function MobileNavDrawer() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-16 right-4 z-30 p-3 rounded-full bg-pariksha-600 text-white shadow-lg hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Open question navigation"
      >
        <span className="text-xs font-bold" aria-hidden="true">Nav</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Question navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-card shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-bold text-card-foreground">Questions</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close navigation"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <QuestionGrid />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Submitting State ---

function SubmittingState() {
  return (
    <div className="flex-1 flex items-center justify-center p-4" role="status" aria-label="Submitting exam">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-pariksha-600 border-t-transparent rounded-full mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-xl font-bold text-foreground">Submitting Your Exam</h2>
        <p className="text-muted-foreground mt-2">
          Encrypting and recording your responses on the blockchain...
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Please do not close this window.
        </p>
      </div>
    </div>
  );
}

// --- Submitted State ---

function SubmittedState() {
  const submissionHash = useExamStore((s) => s.submissionHash);
  const submittedAt = useExamStore((s) => s.submittedAt);
  const blockchainEventId = useExamStore((s) => s.blockchainEventId);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (submissionHash) {
      try {
        await navigator.clipboard.writeText(submissionHash);
        setCopied(true);
        announceToScreenReader("Hash copied to clipboard.");
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // clipboard not available
      }
    }
  }, [submissionHash]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-6" aria-hidden="true" />
        <h1 className="text-3xl font-bold text-foreground">Exam Submitted</h1>
        <p className="text-muted-foreground mt-2">
          Your responses have been encrypted and recorded on the blockchain.
        </p>

        <div className="mt-8 bg-card rounded-xl border shadow-sm p-6 text-left space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Submission Hash</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-muted rounded px-3 py-2 text-xs font-mono break-all text-foreground">
                {submissionHash}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-2 rounded-md hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={copied ? "Hash copied" : "Copy hash to clipboard"}
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {submittedAt && (
            <div>
              <p className="text-sm text-muted-foreground">Submitted At</p>
              <p className="font-medium text-foreground mt-1">{formatDateTime(submittedAt)}</p>
            </div>
          )}

          {blockchainEventId && (
            <div>
              <p className="text-sm text-muted-foreground">Blockchain Event ID</p>
              <code className="text-xs font-mono text-foreground break-all">{blockchainEventId}</code>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Save your submission hash. You can use it to verify your submission at any time.
          </p>
          <a
            href={`/verify/${submissionHash}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-pariksha-600 text-white font-semibold hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Verify My Submission
          </a>
        </div>
      </div>
    </div>
  );
}

// --- Error State ---

function ErrorState() {
  const errorMessage = useExamStore((s) => s.errorMessage);
  const setPhase = useExamStore((s) => s.setPhase);
  const setError = useExamStore((s) => s.setError);

  return (
    <div className="flex-1 flex items-center justify-center p-4" role="alert">
      <div className="w-full max-w-md text-center">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl text-red-600" aria-hidden="true">!</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Something Went Wrong</h1>
        <p className="text-muted-foreground mt-2">{errorMessage}</p>
        <p className="text-sm text-muted-foreground mt-4">
          Your responses are saved locally. Please try again or contact the invigilator.
        </p>
        <button
          onClick={() => { setError(null); setPhase("active"); startAutoCheckpoint(); }}
          className="mt-6 px-6 py-3 rounded-lg bg-pariksha-600 text-white font-semibold hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Return to Exam
        </button>
      </div>
    </div>
  );
}
