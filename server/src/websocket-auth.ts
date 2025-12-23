import admin from "firebase-admin";
import type { IncomingMessage } from "http";

if (!admin.apps.length) {
    if (process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    } else {
        admin.initializeApp();
    }
}

interface CacheEntry {
    decoded: admin.auth.DecodedIdToken;
    exp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, CacheEntry>();

export function clearTokenCache() {
    tokenCache.clear();
}

// exported for tests
export function getTokenCacheSize() {
    return tokenCache.size;
}

function pruneExpiredTokens(now: number) {
    for (const [t, entry] of tokenCache) {
        if (entry.exp <= now) {
            tokenCache.delete(t);
        }
    }
}

export function extractAuthToken(req: IncomingMessage): string | undefined {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const token = url.searchParams.get("auth");
        console.log(`[Auth] req.url=${req.url}, token=${token ? "FOUND" : "MISSING"}`);
        return token || undefined;
    } catch {
        console.error("[Auth] URL parse error");
        return undefined;
    }
}

export async function verifyIdTokenCached(token: string): Promise<admin.auth.DecodedIdToken> {
    const now = Date.now();
    pruneExpiredTokens(now);
    const cached = tokenCache.get(token);
    if (cached && cached.exp > now) {
        return cached.decoded;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const exp = Math.min(decoded.exp ? decoded.exp * 1000 : now + CACHE_TTL_MS, now + CACHE_TTL_MS);
    tokenCache.set(token, { decoded, exp });
    return decoded;
}
