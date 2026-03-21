/**
 * ParikshaSuraksha Service Worker
 * Provides offline exam capability:
 * - Caches exam questions at load time
 * - Queues response submissions for offline sync
 * - Background sync when connectivity restored
 */

const CACHE_NAME = "pariksha-exam-v1";
const STATIC_CACHE_NAME = "pariksha-static-v1";

// Static assets to pre-cache
const STATIC_ASSETS = [
  "/",
  "/exam",
  "/verify/check",
];

// API patterns that should be cached
const CACHEABLE_API_PATTERNS = [
  /\/api\/v1\/exam-session\/start$/,
];

// API patterns that should be queued when offline
const QUEUEABLE_API_PATTERNS = [
  /\/api\/v1\/exam-session\/checkpoint$/,
  /\/api\/v1\/exam-session\/submit$/,
];

// --- Install: Pre-cache static assets ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Some assets may not be available yet during build
      });
    })
  );
  self.skipWaiting();
});

// --- Activate: Clean old caches ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- Fetch: Serve from cache or network ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests that are not queueable
  if (request.method !== "GET") {
    // Check if this is a queueable POST request
    const isQueueable = QUEUEABLE_API_PATTERNS.some((pattern) =>
      pattern.test(url.pathname)
    );

    if (isQueueable) {
      event.respondWith(handleQueueableRequest(request));
      return;
    }

    // Let non-queueable non-GET requests pass through
    return;
  }

  // Check if this is a cacheable API request
  const isCacheableApi = CACHEABLE_API_PATTERNS.some((pattern) =>
    pattern.test(url.pathname)
  );

  if (isCacheableApi) {
    event.respondWith(handleCacheableApiRequest(request));
    return;
  }

  // For navigation and static assets: network-first with cache fallback
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match("/");
        });
      })
    );
    return;
  }

  // For other assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (request.destination === "script" || request.destination === "style" || request.destination === "font")) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Return offline fallback for images
        if (request.destination === "image") {
          return new Response("", { status: 404 });
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});

// --- Handle cacheable API requests (network-first, cache-fallback) ---
async function handleCacheableApiRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- Handle queueable requests (POST checkpoint/submit) ---
async function handleQueueableRequest(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Network failed: store request in IndexedDB for later sync
    const body = await request.clone().text();

    // Store in the sync queue via message to client
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "OFFLINE_QUEUE",
        url: request.url,
        method: request.method,
        body: body,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: Date.now(),
      });
    });

    // Return a synthetic success response so the app does not break
    return new Response(JSON.stringify({ saved: true, offline: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- Background Sync ---
self.addEventListener("sync", (event) => {
  if (event.tag === "pariksha-sync-queue") {
    event.waitUntil(processPendingSync());
  }
});

async function processPendingSync() {
  // Notify clients to process their sync queues
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "SYNC_QUEUE" });
  });
}

// --- Message handler: cache exam questions ---
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_QUESTIONS") {
    const { questions } = event.data;
    caches.open(CACHE_NAME).then((cache) => {
      // Store questions as a cache entry
      const response = new Response(JSON.stringify(questions), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put("/cached-questions", response);
    });
  }

  if (event.data && event.data.type === "CLEAR_EXAM_CACHE") {
    caches.delete(CACHE_NAME);
  }
});
