/**
 * API client for ParikshaSuraksha candidate portal.
 * Handles authentication, request/response formatting, and error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ps_auth_token", token);
    }
  } else {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("ps_auth_token");
    }
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = sessionStorage.getItem("ps_auth_token");
  }
  return authToken;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;
  const token = getAuthToken();

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    let errorBody: { code?: string; message?: string } = {};
    try {
      errorBody = await response.json();
    } catch {
      // response may not be JSON
    }
    throw new ApiError(
      response.status,
      errorBody.code || "UNKNOWN_ERROR",
      errorBody.message || `Request failed with status ${response.status}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// --- Auth ---

export interface LoginRequest {
  admitCardNumber: string;
  otp: string;
}

export interface LoginResponse {
  token: string;
  candidateId: string;
  examId: string;
  centerId: string;
  seatNum: number;
  candidateName: string;
}

export function login(data: LoginRequest): Promise<LoginResponse> {
  return request("/api/v1/auth/candidate-login", { method: "POST", body: data });
}

export function requestOtp(admitCardNumber: string): Promise<{ sent: boolean }> {
  return request("/api/v1/auth/candidate-otp", {
    method: "POST",
    body: { admitCardNumber },
  });
}

// --- Verification (public) ---

export interface VerifyResponse {
  verified: boolean;
  timestamp: string;
  blockchainEventId?: string;
  submissionHash: string;
}

export interface MerkleProofResponse {
  eventId: string;
  txId: string;
  blockNumber: number;
  blockHash: string;
  merkleProof: string[];
  verified: boolean;
}

export function verifySubmission(hash: string): Promise<VerifyResponse> {
  return request(`/api/v1/verify/${encodeURIComponent(hash)}`);
}

export function getMerkleProof(eventId: string): Promise<MerkleProofResponse> {
  return request(`/api/v1/audit/proof/${encodeURIComponent(eventId)}`);
}

// --- Results ---

export interface CandidateResultResponse {
  candidateId: string;
  candidateName: string;
  examId: string;
  examName: string;
  rawScore: number;
  equatedScore: number;
  equatingApplied: boolean;
  rank?: number;
  totalCandidates: number;
  verificationHash: string;
  gradedAt: string;
}

export function getResults(examId: string): Promise<CandidateResultResponse> {
  return request(`/api/v1/exams/${encodeURIComponent(examId)}/results/me`);
}

export function downloadScorecard(examId: string): Promise<Blob> {
  const token = getAuthToken();
  return fetch(`${API_BASE}/api/v1/exams/${encodeURIComponent(examId)}/results/me/scorecard`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => {
    if (!r.ok) throw new ApiError(r.status, "DOWNLOAD_FAILED", "Failed to download scorecard");
    return r.blob();
  });
}

// --- Exam Session ---

export interface ExamQuestion {
  position: number;
  templateId: string;
  paramInstantiationId: string;
  questionText: string;
  options: { label: string; text: string }[];
  section?: string;
}

export interface ExamSessionStartResponse {
  sessionId: string;
  examId: string;
  examName: string;
  candidateId: string;
  candidateName: string;
  questions: ExamQuestion[];
  sections: string[];
  durationSeconds: number;
  startedAt: string;
  allowCalculator: boolean;
  languages: string[];
}

export interface CheckpointPayload {
  sessionId: string;
  responses: Record<
    number,
    { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }
  >;
  currentQuestionPosition: number;
  elapsedMs: number;
}

export interface SubmitPayload {
  sessionId: string;
  responses: Record<
    number,
    { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }
  >;
  totalElapsedMs: number;
}

export interface SubmitResponse {
  submissionHash: string;
  submittedAt: string;
  blockchainEventId: string;
}

export function startExamSession(): Promise<ExamSessionStartResponse> {
  return request("/api/v1/exam-session/start", { method: "POST" });
}

export function verifyCenterSeat(
  centerId: string,
  seatNum: number
): Promise<{ verified: boolean; message?: string }> {
  return request("/api/v1/exam-session/verify-seat", {
    method: "POST",
    body: { centerId, seatNum },
  });
}

export function submitCheckpoint(data: CheckpointPayload): Promise<{ saved: boolean }> {
  return request("/api/v1/exam-session/checkpoint", { method: "POST", body: data });
}

export function submitExam(data: SubmitPayload): Promise<SubmitResponse> {
  return request("/api/v1/exam-session/submit", { method: "POST", body: data });
}
