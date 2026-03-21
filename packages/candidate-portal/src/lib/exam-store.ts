/**
 * Zustand store for the exam terminal.
 * Manages all exam state: questions, responses, timer, navigation, status.
 * This is the single source of truth for the exam session.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ExamQuestion, ExamSessionStartResponse } from "./api";

// --- Types ---

export type QuestionStatus =
  | "not-visited"
  | "not-answered"
  | "answered"
  | "review"
  | "review-answered";

export type ExamPhase =
  | "idle"
  | "authenticating"
  | "center-verify"
  | "loading"
  | "active"
  | "submitting"
  | "submitted"
  | "error";

export type TimerSeverity = "normal" | "warning" | "urgent" | "critical";

export interface ResponseState {
  selectedChoice: string | null;
  markedForReview: boolean;
  timeSpentMs: number;
}

export interface ExamState {
  // Session metadata
  phase: ExamPhase;
  sessionId: string | null;
  examId: string | null;
  examName: string | null;
  candidateId: string | null;
  candidateName: string | null;
  allowCalculator: boolean;
  languages: string[];
  activeLanguage: string;

  // Questions
  questions: ExamQuestion[];
  sections: string[];
  activeSection: string | null;

  // Navigation
  currentQuestionIndex: number;
  visitedQuestions: Set<number>;

  // Responses
  responses: Map<number, ResponseState>;

  // Timer
  totalDurationSeconds: number;
  timeRemainingSeconds: number;
  timerSeverity: TimerSeverity;
  examStartedAt: number | null;

  // Network
  isOnline: boolean;
  pendingSyncCount: number;
  lastCheckpointAt: number | null;

  // Submission
  submissionHash: string | null;
  submittedAt: string | null;
  blockchainEventId: string | null;

  // Error
  errorMessage: string | null;

  // Actions
  initializeExam: (session: ExamSessionStartResponse) => void;
  setPhase: (phase: ExamPhase) => void;
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  selectChoice: (choice: string) => void;
  clearResponse: () => void;
  toggleMarkForReview: () => void;
  saveAndNext: () => void;
  tickTimer: () => void;
  setOnlineStatus: (online: boolean) => void;
  setPendingSyncCount: (count: number) => void;
  setLastCheckpoint: (timestamp: number) => void;
  setSubmissionResult: (hash: string, submittedAt: string, eventId: string) => void;
  setError: (message: string | null) => void;
  setActiveLanguage: (lang: string) => void;
  setActiveSection: (section: string) => void;
  addTimeSpent: (positionIndex: number, ms: number) => void;
  getQuestionStatus: (index: number) => QuestionStatus;
  getStatusCounts: () => Record<QuestionStatus, number>;
  getSectionQuestionIndices: (section: string | null) => number[];
  getResponsesPayload: () => Record<number, { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }>;
}

function computeTimerSeverity(seconds: number): TimerSeverity {
  if (seconds <= 60) return "critical";
  if (seconds <= 300) return "urgent";
  if (seconds <= 900) return "warning";
  return "normal";
}

export const useExamStore = create<ExamState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    phase: "idle",
    sessionId: null,
    examId: null,
    examName: null,
    candidateId: null,
    candidateName: null,
    allowCalculator: false,
    languages: ["English"],
    activeLanguage: "English",

    questions: [],
    sections: [],
    activeSection: null,

    currentQuestionIndex: 0,
    visitedQuestions: new Set<number>(),

    responses: new Map<number, ResponseState>(),

    totalDurationSeconds: 0,
    timeRemainingSeconds: 0,
    timerSeverity: "normal",
    examStartedAt: null,

    isOnline: true,
    pendingSyncCount: 0,
    lastCheckpointAt: null,

    submissionHash: null,
    submittedAt: null,
    blockchainEventId: null,

    errorMessage: null,

    initializeExam: (session: ExamSessionStartResponse) => {
      const visited = new Set<number>();
      visited.add(0); // First question is immediately visited
      set({
        phase: "active",
        sessionId: session.sessionId,
        examId: session.examId,
        examName: session.examName,
        candidateId: session.candidateId,
        candidateName: session.candidateName,
        questions: session.questions,
        sections: session.sections,
        activeSection: session.sections.length > 0 ? session.sections[0] : null,
        allowCalculator: session.allowCalculator,
        languages: session.languages,
        activeLanguage: session.languages[0] || "English",
        currentQuestionIndex: 0,
        visitedQuestions: visited,
        responses: new Map<number, ResponseState>(),
        totalDurationSeconds: session.durationSeconds,
        timeRemainingSeconds: session.durationSeconds,
        timerSeverity: "normal",
        examStartedAt: Date.now(),
        submissionHash: null,
        submittedAt: null,
        blockchainEventId: null,
        errorMessage: null,
      });
    },

    setPhase: (phase) => set({ phase }),

    goToQuestion: (index) => {
      const state = get();
      if (index < 0 || index >= state.questions.length) return;
      const newVisited = new Set(state.visitedQuestions);
      newVisited.add(index);
      set({ currentQuestionIndex: index, visitedQuestions: newVisited });
    },

    nextQuestion: () => {
      const state = get();
      const nextIdx = state.currentQuestionIndex + 1;
      if (nextIdx < state.questions.length) {
        const newVisited = new Set(state.visitedQuestions);
        newVisited.add(nextIdx);
        set({ currentQuestionIndex: nextIdx, visitedQuestions: newVisited });
      }
    },

    previousQuestion: () => {
      const state = get();
      const prevIdx = state.currentQuestionIndex - 1;
      if (prevIdx >= 0) {
        const newVisited = new Set(state.visitedQuestions);
        newVisited.add(prevIdx);
        set({ currentQuestionIndex: prevIdx, visitedQuestions: newVisited });
      }
    },

    selectChoice: (choice) => {
      const state = get();
      const idx = state.currentQuestionIndex;
      const existing = state.responses.get(idx);
      const newResponses = new Map(state.responses);
      newResponses.set(idx, {
        selectedChoice: choice,
        markedForReview: existing?.markedForReview ?? false,
        timeSpentMs: existing?.timeSpentMs ?? 0,
      });
      set({ responses: newResponses });
    },

    clearResponse: () => {
      const state = get();
      const idx = state.currentQuestionIndex;
      const existing = state.responses.get(idx);
      const newResponses = new Map(state.responses);
      newResponses.set(idx, {
        selectedChoice: null,
        markedForReview: existing?.markedForReview ?? false,
        timeSpentMs: existing?.timeSpentMs ?? 0,
      });
      set({ responses: newResponses });
    },

    toggleMarkForReview: () => {
      const state = get();
      const idx = state.currentQuestionIndex;
      const existing = state.responses.get(idx);
      const newResponses = new Map(state.responses);
      newResponses.set(idx, {
        selectedChoice: existing?.selectedChoice ?? null,
        markedForReview: !(existing?.markedForReview ?? false),
        timeSpentMs: existing?.timeSpentMs ?? 0,
      });
      set({ responses: newResponses });
    },

    saveAndNext: () => {
      const state = get();
      const nextIdx = state.currentQuestionIndex + 1;
      if (nextIdx < state.questions.length) {
        const newVisited = new Set(state.visitedQuestions);
        newVisited.add(nextIdx);
        set({ currentQuestionIndex: nextIdx, visitedQuestions: newVisited });
      }
    },

    tickTimer: () => {
      const state = get();
      if (state.phase !== "active") return;
      const newTime = Math.max(0, state.timeRemainingSeconds - 1);
      set({
        timeRemainingSeconds: newTime,
        timerSeverity: computeTimerSeverity(newTime),
      });
    },

    setOnlineStatus: (online) => set({ isOnline: online }),

    setPendingSyncCount: (count) => set({ pendingSyncCount: count }),

    setLastCheckpoint: (timestamp) => set({ lastCheckpointAt: timestamp }),

    setSubmissionResult: (hash, submittedAt, eventId) =>
      set({
        phase: "submitted",
        submissionHash: hash,
        submittedAt,
        blockchainEventId: eventId,
      }),

    setError: (message) =>
      set({ errorMessage: message, phase: message ? "error" : get().phase }),

    setActiveLanguage: (lang) => set({ activeLanguage: lang }),

    setActiveSection: (section) => set({ activeSection: section }),

    addTimeSpent: (positionIndex, ms) => {
      const state = get();
      const existing = state.responses.get(positionIndex);
      const newResponses = new Map(state.responses);
      newResponses.set(positionIndex, {
        selectedChoice: existing?.selectedChoice ?? null,
        markedForReview: existing?.markedForReview ?? false,
        timeSpentMs: (existing?.timeSpentMs ?? 0) + ms,
      });
      set({ responses: newResponses });
    },

    getQuestionStatus: (index) => {
      const state = get();
      const visited = state.visitedQuestions.has(index);
      const response = state.responses.get(index);

      if (!visited && !response) return "not-visited";

      const answered = response?.selectedChoice != null;
      const marked = response?.markedForReview ?? false;

      if (marked && answered) return "review-answered";
      if (marked) return "review";
      if (answered) return "answered";
      return "not-answered";
    },

    getStatusCounts: () => {
      const state = get();
      const counts: Record<QuestionStatus, number> = {
        "not-visited": 0,
        "not-answered": 0,
        answered: 0,
        review: 0,
        "review-answered": 0,
      };
      for (let i = 0; i < state.questions.length; i++) {
        const status = state.getQuestionStatus(i);
        counts[status]++;
      }
      return counts;
    },

    getSectionQuestionIndices: (section) => {
      const state = get();
      if (!section) return state.questions.map((_, i) => i);
      return state.questions
        .map((q, i) => (q.section === section ? i : -1))
        .filter((i) => i >= 0);
    },

    getResponsesPayload: () => {
      const state = get();
      const payload: Record<number, { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }> = {};
      state.responses.forEach((r, idx) => {
        const question = state.questions[idx];
        if (question) {
          payload[question.position] = {
            selectedChoice: r.selectedChoice,
            markedForReview: r.markedForReview,
            timeSpentMs: r.timeSpentMs,
          };
        }
      });
      return payload;
    },
  }))
);
