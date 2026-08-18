/**
 * analytics-queue.ts
 *
 * Client-side IndexedDB queue for page-view analytics events.  When the
 * browser is online the queue is transparent — events go straight to the
 * server.  When offline, each event is serialised into an IndexedDB store
 * and batch-sent the next time the network is available.
 *
 * Events are stored in the "workers-arena-analytics" database, object store
 * "page-views", keyed on an auto-incremented id.  Each entry carries:
 *   { id, workerId, path, timestamp }
 *
 * Usage:
 *   import { trackPageView, flushAnalyticsQueue } from "@/lib/analytics-queue";
 *   await trackPageView("/workers/khaled-al-harbi-plumbing", "khaled-plumb");
 *   await flushAnalyticsQueue(); // called by the SW sync handler or the online listener
 */

const DB_NAME = "workers-arena-analytics";
const DB_VERSION = 1;
const STORE = "page-views";

export interface PageViewEvent {
  id?: number;
  /** Worker id if viewing a profile, otherwise null. */
  workerId: string | null;
  /** The page path being viewed. */
  path: string;
  /** ISO timestamp of the view. */
  timestamp: string;
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

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Record a page-view event.  If online, sends it immediately via server
 * action.  If offline, queues it in IndexedDB for later batch-send.
 */
export async function trackPageView(path: string, workerId: string | null = null): Promise<void> {
  const event: PageViewEvent = {
    workerId,
    path,
    timestamp: new Date().toISOString(),
  };

  if (navigator.onLine) {
    // Best-effort immediate send — if it fails, queue it.
    try {
      const res = await fetch("/api/analytics/page-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (res.ok) return;
    } catch {
      // Fall through to queue.
    }
  }

  // Offline or send failed — persist to IndexedDB.
  await enqueueEvent(event);
}

async function enqueueEvent(event: PageViewEvent): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.add(event);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Return every queued page-view event in creation order.
 */
export async function getQueuedEvents(): Promise<PageViewEvent[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PageViewEvent[]);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a single queued event by id.
 */
export async function removeEvent(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clear the entire analytics queue.
 */
export async function clearAnalyticsQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Return the number of queued analytics events.
 */
export async function analyticsQueueSize(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/* ── Batch flush ────────────────────────────────────────────────────────── */

/**
 * Send all queued analytics events to the server in a single batch.
 * Successfully sent events are deleted from the queue.
 *
 * Returns the number of events flushed.
 */
export async function flushAnalyticsQueue(): Promise<number> {
  const events = await getQueuedEvents();
  if (events.length === 0) return 0;

  try {
    const res = await fetch("/api/analytics/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: events }),
    });

    if (!res.ok) return 0;

    // Clear the queue on success.
    await clearAnalyticsQueue();
    return events.length;
  } catch {
    // Network error — still offline.
    return 0;
  }
}
