const CACHE_NAME = 'outliner-cache-v1';
const ASSETS = [
  '/',
  '/favicon.png',
  '/sql-wasm.wasm'
];

import { openDB } from 'idb';

const dbPromise = openDB('outliner', 1, {
  upgrade(db) {
    db.createObjectStore('ops', { keyPath: 'id', autoIncrement: true });
  }
});

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(self.clients.claim());
});

async function queueOp(url: string, body: any) {
  const db = await dbPromise;
  await db.add('ops', { url, body });
}

async function sendQueuedOps() {
  const db = await dbPromise;
  const tx = db.transaction('ops', 'readwrite');
  const store = tx.objectStore('ops');
  const ops = await store.getAll();
  for (const op of ops) {
    try {
      await fetch(op.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.body)
      });
      await store.delete(op.id);
    } catch {
      // stop processing on failure
      break;
    }
  }
  await tx.done;
}

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-ops') {
    event.waitUntil(sendQueuedOps());
  }
});

self.addEventListener('fetch', (event: any) => {
  const req = event.request;
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then(res => {
        return res || fetch(req).then(r => {
          const copy = r.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return r;
        }).catch(() => caches.match(req));
      })
    );
    return;
  }
  if (req.method === 'POST' && req.url.includes('/api/')) {
    event.respondWith(
      fetch(req.clone()).catch(async () => {
        const body = await req.clone().json().catch(() => null);
        await queueOp(req.url, body);
        return new Response(JSON.stringify({ queued: true }), { status: 202 });
      })
    );
  }
});
