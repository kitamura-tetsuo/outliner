/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { getLogger } from "./lib/logger";
const logger = getLogger("ServiceWorker");

import { build, files, version } from "$service-worker";

const CACHE_NAME = `outliner-cache-${version}`;
const ASSETS = [
    "/",
    ...build,
    ...files,
];

// Type definitions to avoid no-undef errors
// Import idb in Service Worker environment

interface SyncServiceWorkerGlobalScope {
    clients: { claim(): Promise<void>; };
    skipWaiting(): Promise<void>;
    addEventListener(type: "install", listener: (event: { waitUntil(p: Promise<unknown>): void; }) => void): void;
    addEventListener(type: "activate", listener: (event: { waitUntil(p: Promise<unknown>): void; }) => void): void;
    addEventListener(
        type: "fetch",
        listener: (event: { request: Request; respondWith(r: Promise<Response> | Response): void; }) => void,
    ): void;
}

declare const self: SyncServiceWorkerGlobalScope;

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS).catch(err => {
                logger.warn("Failed to cache some assets:", err);
                // Continue even if caching some assets fails
            });
        }),
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Delete old cache
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

self.addEventListener("fetch", event => {
    const req = event.request;

    // Do not cache API endpoints
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    // Cache handling for GET requests
    if (req.method === "GET") {
        const url = new URL(req.url);

        // Do not cache API responses
        if (url.pathname.startsWith("/api/")) {
            return;
        }

        const isImmutable = url.pathname.startsWith("/_app/immutable/");

        if (req.mode === "navigate" || !isImmutable) {
            // Network-first, fall back to cache when offline
            event.respondWith(
                fetch(req)
                    .then(response => {
                        return response;
                    })
                    .catch(async err => {
                        logger.warn("Fetch failed, trying cache:", err);
                        const cached = await caches.match(req);
                        if (cached) return cached;
                        if (req.mode === "navigate") {
                            const shell = await caches.match("/");
                            if (shell) return shell;
                        }
                        return new Response("Network error", { status: 503 });
                    }),
            );
        } else {
            // Cache-first: the URL already encodes the content hash
            event.respondWith(
                caches.match(req).then(res => {
                    if (res) {
                        return res;
                    }

                    return fetch(req).then(response => {
                        // Cache only if response is normal
                        if (response.status === 200) {
                            const copy = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(req, copy).catch(err => {
                                    logger.warn("Failed to cache response:", err);
                                });
                            });
                        }
                        return response;
                    }).catch(err => {
                        logger.warn("Fetch failed, trying cache:", err);
                        return new Response("Network error", { status: 503 });
                    });
                }),
            );
        }
        return;
    }
});
