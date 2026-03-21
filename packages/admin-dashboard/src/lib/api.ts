import { getAccessToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, res.statusText, await res.json());
      return res.json() as Promise<T>;
    });
  },
};

// ---- Question APIs ----
export interface QuestionTemplate {
  id: string;
  subject: string;
  topic: string;
  subtopic: string;
  bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  templateText: string;
  parameters: ParameterDef[];
  answerFormula: string;
  distractors: DistractorDef[];
  calibrationStatus: "pending" | "field_testing" | "calibrated" | "rejected";
  fieldTestCount: number;
  calibrationDate?: string;
  irtParams?: IRTParams;
  createdAt: string;
  updatedAt: string;
}

export interface ParameterDef {
  name: string;
  type: "integer" | "float" | "set";
  min?: number;
  max?: number;
  values?: string[];
  step?: number;
}

export interface DistractorDef {
  formula: string;
  label: string;
}

export interface IRTParams {
  aMean: number;
  aStd: number;
  bMean: number;
  bStd: number;
  cMean: number;
  cStd: number;
}

export interface GenerateQuestionRequest {
  subject: string;
  topic: string;
  subtopic: string;
  bloomLevel: string;
  exampleTemplate?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const questionsApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    subject?: string;
    topic?: string;
    bloomLevel?: string;
    calibrationStatus?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== "") searchParams.set(key, String(val));
    });
    return api.get<PaginatedResponse<QuestionTemplate>>(
      `/api/v1/questions?${searchParams.toString()}`
    );
  },

  getById: (id: string) =>
    api.get<QuestionTemplate>(`/api/v1/questions/${id}`),

  generate: (data: GenerateQuestionRequest) =>
    api.post<QuestionTemplate>("/api/v1/questions/generate", data),

  create: (data: Partial<QuestionTemplate>) =>
    api.post<QuestionTemplate>("/api/v1/questions", data),

  update: (id: string, data: Partial<QuestionTemplate>) =>
    api.put<QuestionTemplate>(`/api/v1/questions/${id}`, data),

  uploadFieldTestData: (templateId: string, formData: FormData) =>
    api.upload<{ jobId: string }>(
      `/api/v1/questions/${templateId}/field-test`,
      formData
    ),

  getCalibrationStatus: (templateId: string) =>
    api.get<{
      status: string;
      irtParams?: IRTParams;
      isomorphicEquivalence: boolean;
      distractorProfile: Record<string, number>;
      confidenceIntervals: Record<string, [number, number]>;
    }>(`/api/v1/questions/${templateId}/calibration`),
};

// ---- Exam APIs ----
export interface Exam {
  id: string;
  name: string;
  date: string;
  subjects: string[];
  totalQuestions: number;
  totalCandidates: number;
  status:
    | "draft"
    | "blueprint_set"
    | "matrix_generated"
    | "encrypted"
    | "distributed"
    | "active"
    | "completed"
    | "graded"
    | "published";
  blueprint?: ExamBlueprint;
  createdAt: string;
  updatedAt: string;
}

export interface ExamBlueprint {
  difficultyDist: { easy: number; medium: number; hard: number };
  topicCoverage: Record<string, number>;
  questionsPerPaper: number;
}

export interface Center {
  id: string;
  name: string;
  city: string;
  state: string;
  capacity: number;
  seatCount: number;
  status: "ready" | "active" | "issue" | "offline";
}

