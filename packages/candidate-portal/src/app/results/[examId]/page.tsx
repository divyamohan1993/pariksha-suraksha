"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield,
  ArrowLeft,
  Download,
  Award,
  TrendingUp,
  Hash,
  Calendar,
  User,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  login,
  requestOtp,
  getResults,
  downloadScorecard,
  setAuthToken,
  type CandidateResultResponse,
} from "@/lib/api";
import VerificationBadge from "@/components/VerificationBadge";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";

type Phase = "login" | "otp" | "results";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;
  const isLookup = examId === "lookup";

  const [phase, setPhase] = useState<Phase>("login");
  const [admitCardNumber, setAdmitCardNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [examIdInput, setExamIdInput] = useState(isLookup ? "" : examId);
  const [result, setResult] = useState<CandidateResultResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleRequestOtp = useCallback(async () => {
    if (!admitCardNumber.trim()) {
      setError("Please enter your admit card number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await requestOtp(admitCardNumber.trim());
      setPhase("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [admitCardNumber]);

  const handleLogin = useCallback(async () => {
    if (!otp.trim()) {
      setError("Please enter the OTP.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loginResult = await login({
        admitCardNumber: admitCardNumber.trim(),
        otp: otp.trim(),
      });
      setAuthToken(loginResult.token);

      const targetExamId = examIdInput.trim() || loginResult.examId;
      const resultData = await getResults(targetExamId);
      setResult(resultData);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please verify your credentials.");
    } finally {
      setIsLoading(false);
    }
  }, [admitCardNumber, otp, examIdInput]);

  const handleDownloadScorecard = useCallback(async () => {
    if (!result) return;
    setIsDownloading(true);
    try {
      const blob = await downloadScorecard(result.examId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scorecard-${result.examId}-${result.candidateId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download scorecard. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [result]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pariksha-50 to-white">
      <AccessibilityToolbar />

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-md hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go back to home page"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-pariksha-600" aria-hidden="true" />
            <span className="font-bold text-pariksha-900">ParikshaSuraksha</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <h1 className="text-3xl font-bold text-center text-foreground mb-8">
          {phase === "results" ? "Your Results" : "Check Your Results"}
        </h1>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Login phase */}
        {phase === "login" && (
          <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-card-foreground">
              Candidate Authentication
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your admit card number to receive an OTP for verification.
            </p>

            {isLookup && (
              <div>
                <label htmlFor="exam-id-input" className="block text-sm font-medium text-card-foreground mb-1.5">
                  Exam ID
                </label>
                <input
                  id="exam-id-input"
                  type="text"
                  value={examIdInput}
                  onChange={(e) => setExamIdInput(e.target.value)}
                  placeholder="Enter Exam ID"
                  className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            )}

            <div>
              <label htmlFor="admit-card-input" className="block text-sm font-medium text-card-foreground mb-1.5">
                Admit Card Number
              </label>
              <input
                id="admit-card-input"
                type="text"
                value={admitCardNumber}
                onChange={(e) => setAdmitCardNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                placeholder="Enter your admit card number"
                className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoComplete="off"
              />
            </div>

            <button
              onClick={handleRequestOtp}
              disabled={isLoading || !admitCardNumber.trim()}
              className={cn(
                "w-full py-3 rounded-lg font-semibold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isLoading || !admitCardNumber.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-pariksha-600 text-white hover:bg-pariksha-700"
              )}
            >
              {isLoading ? "Sending OTP..." : "Send OTP"}
            </button>
          </div>
        )}

        {/* OTP phase */}
        {phase === "otp" && (
          <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-card-foreground">
              Enter OTP
            </h2>
            <p className="text-sm text-muted-foreground">
              An OTP has been sent to the mobile number registered with your admit card.
            </p>

            <div>
              <label htmlFor="otp-input" className="block text-sm font-medium text-card-foreground mb-1.5">
                One-Time Password
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter 6-digit OTP"
                className="w-full px-4 py-3 rounded-lg border bg-background text-foreground text-center text-2xl tracking-[0.5em] font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoComplete="one-time-code"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setPhase("login"); setOtp(""); setError(null); }}
                className="flex-1 py-3 rounded-lg font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Back
              </button>
              <button
                onClick={handleLogin}
                disabled={isLoading || otp.length < 6}
                className={cn(
                  "flex-1 py-3 rounded-lg font-semibold transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isLoading || otp.length < 6
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-pariksha-600 text-white hover:bg-pariksha-700"
                )}
              >
                {isLoading ? "Verifying..." : "View Results"}
              </button>
            </div>
          </div>
        )}

        {/* Results phase */}
        {phase === "results" && result && (
          <div className="space-y-6">
            {/* Candidate info */}
            <div className="bg-card rounded-xl border shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <User className="h-5 w-5 text-pariksha-600" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-card-foreground">
                  {result.candidateName}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Exam</span>
                  <p className="font-medium text-card-foreground">{result.examName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Graded At</span>
                  <p className="font-medium text-card-foreground">
                    {formatDateTime(result.gradedAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ScoreCard
                icon={<Award className="h-6 w-6" aria-hidden="true" />}
                label="Raw Score"
                value={result.rawScore}
                color="text-blue-600"
              />
              <ScoreCard
                icon={<TrendingUp className="h-6 w-6" aria-hidden="true" />}
                label={result.equatingApplied ? "Equated Score" : "Final Score"}
                value={result.equatedScore}
                color="text-green-600"
                highlight
              />
              {result.rank && (
                <ScoreCard
                  icon={<Hash className="h-6 w-6" aria-hidden="true" />}
                  label="Rank"
                  value={result.rank}
                  suffix={` / ${result.totalCandidates.toLocaleString()}`}
                  color="text-purple-600"
                />
              )}
            </div>

            {result.equatingApplied && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                <p className="font-medium">Score Equating Applied</p>
                <p className="mt-1 text-blue-600">
                  Your score has been equated using IRT-based true score equating to account
                  for differences in question paper difficulty. This ensures fair comparison
                  across all candidates.
                </p>
              </div>
            )}

            {/* Blockchain verification */}
            <VerificationBadge
              verified={true}
              hash={result.verificationHash}
              size="md"
              showLink
            />

            {/* Download scorecard */}
            <button
              onClick={handleDownloadScorecard}
              disabled={isDownloading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isDownloading
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-pariksha-600 text-white hover:bg-pariksha-700"
              )}
              aria-label={isDownloading ? "Downloading scorecard..." : "Download scorecard as PDF"}
            >
              {isDownloading ? (
                <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
              ) : (
                <Download className="h-5 w-5" aria-hidden="true" />
              )}
              {isDownloading ? "Downloading..." : "Download Scorecard (PDF)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCard({
  icon,
  label,
  value,
  suffix,
  color,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border shadow-sm p-6 text-center",
        highlight && "ring-2 ring-pariksha-400"
      )}
    >
      <div className={cn("flex justify-center mb-2", color)}>{icon}</div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-3xl font-bold", color)} aria-label={`${label}: ${value}${suffix || ""}`}>
        {value}
        {suffix && <span className="text-lg text-muted-foreground font-normal">{suffix}</span>}
      </p>
    </div>
  );
}
