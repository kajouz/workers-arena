/**
 * Offline Cache Manager
 * 
 * Client-side manager for offline caching functionality.
 * Provides APIs to:
 * - Check online/offline status
 * - Cache data for offline use
 * - Sync offline actions when back online
 * - Manage cache storage
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface OfflineAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

export interface CacheStatus {
  [cacheName: string]: number; // cache name → entry count
}

export interface OfflineQueueStatus {
  pending: number;
  failed: number;
  lastSync?: Date;
}

// ─── Online/Offline Status ─────────────────────────────────────────

let isOnline = navigator.onLine;

/**
 * Check if the app is currently online
 */
export function getOnlineStatus(): boolean {
  return isOnline;
}

/**
 * Register listeners for online/offline events
 */
export function registerOnlineStatusListeners(callbacks: {
  onOnline?: () => void;
  onOffline?: () => void;
}): () => void {
  const handleOnline = () => {
    isOnline = true;
    console.log("[OfflineCache] App is online");
    callbacks.onOnline?.();
  };

  const handleOffline = () => {
    isOnline = false;
    console.log("[OfflineCache] App is offline");
    callbacks.onOffline?.();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

// ─── Local Storage Cache ───────────────────────────────────────────

const CACHE_PREFIX = "workersarena_cache_";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cache data in local storage with expiry
 */
export function cacheData<T>(key: string, data: T, ttlMs?: number): void {
  const entry = {
    data,
    timestamp: Date.now(),
    expiry: Date.now() + (ttlMs || CACHE_EXPIRY_MS),
  };

  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (error) {
    console.error("[OfflineCache] Failed to cache data:", error);
  }
}

/**
 * Retrieve cached data if valid
 */
export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    
    // Check if expired
    if (Date.now() > entry.expiry) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return entry.data as T;
  } catch {
    return null;
  }
}

/**
 * Remove cached data
 */
export function removeCachedData(key: string): void {
  localStorage.removeItem(`${CACHE_PREFIX}${key}`);
}

/**
 * Clear all cached data
 */
export function clearAllCache(): void {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}

// ─── IndexedDB Cache (for larger data) ─────────────────────────────

const DB_NAME = "workersarena-offline";
const DB_VERSION = 1;
const STORE_NAME = "cache";

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

/**
 * Cache large data in IndexedDB
 */
export async function cacheLargeData<T>(key: string, data: T): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  store.put({
    key,
    data,
    timestamp: Date.now(),
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve large cached data from IndexedDB
 */
export async function getCachedLargeData<T>(key: string): Promise<T | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result?.data ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all IndexedDB cache
 */
export async function clearIndexedDBCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
}

// ─── Service Worker Communication ──────────────────────────────────

/**
 * Send message to service worker
 */
function sendToServiceWorker(message: { type: string; payload?: unknown }): void {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

/**
 * Get cache status from service worker
 */
export function getCacheStatus(): Promise<CacheStatus> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    
    channel.port1.onmessage = (event) => {
      if (event.data.type === "CACHE_STATUS") {
        resolve(event.data.payload);
      }
    };

    sendToServiceWorker({
      type: "GET_CACHE_STATUS",
    });

    // Fallback timeout
    setTimeout(() => resolve({}), 1000);
  });
}

/**
 * Clear all caches via service worker
 */
export function clearServiceWorkerCache(): void {
  sendToServiceWorker({ type: "CLEAR_CACHE" });
}

// ─── Offline Queue ─────────────────────────────────────────────────

const QUEUE_KEY = "workersarena_offline_queue";

/**
 * Add action to offline queue
 */
export function queueOfflineAction(action: Omit<OfflineAction, "id" | "timestamp" | "retries">): OfflineAction {
  const queue = getOfflineQueue();
  
  const newAction: OfflineAction = {
    ...action,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    retries: 0,
  };

  queue.push(newAction);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

  return newAction;
}

/**
 * Get offline queue
 */
export function getOfflineQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Remove action from queue
 */
export function removeOfflineAction(actionId: string): void {
  const queue = getOfflineQueue().filter((a) => a.id !== actionId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Clear offline queue
 */
export function clearOfflineQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

/**
 * Get offline queue status
 */
export function getOfflineQueueStatus(): OfflineQueueStatus {
  const queue = getOfflineQueue();
  return {
    pending: queue.length,
    failed: queue.filter((a) => a.retries > 3).length,
    lastSync: queue.length > 0 ? new Date(queue[0].timestamp) : undefined,
  };
}

// ─── Sync Offline Actions ──────────────────────────────────────────

/**
 * Sync offline actions when back online
 */
export async function syncOfflineActions(): Promise<{
  synced: number;
  failed: number;
}> {
  const queue = getOfflineQueue();
  let synced = 0;
  let failed = 0;

  for (const action of queue) {
    try {
      // Attempt to sync the action
      await syncAction(action);
      removeOfflineAction(action.id);
      synced++;
    } catch (error) {
      console.error(`[OfflineCache] Failed to sync action ${action.id}:`, error);
      
      // Increment retry count
      action.retries++;
      if (action.retries > 3) {
        removeOfflineAction(action.id);
        failed++;
      }
    }
  }

  return { synced, failed };
}

async function syncAction(action: OfflineAction): Promise<void> {
  // Implement action-specific sync logic here
  // This would call your API endpoints based on action.type
  console.log(`[OfflineCache] Syncing action: ${action.type}`, action.payload);
}

// ─── Initialize Offline Cache ──────────────────────────────────────

/**
 * Initialize offline cache system
 */
export function initializeOfflineCache(callbacks?: {
  onOnline?: () => void;
  onOffline?: () => void;
  onSyncComplete?: (result: { synced: number; failed: number }) => void;
}): () => void {
  // Register online/offline listeners
  const cleanup = registerOnlineStatusListeners({
    onOnline: async () => {
      callbacks?.onOnline?.();
      
      // Sync offline actions when coming back online
      const result = await syncOfflineActions();
      callbacks?.onSyncComplete?.(result);
    },
    onOffline: callbacks?.onOffline,
  });

  // Initial sync check
  if (isOnline) {
    syncOfflineActions().then((result) => {
      if (result.synced > 0 || result.failed > 0) {
        callbacks?.onSyncComplete?.(result);
      }
    });
  }

  return cleanup;
}
