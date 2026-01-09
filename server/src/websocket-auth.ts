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

    // [Test Mode] Allow alg:none tokens (emulator/mock)
    // We try to parse as alg:none first
    try {
        const [header] = token.split(".");
        const headerJson = JSON.parse(Buffer.from(header, "base64").toString());
        if (headerJson.alg === "none") {
            // SECURITY: Only allow alg:none tokens in explicit test environments
            // This prevents attackers from forging tokens in production
            const isTestEnv = process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_ACCESS === "true";
            if (!isTestEnv) {
                console.warn("[Auth] Security Warning: alg:none token rejected in non-test environment");
                throw new Error("alg:none tokens are not allowed in this environment");
            }

            console.log("[Auth] Detected alg:none token");
            // ... continue with logic
            const parts = token.split(".");

            if (parts.length < 2) throw new Error("Invalid token format");
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
            // Mock decoded token structure
            const decoded: admin.auth.DecodedIdToken = {
                ...payload,
                uid: payload.user_id || payload.sub || "test-user",
                aud: payload.aud || "test-project",
                exp: payload.exp || Math.floor(now / 1000) + 3600,
                iat: payload.iat || Math.floor(now / 1000),
                iss: payload.iss || "https://securetoken.google.com/test-project",
                sub: payload.sub || payload.user_id || "test-user",
                auth_time: payload.auth_time || Math.floor(now / 1000),
                firebase: payload.firebase || { identities: {}, sign_in_provider: "custom" },
            };
            console.log("[Auth] Test mode: allowing alg:none token", decoded.uid);
            const expKey = Math.min(decoded.exp * 1000, now + CACHE_TTL_MS);
            tokenCache.set(token, { decoded, exp: expKey });
            return decoded;
        }
    } catch (e) {
        console.warn("[Auth] Test mode: failed to parse alg:none token", e);
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const exp = Math.min(decoded.exp ? decoded.exp * 1000 : now + CACHE_TTL_MS, now + CACHE_TTL_MS);
    tokenCache.set(token, { decoded, exp });
    return decoded;
}