export interface MatrixStatus {
  status: "idle" | "running" | "completed" | "failed";
  progress: number;
  totalPapers: number;
  generatedPapers: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface EncryptionStatus {
  step: "idle" | "encrypting" | "tlp_generating" | "shamir_splitting" | "distributing" | "completed";
  progress: number;
  totalQuestions: number;
  encryptedQuestions: number;
  tlpPuzzlesGenerated: number;
  shamirFragments: { holder: string; role: string; distributed: boolean }[];
  centerDistribution: { centerId: string; centerName: string; status: string; txHash?: string }[];
  blockchainTxHashes: string[];
}

export interface MonitorData {
  examId: string;
  examStatus: string;
  keyReleaseTime: string;
  currentTime: string;
  centers: CenterMonitor[];
  metrics: {
    avgPaperLatency: number;
    systemLoad: number;
    activeConnections: number;
    responsesSubmitted: number;
    totalCandidates: number;
  };
  alerts: AlertItem[];
}

export interface CenterMonitor {
  centerId: string;
  centerName: string;
  status: "ready" | "active" | "issue" | "offline";
  candidatesLoggedIn: number;
  totalSeats: number;
  papersDelivered: number;
  responsesSubmitted: number;
  lastHeartbeat: string;
}

export interface AlertItem {
  id: string;
  type: "error" | "warning" | "info";
  message: string;
  centerId?: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface CollusionResult {
  id: string;
  candidateU: string;
  candidateV: string;
  logLambda: number;
  threshold: number;
  flagged: boolean;
  centerId: string;
  centerName: string;
  evidence: {
    matchingWrongAnswers: { questionId: string; answer: string; probability: number }[];
    seatingDistance: number;
    seatU: string;
    seatV: string;
    statisticalSignificance: number;
    pdfReportUrl?: string;
  };
}

export interface CollusionAnalysis {
  status: "idle" | "running" | "completed";
  progress: number;
  centersAnalyzed: number;
  totalCenters: number;
  results: CollusionResult[];
  rings: { id: string; members: string[]; avgLogLambda: number }[];
}

export interface ExamResult {
  candidateId: string;
  candidateName: string;
  rawScore: number;
  equatedScore: number;
  centerId: string;
  paperVariant: string;
}

export interface ResultsSummary {
  examId: string;
  totalCandidates: number;
  scoreDistribution: { bin: string; count: number }[];
  mean: number;
  median: number;
  stdDev: number;
  ksTestResult: { statistic: number; pValue: number; papersDiffer: boolean };
  equatingApplied: boolean;
  published: boolean;
}

export const examsApi = {
  list: () => api.get<Exam[]>("/api/v1/exams"),

  getById: (id: string) => api.get<Exam>(`/api/v1/exams/${id}`),

  create: (data: {
    name: string;
    date: string;
    subjects: string[];
    totalQuestions: number;
    totalCandidates: number;
    centers: { centerId: string; seatCount: number }[];
  }) => api.post<Exam>("/api/v1/exams", data),

  updateBlueprint: (id: string, blueprint: ExamBlueprint) =>
    api.post<Exam>(`/api/v1/exams/${id}/blueprint`, blueprint),

  triggerMatrix: (id: string) =>
    api.post<{ jobId: string }>(`/api/v1/exams/${id}/matrix`),

  getMatrixStatus: (id: string) =>
    api.get<MatrixStatus>(`/api/v1/exams/${id}/matrix/status`),

  triggerEncrypt: (id: string) =>
    api.post<{ jobId: string }>(`/api/v1/exams/${id}/encrypt`),

  getEncryptionStatus: (id: string) =>
    api.get<EncryptionStatus>(`/api/v1/exams/${id}/keys/status`),

  getMonitorData: (id: string) =>
    api.get<MonitorData>(`/api/v1/exams/${id}/monitor`),

  triggerCollusion: (id: string) =>
    api.post<{ jobId: string }>(`/api/v1/exams/${id}/collusion/run`),

  getCollusionResults: (id: string) =>
    api.get<CollusionAnalysis>(`/api/v1/exams/${id}/collusion/results`),

  getResults: (id: string) =>
    api.get<ResultsSummary>(`/api/v1/exams/${id}/results`),

  searchCandidateResult: (examId: string, query: string) =>
    api.get<ExamResult[]>(
      `/api/v1/exams/${examId}/results/search?q=${encodeURIComponent(query)}`
    ),

  publishResults: (id: string) =>
    api.post<void>(`/api/v1/exams/${id}/results/publish`),

  triggerEquating: (id: string) =>
    api.post<{ jobId: string }>(`/api/v1/exams/${id}/equate`),

  getCenters: () => api.get<Center[]>("/api/v1/centers"),
};

// ---- Audit APIs ----
export interface AuditEvent {
  eventId: string;
  eventType: string;
  examId: string;
  entityHash: string;
  timestamp: string;
  actorId: string;
  actorOrg: string;
  metadata: Record<string, unknown>;
  txId?: string;
}

export interface MerkleProof {
  eventId: string;
  txId: string;
  blockNumber: number;
  blockHash: string;
  merkleProof: string[];
  verified: boolean;
}

export const auditApi = {
  getEvents: (params: {
    examId?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== "") searchParams.set(key, String(val));
    });
    return api.get<PaginatedResponse<AuditEvent>>(
      `/api/v1/audit/events?${searchParams.toString()}`
    );
  },

  verifyEvent: (eventId: string) =>
    api.get<{ verified: boolean; event: AuditEvent }>(
      `/api/v1/audit/verify/${eventId}`
    ),

  getMerkleProof: (eventId: string) =>
    api.get<MerkleProof>(`/api/v1/audit/proof/${eventId}`),
};

// ---- Dashboard APIs ----
export interface DashboardStats {
  totalExams: number;
  questionBankSize: number;
  activeExams: number;
  pendingAlerts: number;
  recentActivity: {
    id: string;
    type: string;
    description: string;
    timestamp: string;
    actor: string;
  }[];
}

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>("/api/v1/dashboard/stats"),
};
