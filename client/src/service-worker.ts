/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { version } from "$service-worker";

const CACHE_NAME = `outliner-cache-${version}`;
const ASSETS = [
    "/",
    "/favicon.png",
    "/sql-wasm.wasm",
];

// Type definitions to avoid no-undef errors
type ServiceWorkerGlobalScope = typeof globalThis & {
    skipWaiting(): Promise<void>;
};

// Service Worker環境でのidbインポート
declare const self: ServiceWorkerGlobalScope;

// IndexedDBの初期化（Service Worker環境用）
let dbPromise: Promise<IDBDatabase> | undefined;

async function initDB() {
    if (dbPromise) return dbPromise;

    // Service Worker環境でのIndexedDB使用
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("outliner", 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("ops")) {
                db.createObjectStore("ops", { keyPath: "id", autoIncrement: true });
            }
        };
    });

    return dbPromise;
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS).catch(err => {
                console.warn("Failed to cache some assets:", err);
                // 一部のアセットのキャッシュに失敗しても続行
            });
        }),
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // 古いキャッシュを削除
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    }),
                );
            }),
        ]),
    );
});

async function queueOp(url: string, body: Record<string, unknown> | null) {
    try {
        const db = await initDB();
        const tx = db.transaction("ops", "readwrite");
        const store = tx.objectStore("ops");
        await new Promise((resolve, reject) => {
            const request = store.add({ url, body });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn("Failed to queue operation:", err);
    }
}

async function sendQueuedOps() {
    try {
        const db = await initDB();
        const tx = db.transaction("ops", "readwrite");
        const store = tx.objectStore("ops");

        const ops = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        for (const op of ops as { id: number; url: string; body: Record<string, unknown>; }[]) {
            try {
                await fetch(op.url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(op.body),
                });

                await new Promise((resolve, reject) => {
                    const request = store.delete(op.id);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            } catch {
                // stop processing on failure
                break;
            }
        }
    } catch (err) {
        console.warn("Failed to send queued operations:", err);
    }
}

self.addEventListener("sync", event => {
    if (event.tag === "sync-ops") {
        event.waitUntil(sendQueuedOps());
    }
});

self.addEventListener("fetch", event => {
    const req = event.request;

    // GETリクエストのキャッシュ処理
    if (req.method === "GET") {
        event.respondWith(
            caches.match(req).then(res => {
                if (res) {
                    return res;
                }

                return fetch(req).then(response => {
                    // レスポンスが正常な場合のみキャッシュ
                    if (response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(req, copy).catch(err => {
                                console.warn("Failed to cache response:", err);
                            });
                        });
                    }
                    return response;
                }).catch(err => {
                    console.warn("Fetch failed, trying cache:", err);
                    return caches.match(req) || new Response("Network error", { status: 503 });
                });
            }),
        );
        return;
    }

    // POSTリクエストのオフライン対応
    if (req.method === "POST" && req.url.includes("/api/")) {
        event.respondWith(
            fetch(req.clone()).catch(async () => {
                try {
                    const body = await req.clone().json().catch(() => null);
                    await queueOp(req.url, body);
                    return new Response(JSON.stringify({ queued: true }), {
                        status: 202,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.warn("Failed to queue operation:", err);
                    return new Response(JSON.stringify({ error: "Failed to queue operation" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            }),
        );
    }
});
