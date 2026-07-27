/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { getLogger } from "./lib/logger";
const logger = getLogger("ServiceWorker");

import { version } from "$service-worker";

const CACHE_NAME = `outliner-cache-${version}`;
const ASSETS = [
    "/",
    "/favicon.png",
];

// Type definitions to avoid no-undef errors
type ServiceWorkerGlobalScope = typeof globalThis & {
    skipWaiting(): Promise<void>;
};

// Import idb in Service Worker environment
declare const self: ServiceWorkerGlobalScope;

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

    // Cache handling for GET requests
    if (req.method === "GET") {
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
                    return caches.match(req) || new Response("Network error", { status: 503 });
                });
            }),
        );
        return;
    }
});
