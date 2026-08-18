import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PWA Debug Dashboard",
  description: "Debug PWA offline features, cache sizes, and storage usage",
};

/**
 * PWA Debug Dashboard
 *
 * A hidden page for debugging PWA offline features. Shows:
 * - Cache sizes (shell, assets, profiles)
 * - Storage usage (quota, usage, free space)
 * - Offline queue depth (pending actions)
 * - Analytics queue depth (pending events)
 * - Service worker status
 *
 * Access at /debug/pwa — not linked in navigation.
 */
export default function DebugPWAPage() {
  return (
    <div className="min-h-screen bg-ink-50 p-8 dark:bg-ink-950">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
          PWA Debug Dashboard
        </h1>
        <p className="mb-8 text-ink-500 dark:text-ink-400">
          Monitor offline features, cache sizes, and storage usage.
        </p>
        <PWADebugPanel />
      </div>
    </div>
  );
}

/**
 * Client-side panel that reads cache sizes, storage usage, and queue depths.
 * This is a server component wrapper; the actual debug logic runs on the client.
 */
function PWADebugPanel() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Cache Status
        </h2>
        <div id="cache-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading cache information…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('cache-status');
                if (!el) return;
                try {
                  const cacheNames = await caches.keys();
                  const results = [];
                  for (const name of cacheNames) {
                    if (!name.startsWith('wa-')) continue;
                    const cache = await caches.open(name);
                    const keys = await cache.keys();
                    results.push(\`<div class="flex justify-between py-1 border-b border-ink-100 dark:border-ink-800"><span class="font-mono text-xs">\${name}</span><span class="font-semibold">\${keys.length} entries</span></div>\`);
                  }
                  el.innerHTML = results.length ? results.join('') : '<p class="text-ink-400">No WA caches found</p>';
                } catch(e) {
                  el.innerHTML = '<p class="text-red-500">Error reading caches: ' + e.message + '</p>';
                }
              })();
            `,
          }}
        />
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Storage Usage
        </h2>
        <div id="storage-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading storage information…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('storage-status');
                if (!el) return;
                try {
                  if (!navigator.storage || !navigator.storage.estimate) {
                    el.innerHTML = '<p class="text-ink-400">Storage API not available</p>';
                    return;
                  }
                  const { quota, usage } = await navigator.storage.estimate();
                  const free = quota - usage;
                  const usedPercent = ((usage / quota) * 100).toFixed(1);
                  const formatBytes = (b) => {
                    if (b < 1024) return b + ' B';
                    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
                    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
                    return (b / 1073741824).toFixed(2) + ' GB';
                  };
                  el.innerHTML = \`
                    <div class="space-y-2">
                      <div class="flex justify-between"><span>Quota</span><span class="font-mono">\${formatBytes(quota)}</span></div>
                      <div class="flex justify-between"><span>Used</span><span class="font-mono">\${formatBytes(usage)} (\${usedPercent}%)</span></div>
                      <div class="flex justify-between"><span>Free</span><span class="font-mono">\${formatBytes(free)}</span></div>
                      <div class="mt-2 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                        <div class="h-2 rounded-full bg-brand-500" style="width: \${usedPercent}%"></div>
                      </div>
                    </div>
                  \`;
                } catch(e) {
                  el.innerHTML = '<p class="text-red-500">Error reading storage: ' + e.message + '</p>';
                }
              })();
            `,
          }}
        />
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Offline Queue
        </h2>
        <div id="queue-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading queue information…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('queue-status');
                if (!el) return;
                try {
                  // Read offline queue from IndexedDB
                  const DB_NAME = 'workers-arena-offline';
                  const DB_VERSION = 1;
                  const STORE = 'pending-actions';

                  function openDB() {
                    return new Promise((resolve, reject) => {
                      const request = indexedDB.open(DB_NAME, DB_VERSION);
                      request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(STORE)) {
                          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                        }
                      };
                      request.onsuccess = () => resolve(request.result);
                      request.onerror = () => reject(request.error);
                    });
                  }

                  const db = await openDB();
                  const tx = db.transaction(STORE, 'readonly');
                  const store = tx.objectStore(STORE);
                  const req = store.getAll();

                  req.onsuccess = () => {
                    const actions = req.result;
                    const leads = actions.filter(a => a.type === 'lead').length;
                    const reviews = actions.filter(a => a.type === 'review').length;
                    el.innerHTML = \`
                      <div class="space-y-2">
                        <div class="flex justify-between"><span>Total pending</span><span class="font-semibold">\${actions.length}</span></div>
                        <div class="flex justify-between"><span>Leads</span><span class="font-mono">\${leads}</span></div>
                        <div class="flex justify-between"><span>Reviews</span><span class="font-mono">\${reviews}</span></div>
                        \${actions.length > 0 ? \`
                          <details class="mt-4">
                            <summary class="cursor-pointer text-brand-600 dark:text-brand-400">View pending actions</summary>
                            <pre class="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-50 p-3 text-xs dark:bg-ink-800">\${JSON.stringify(actions, null, 2)}</pre>
                          </details>
                        \` : ''}
                      </div>
                    \`;
                    db.close();
                  };

                  req.onerror = () => {
                    el.innerHTML = '<p class="text-red-500">Error reading offline queue</p>';
                    db.close();
                  };
                } catch(e) {
                  el.innerHTML = '<p class="text-red-500">Error: ' + e.message + '</p>';
                }
              })();
            `,
          }}
        />
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Analytics Queue
        </h2>
        <div id="analytics-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading analytics queue…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('analytics-status');
                if (!el) return;
                try {
                  const DB_NAME = 'workers-arena-analytics';
                  const DB_VERSION = 1;
                  const STORE = 'page-views';

                  function openDB() {
                    return new Promise((resolve, reject) => {
                      const request = indexedDB.open(DB_NAME, DB_VERSION);
                      request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(STORE)) {
                          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                        }
                      };
                      request.onsuccess = () => resolve(request.result);
                      request.onerror = () => reject(request.error);
                    });
                  }

                  const db = await openDB();
                  const tx = db.transaction(STORE, 'readonly');
                  const store = tx.objectStore(STORE);
                  const req = store.getAll();

                  req.onsuccess = () => {
                    const events = req.result;
                    el.innerHTML = \`
                      <div class="space-y-2">
                        <div class="flex justify-between"><span>Queued events</span><span class="font-semibold">\${events.length}</span></div>
                        \${events.length > 0 ? \`
                          <details class="mt-4">
                            <summary class="cursor-pointer text-brand-600 dark:text-brand-400">View queued events</summary>
                            <pre class="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-50 p-3 text-xs dark:bg-ink-800">\${JSON.stringify(events.slice(0, 20), null, 2)}</pre>
                          </details>
                        \` : ''}
                      </div>
                    \`;
                    db.close();
                  };

                  req.onerror = () => {
                    el.innerHTML = '<p class="text-red-500">Error reading analytics queue</p>';
                    db.close();
                  };
                } catch(e) {
                  el.innerHTML = '<p class="text-red-500">Error: ' + e.message + '</p>';
                }
              })();
            `,
          }}
        />
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Service Worker Status
        </h2>
        <div id="sw-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading service worker status…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('sw-status');
                if (!el) return;
                try {
                  if (!('serviceWorker' in navigator)) {
                    el.innerHTML = '<p class="text-ink-400">Service Worker not supported</p>';
                    return;
                  }
                  const reg = await navigator.serviceWorker.getRegistration();
                  if (!reg) {
                    el.innerHTML = '<p class="text-ink-400">No service worker registered</p>';
                    return;
                  }
                  const status = reg.active ? 'Active' : reg.installing ? 'Installing' : reg.waiting ? 'Waiting' : 'Unknown';
                  el.innerHTML = \`
                    <div class="space-y-2">
                      <div class="flex justify-between"><span>Status</span><span class="font-semibold">\${status}</span></div>
                      <div class="flex justify-between"><span>Scope</span><span class="font-mono text-xs">\${reg.scope}</span></div>
                      <div class="flex justify-between"><span>Update available</span><span class="font-mono">\${reg.waiting ? 'Yes' : 'No'}</span></div>
                    </div>
                  \`;
                } catch(e) {
                  el.innerHTML = '<p class="text-red-500">Error: ' + e.message + '</p>';
                }
              })();
            `,
          }}
        />
      </section>
    </div>
  );
}
