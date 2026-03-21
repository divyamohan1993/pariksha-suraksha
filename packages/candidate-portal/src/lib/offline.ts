/**
 * IndexedDB-backed offline storage for exam responses.
 * Ensures no data loss even if network drops during exam.
 * Uses the 'idb' library for a promise-based IndexedDB API.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "pariksha_exam_offline";
const DB_VERSION = 1;

const STORE_RESPONSES = "responses";
const STORE_SYNC_QUEUE = "sync_queue";
const STORE_QUESTIONS = "questions";

export interface OfflineResponse {
  position: number;
  selectedChoice: string | null;
  markedForReview: boolean;
  timeSpentMs: number;
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  type: "checkpoint" | "submit";
  payload: unknown;
  createdAt: number;
  retryCount: number;
}

export interface CachedQuestion {
  position: number;
  data: unknown;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_RESPONSES)) {
          db.createObjectStore(STORE_RESPONSES, { keyPath: "position" });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
          db.createObjectStore(STORE_QUESTIONS, { keyPath: "position" });
        }
      },
    });
  }
  return dbPromise;
}

// --- Response Storage ---

export async function saveResponseOffline(response: OfflineResponse): Promise<void> {
  const db = await getDB();
  await db.put(STORE_RESPONSES, response);
}

export async function getAllResponsesOffline(): Promise<OfflineResponse[]> {
  const db = await getDB();
  return db.getAll(STORE_RESPONSES);
}

export async function getResponseOffline(position: number): Promise<OfflineResponse | undefined> {
  const db = await getDB();
  return db.get(STORE_RESPONSES, position);
}

export async function clearResponsesOffline(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_RESPONSES);
}

// --- Sync Queue ---

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put(STORE_SYNC_QUEUE, item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll(STORE_SYNC_QUEUE);
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_SYNC_QUEUE, id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_SYNC_QUEUE);
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_SYNC_QUEUE);
}

// --- Question Cache ---

export async function cacheQuestions(questions: CachedQuestion[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_QUESTIONS, "readwrite");
  for (const q of questions) {
    await tx.store.put(q);
  }
  await tx.done;
}

export async function getCachedQuestions(): Promise<CachedQuestion[]> {
  const db = await getDB();
  return db.getAll(STORE_QUESTIONS);
}

export async function clearCachedQuestions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_QUESTIONS);
}

// --- Full Cleanup ---

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear(STORE_RESPONSES),
    db.clear(STORE_SYNC_QUEUE),
    db.clear(STORE_QUESTIONS),
  ]);
}
