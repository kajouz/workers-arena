/**
 * offline-queue.ts
 *
 * Client-side IndexedDB queue for actions that must survive offline periods.
 * When the browser is online the queue is transparent — actions go straight to
 * the server.  When offline, each action is serialised into an IndexedDB store
 * and replayed the next time the service worker reports the network is back.
 *
 * Supported action types:
 *   - "lead"    → POST /api/offline-queue/replay  (replayed as requestServiceAction)
 *   - "review"  → POST /api/offline-queue/replay  (replayed as submitReviewAction)
 *
 * The queue is persisted in the "workers-arena-offline" database, object store
 * "pending-actions", keyed on an auto-incremented id.  Each entry carries:
 *   { id, type, payload, createdAt, retryCount }
 *
 * Usage:
 *   import { enqueueAction, replayQueue } from "@/lib/offline-queue";
 *   await enqueueAction({ type: "lead", payload: { workerId: "abc" } });
 *   await replayQueue(); // called by the SW sync handler or the online listener
 */

const DB_NAME = "workers-arena-offline";
const DB_VERSION = 1;
const STORE = "pending-actions";

export type ActionType = "lead" | "review";

export interface QueuedAction {
  id?: number;
  type: ActionType;
  /** Action-specific payload serialised as a plain object. */
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

/* ── IndexedDB helpers ──────────────────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txMode(mode: IDBTransactionMode): IDBTransactionMode {
  return mode;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Push an action onto the offline queue.
 * Returns the queued entry (with its auto-generated id).
 */
export async function enqueueAction(
  action: Omit<QueuedAction, "id" | "createdAt" | "retryCount">,
): Promise<QueuedAction> {
  const entry: QueuedAction = {
    ...action,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readwrite"));
    const store = tx.objectStore(STORE);
    const req = store.add(entry);
    req.onsuccess = () => {
      entry.id = req.result as number;
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Return every pending action in creation order.
 */
export async function getPendingActions(): Promise<QueuedAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readonly"));
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedAction[]);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a single queued action by id.
 */
export async function removeAction(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readwrite"));
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clear the entire queue (e.g. after a successful batch replay).
 */
export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readwrite"));
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Return the number of pending actions.
 */
export async function pendingCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readonly"));
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/* ── Replay ─────────────────────────────────────────────────────────────── */

const MAX_RETRIES = 3;

/**
 * Replay all pending actions by POSTing them to the server.
 * Successfully replayed actions are deleted from the queue.
 * Actions that fail after MAX_RETRIES are left in the queue for manual
 * inspection (or a future admin UI).
 *
 * Returns the number of successfully replayed actions.
 */
export async function replayQueue(): Promise<number> {
  const actions = await getPendingActions();
  if (actions.length === 0) return 0;

  let replayed = 0;

  for (const action of actions) {
    try {
      const res = await fetch("/api/offline-queue/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });

      if (res.ok) {
        if (action.id != null) await removeAction(action.id);
        replayed++;
      } else {
        // Server rejected (e.g. validation error) — don't retry forever.
        await incrementRetry(action);
      }
    } catch {
      // Network error — stop replaying (we're probably still offline).
      break;
    }
  }

  return replayed;
}

async function incrementRetry(action: QueuedAction): Promise<void> {
  const id = action.id;
  if (id == null) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode("readwrite"));
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedAction | undefined;
      if (!existing) { resolve(); return; }
      existing.retryCount += 1;
      if (existing.retryCount >= MAX_RETRIES) {
        store.delete(id);
      } else {
        store.put(existing);
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}
