import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics Dashboard",
  description: "Real-time analytics dashboard showing offline usage metrics",
};

/**
 * Analytics Dashboard
 *
 * A hidden page for monitoring offline usage metrics. Shows:
 * - Page views by path
 * - Worker profile visits
 * - Offline vs online usage
 * - Queue depth and sync status
 * - Storage health metrics
 *
 * Access at /debug/analytics — not linked in navigation.
 */
export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-ink-50 p-8 dark:bg-ink-950">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
          Analytics Dashboard
        </h1>
        <p className="mb-8 text-ink-500 dark:text-ink-400">
          Real-time metrics for offline usage, page views, and queue status.
        </p>
        <AnalyticsPanel />
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  return (
    <div className="space-y-6">
      {/* Page Views Summary */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Page Views
        </h2>
        <div id="page-views" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading page view analytics…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('page-views');
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
                    
                    // Group by path
                    const pathCounts = {};
                    const workerViews = {};
                    const onlineViews = events.filter(e => !e.offline).length;
                    const offlineViews = events.filter(e => e.offline).length;
                    
                    events.forEach(e => {
                      pathCounts[e.path] = (pathCounts[e.path] || 0) + 1;
                      if (e.workerId) {
                        workerViews[e.workerId] = (workerViews[e.workerId] || 0) + 1;
                      }
                    });
                    
                    const topPaths = Object.entries(pathCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10);
                    
                    const topWorkers = Object.entries(workerViews)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10);

                    el.innerHTML = \`
                      <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-ink-900 dark:text-ink-50">\${events.length}</div>
                          <div class="text-xs text-ink-500">Total Events</div>
                        </div>
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-green-600">\${onlineViews}</div>
                          <div class="text-xs text-ink-500">Online Views</div>
                        </div>
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-orange-500">\${offlineViews}</div>
                          <div class="text-xs text-ink-500">Offline Views</div>
                        </div>
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-brand-600">\${Object.keys(workerViews).length}</div>
                          <div class="text-xs text-ink-500">Unique Workers</div>
                        </div>
                      </div>
                      
                      <h3 class="font-semibold text-ink-900 dark:text-ink-50 mb-3">Top Pages</h3>
                      <div class="space-y-2">
                        \${topPaths.length > 0 ? topPaths.map(([path, count]) => \`
                          <div class="flex justify-between py-1 border-b border-ink-100 dark:border-ink-800">
                            <span class="font-mono text-xs truncate max-w-[200px]">\${path}</span>
                            <span class="font-semibold">\${count}</span>
                          </div>
                        \`).join('') : '<p class="text-ink-400">No page views recorded</p>'}
                      </div>
                      
                      <h3 class="font-semibold text-ink-900 dark:text-ink-50 mb-3 mt-6">Top Workers</h3>
                      <div class="space-y-2">
                        \${topWorkers.length > 0 ? topWorkers.map(([id, count]) => \`
                          <div class="flex justify-between py-1 border-b border-ink-100 dark:border-ink-800">
                            <span class="font-mono text-xs truncate max-w-[200px]">\${id}</span>
                            <span class="font-semibold">\${count}</span>
                          </div>
                        \`).join('') : '<p class="text-ink-400">No worker views recorded</p>'}
                      </div>
                    \`;
                    db.close();
                  };

                  req.onerror = () => {
                    el.innerHTML = '<p class="text-red-500">Error reading analytics</p>';
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

      {/* Offline Queue Status */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Offline Queue Status
        </h2>
        <div id="offline-queue" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading queue status…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function() {
                const el = document.getElementById('offline-queue');
                if (!el) return;
                try {
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
                    const avgRetry = actions.length > 0 
                      ? (actions.reduce((sum, a) => sum + (a.retryCount || 0), 0) / actions.length).toFixed(1)
                      : '0';
                    
                    el.innerHTML = \`
                      <div class="grid grid-cols-3 gap-4 mb-4">
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-ink-900 dark:text-ink-50">\${actions.length}</div>
                          <div class="text-xs text-ink-500">Pending Actions</div>
                        </div>
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-blue-600">\${leads}</div>
                          <div class="text-xs text-ink-500">Leads</div>
                        </div>
                        <div class="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                          <div class="text-2xl font-bold text-purple-600">\${reviews}</div>
                          <div class="text-xs text-ink-500">Reviews</div>
                        </div>
                      </div>
                      
                      <div class="flex justify-between py-2 border-b border-ink-100 dark:border-ink-800">
                        <span>Average Retry Count</span>
                        <span class="font-mono">\${avgRetry}</span>
                      </div>
                      
                      \${actions.length > 0 ? \`
                        <details class="mt-4">
                          <summary class="cursor-pointer text-brand-600 dark:text-brand-400">View pending actions</summary>
                          <pre class="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-50 p-3 text-xs dark:bg-ink-800">\${JSON.stringify(actions.slice(0, 10), null, 2)}</pre>
                        </details>
                      \` : ''}
                    \`;
                    db.close();
                  };

                  req.onerror = () => {
                    el.innerHTML = '<p class="text-red-500">Error reading queue</p>';
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

      {/* Search History */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Search History
        </h2>
        <div id="search-history" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading search history…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const el = document.getElementById('search-history');
                if (!el) return;
                try {
                  const stored = localStorage.getItem('wa-search-history');
                  const history = stored ? JSON.parse(stored) : [];
                  
                  const categoryCounts = {};
                  const cityCounts = {};
                  
                  history.forEach(h => {
                    if (h.category) categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
                    if (h.city) cityCounts[h.city] = (cityCounts[h.city] || 0) + 1;
                  });
                  
                  const topCategories = Object.entries(categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                  
                  const topCities = Object.entries(cityCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                  el.innerHTML = \`
                    <div class="flex justify-between py-2 border-b border-ink-100 dark:border-ink-800">
                      <span>Total Searches</span>
                      <span class="font-semibold">\${history.length}</span>
                    </div>
                    
                    <h3 class="font-semibold text-ink-900 dark:text-ink-50 mt-4 mb-2">Recent Searches</h3>
                    <div class="space-y-1">
                      \${history.slice(0, 5).map(h => \`
                        <div class="flex justify-between py-1 text-xs border-b border-ink-50 dark:border-ink-800">
                          <span class="truncate max-w-[150px]">\${h.query || h.category || '—'}</span>
                          <span class="text-ink-400">\${new Date(h.timestamp).toLocaleDateString()}</span>
                        </div>
                      \`).join('')}
                    </div>
                    
                    <h3 class="font-semibold text-ink-900 dark:text-ink-50 mt-4 mb-2">Top Categories</h3>
                    <div class="space-y-1">
                      \${topCategories.length > 0 ? topCategories.map(([cat, count]) => \`
                        <div class="flex justify-between py-1 text-xs border-b border-ink-50 dark:border-ink-800">
                          <span>\${cat}</span>
                          <span class="font-mono">\${count}</span>
                        </div>
                      \`).join('') : '<p class="text-ink-400">No searches yet</p>'}
                    </div>
                    
                    <h3 class="font-semibold text-ink-900 dark:text-ink-50 mt-4 mb-2">Top Cities</h3>
                    <div class="space-y-1">
                      \${topCities.length > 0 ? topCities.map(([city, count]) => \`
                        <div class="flex justify-between py-1 text-xs border-b border-ink-50 dark:border-ink-800">
                          <span>\${city}</span>
                          <span class="font-mono">\${count}</span>
                        </div>
                      \`).join('') : '<p class="text-ink-400">No searches yet</p>'}
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

      {/* Network Status */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
          Network & Sync Status
        </h2>
        <div id="network-status" className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
          <p>Loading network status…</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const el = document.getElementById('network-status');
                if (!el) return;
                
                const updateStatus = () => {
                  const online = navigator.onLine;
                  el.innerHTML = \`
                    <div class="flex items-center gap-3">
                      <div class="size-3 rounded-full \${online ? 'bg-green-500' : 'bg-red-500'}"></div>
                      <span class="font-semibold">\${online ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="flex justify-between py-2 mt-3 border-b border-ink-100 dark:border-ink-800">
                      <span>Connection Type</span>
                      <span class="font-mono">\${navigator.connection?.type || 'Unknown'}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-ink-100 dark:border-ink-800">
                      <span>Downlink</span>
                      <span class="font-mono">\${navigator.connection?.downlink || 'Unknown'} Mbps</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-ink-100 dark:border-ink-800">
                      <span>RTT</span>
                      <span class="font-mono">\${navigator.connection?.rtt || 'Unknown'} ms</span>
                    </div>
                  \`;
                };
                
                updateStatus();
                window.addEventListener('online', updateStatus);
                window.addEventListener('offline', updateStatus);
              })();
            `,
          }}
        />
      </section>
    </div>
  );
}
