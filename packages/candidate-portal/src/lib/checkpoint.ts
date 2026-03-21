/**
 * Auto-checkpoint logic: saves exam state every 30 seconds.
 * Dual-write strategy:
 *   1. localStorage (immediate, offline-safe)
 *   2. Server POST /exam-session/checkpoint (when online)
 * Also manages the sync queue for offline-to-online recovery.
 */

import { useExamStore } from "./exam-store";
import { submitCheckpoint, type CheckpointPayload } from "./api";
import {
  saveResponseOffline,
  addToSyncQueue,
  getSyncQueue,
  removeSyncQueueItem,
  getSyncQueueCount,
  type OfflineResponse,
} from "./offline";

const CHECKPOINT_INTERVAL_MS = 30_000;
const LOCAL_STORAGE_KEY = "ps_exam_checkpoint";
const MAX_RETRY_COUNT = 5;

let checkpointIntervalId: ReturnType<typeof setInterval> | null = null;
let questionTimeTracker: ReturnType<typeof setInterval> | null = null;

/**
 * Saves the current exam state to localStorage.
 */
function saveToLocalStorage(): void {
  try {
    const state = useExamStore.getState();
    const checkpoint = {
      sessionId: state.sessionId,
      examId: state.examId,
      currentQuestionIndex: state.currentQuestionIndex,
      responses: Object.fromEntries(state.responses),
      visitedQuestions: Array.from(state.visitedQuestions),
      timeRemainingSeconds: state.timeRemainingSeconds,
      savedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(checkpoint));
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Loads a previously saved checkpoint from localStorage.
 */
export function loadFromLocalStorage(): {
  sessionId: string;
  currentQuestionIndex: number;
  responses: Map<number, { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }>;
  visitedQuestions: Set<number>;
  timeRemainingSeconds: number;
} | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      sessionId: data.sessionId,
      currentQuestionIndex: data.currentQuestionIndex,
      responses: new Map(Object.entries(data.responses).map(([k, v]) => [Number(k), v as { selectedChoice: string | null; markedForReview: boolean; timeSpentMs: number }])),
      visitedQuestions: new Set(data.visitedQuestions),
      timeRemainingSeconds: data.timeRemainingSeconds,
    };
  } catch {
    return null;
  }
}

/**
 * Clears the localStorage checkpoint.
 */
export function clearLocalCheckpoint(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Saves all current responses to IndexedDB for offline resilience.
 */
async function saveToIndexedDB(): Promise<void> {
  const state = useExamStore.getState();
  const promises: Promise<void>[] = [];

  state.responses.forEach((response, idx) => {
    const offlineResponse: OfflineResponse = {
      position: idx,
      selectedChoice: response.selectedChoice,
      markedForReview: response.markedForReview,
      timeSpentMs: response.timeSpentMs,
      updatedAt: Date.now(),
    };
    promises.push(saveResponseOffline(offlineResponse));
  });

  await Promise.all(promises);
}

/**
 * Sends a checkpoint to the server. On failure, queues for later sync.
 */
async function sendCheckpointToServer(): Promise<void> {
  const state = useExamStore.getState();
  if (!state.sessionId || state.phase !== "active") return;

  const elapsed = state.totalDurationSeconds - state.timeRemainingSeconds;

  const payload: CheckpointPayload = {
    sessionId: state.sessionId,
    responses: state.getResponsesPayload(),
    currentQuestionPosition: state.questions[state.currentQuestionIndex]?.position ?? 0,
    elapsedMs: elapsed * 1000,
  };

  if (state.isOnline) {
    try {
      await submitCheckpoint(payload);
      state.setLastCheckpoint(Date.now());
    } catch {
      // Network failure: queue for sync
      await addToSyncQueue({
        id: `checkpoint-${Date.now()}`,
        type: "checkpoint",
        payload,
        createdAt: Date.now(),
        retryCount: 0,
      });
      const count = await getSyncQueueCount();
      state.setPendingSyncCount(count);
    }
  } else {
    await addToSyncQueue({
      id: `checkpoint-${Date.now()}`,
      type: "checkpoint",
      payload,
      createdAt: Date.now(),
      retryCount: 0,
    });
    const count = await getSyncQueueCount();
    state.setPendingSyncCount(count);
  }
}

/**
 * Processes the offline sync queue. Called when connectivity is restored.
 */
export async function processSyncQueue(): Promise<void> {
  const queue = await getSyncQueue();
  const store = useExamStore.getState();

  for (const item of queue) {
    if (item.retryCount >= MAX_RETRY_COUNT) {
      await removeSyncQueueItem(item.id);
      continue;
    }

    try {
      if (item.type === "checkpoint") {
        await submitCheckpoint(item.payload as CheckpointPayload);
      }
      await removeSyncQueueItem(item.id);
    } catch {
      // Will retry on next sync cycle
    }
  }

  const remainingCount = await getSyncQueueCount();
  store.setPendingSyncCount(remainingCount);
}

/**
 * Performs a full checkpoint: localStorage + IndexedDB + server.
 */
async function performCheckpoint(): Promise<void> {
  saveToLocalStorage();
  await saveToIndexedDB();
  await sendCheckpointToServer();
}

/**
 * Tracks time spent on the current question (updates every second).
 */
function startQuestionTimeTracker(): void {
  if (questionTimeTracker) clearInterval(questionTimeTracker);
  questionTimeTracker = setInterval(() => {
    const state = useExamStore.getState();
    if (state.phase === "active") {
      state.addTimeSpent(state.currentQuestionIndex, 1000);
    }
  }, 1000);
}

/**
 * Starts the auto-checkpoint system.
 */
export function startAutoCheckpoint(): void {
  stopAutoCheckpoint();
  checkpointIntervalId = setInterval(performCheckpoint, CHECKPOINT_INTERVAL_MS);
  startQuestionTimeTracker();
}

/**
 * Stops the auto-checkpoint system.
 */
export function stopAutoCheckpoint(): void {
  if (checkpointIntervalId) {
    clearInterval(checkpointIntervalId);
    checkpointIntervalId = null;
  }
  if (questionTimeTracker) {
    clearInterval(questionTimeTracker);
    questionTimeTracker = null;
  }
}

/**
 * Performs a final checkpoint before submission.
 */
export async function finalCheckpoint(): Promise<void> {
  saveToLocalStorage();
  await saveToIndexedDB();
}
