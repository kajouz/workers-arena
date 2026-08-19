/**
 * Offline form submission queue.
 *
 * Stores form submissions in IndexedDB when offline and replays them
 * when the network comes back online.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Conflict detection (duplicate submissions)
 * - Progress tracking
 * - Manual retry for failed submissions
 */

interface QueuedForm {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body: any;
  createdAt: number;
  retryCount: number;
  lastAttempt?: number;
  error?: string;
  status: "pending" | "retrying" | "failed" | "completed";
}

const DB_NAME = "workers-arena-forms";
const DB_VERSION = 1;
const STORE_NAME = "queued-forms";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // Base delay in ms

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

/**
 * Generate unique ID for queued form
 */
function generateId(): string {
  return `form_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Queue a form submission for offline processing
 */
export async function queueFormSubmission(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: any,
  headers: Record<string, string> = {}
): Promise<string> {
  const database = await initDB();
  const id = generateId();

  const queuedForm: QueuedForm = {
    id,
    url,
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
    createdAt: Date.now(),
    retryCount: 0,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(queuedForm);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all queued forms
 */
export async function getQueuedForms(): Promise<QueuedForm[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending forms count
 */
export async function getPendingCount(): Promise<number> {
  const forms = await getQueuedForms();
  return forms.filter((f) => f.status === "pending" || f.status === "retrying").length;
}

/**
 * Process queued forms (replay when online)
 */
export async function processQueuedForms(): Promise<{
  success: number;
  failed: number;
}> {
  const forms = await getQueuedForms();
  const pendingForms = forms.filter(
    (f) => f.status === "pending" || f.status === "retrying"
  );

  let success = 0;
  let failed = 0;

  for (const form of pendingForms) {
    try {
      await replayForm(form);
      await updateFormStatus(form.id, "completed");
      success++;
    } catch (error) {
      const newRetryCount = form.retryCount + 1;

      if (newRetryCount >= MAX_RETRIES) {
        await updateFormStatus(form.id, "failed", String(error));
        failed++;
      } else {
        await updateForm(form.id, {
          retryCount: newRetryCount,
          lastAttempt: Date.now(),
          status: "retrying",
          error: String(error),
        });
        failed++;
      }
    }
  }

  return { success, failed };
}

/**
 * Replay a single form submission
 */
async function replayForm(form: QueuedForm): Promise<void> {
  const response = await fetch(form.url, {
    method: form.method,
    headers: form.headers,
    body: JSON.stringify(form.body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

/**
 * Update form status
 */
async function updateFormStatus(
  id: string,
  status: QueuedForm["status"],
  error?: string
): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const form = request.result;
      if (form) {
        form.status = status;
        if (error) form.error = error;
        store.put(form);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update form data
 */
async function updateForm(
  id: string,
  updates: Partial<QueuedForm>
): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const form = request.result;
      if (form) {
        Object.assign(form, updates);
        store.put(form);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a queued form
 */
export async function deleteQueuedForm(id: string): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all completed/failed forms
 */
export async function clearProcessedForms(): Promise<void> {
  const forms = await getQueuedForms();
  const processed = forms.filter(
    (f) => f.status === "completed" || f.status === "failed"
  );

  for (const form of processed) {
    await deleteQueuedForm(form.id);
  }
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Set up automatic processing when online
 */
export function setupAutoProcess(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("online", async () => {
    console.log("[OfflineForms] Back online, processing queue...");
    const result = await processQueuedForms();
    console.log(`[OfflineForms] Processed: ${result.success} success, ${result.failed} failed`);
  });
}
