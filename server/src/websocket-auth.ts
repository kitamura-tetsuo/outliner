import { serverLogger as logger } from "./utils/log-manager.js";

import { getApps, initializeApp } from "firebase-admin/app";
import { DecodedIdToken, getAuth } from "firebase-admin/auth";
import type { IncomingMessage } from "http";
import { LRUCache } from "lru-cache";
import { getServiceAccount } from "./firebase-init.js";

if (!getApps().length) {
    const serviceAccount = getServiceAccount();
    const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
    if (projectId) {
        logger.debug(`[Auth] Initializing Firebase Admin with projectId=${projectId}`);
        initializeApp({ projectId });
    } else {
        logger.warn("[Auth] No project ID found, skipping auto-initialization");
    }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

const tokenCache = new LRUCache<string, DecodedIdToken>({
    max: CACHE_MAX_ENTRIES,
    ttl: CACHE_TTL_MS,
});

export function clearTokenCache() {
    tokenCache.clear();
}

// exported for tests
export function getTokenCacheSize() {
    return tokenCache.size;
}

export async function verifyIdTokenCached(token: string): Promise<DecodedIdToken> {
    const cached = tokenCache.get(token);
    if (cached) {
        return cached;
    }

    const now = Date.now();

    // [Test Mode] Allow alg:none tokens (emulator/mock)
    // We try to parse as alg:none first
    try {
        const [header] = token.split(".");
        const headerJson = JSON.parse(Buffer.from(header, "base64").toString());
        if (headerJson.alg === "none") {
            // SECURITY: Only allow alg:none tokens in explicit test environments
            // This prevents attackers from forging tokens in production
            const isTestEnv = process.env.ALLOW_TEST_ACCESS === "true";
            if (!isTestEnv) {
                logger.warn("[Auth] Security Warning: alg:none token rejected in non-test environment");
                throw new Error("alg:none tokens are not allowed in this environment");
            }

            logger.debug("[Auth] Detected alg:none token");
            // ... continue with logic
            const parts = token.split(".");

            if (parts.length < 2) throw new Error("Invalid token format");
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
            // Mock decoded token structure
            const decoded: DecodedIdToken = {
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
            logger.debug({ uid: decoded.uid }, "[Auth] Test mode: allowing alg:none token");
            const ttlMs = Math.max(0, Math.min(decoded.exp * 1000 - now, CACHE_TTL_MS));
            if (ttlMs > 0) {
                tokenCache.set(token, decoded, { ttl: ttlMs });
            }
            return decoded;
        }
    } catch (e: unknown) {
        if (e instanceof Error && e.message && e.message.includes("alg:none tokens are not allowed")) {
            throw e;
        }
        logger.warn({ error: e }, "[Auth] Test mode: failed to parse alg:none token");
    }

    try {
        const decoded = await getAuth().verifyIdToken(token);
        logger.debug(`[Auth] Verified token for uid=${decoded.uid}`);
        let ttlMs = CACHE_TTL_MS;
        if (decoded.exp) {
            ttlMs = Math.max(0, Math.min(decoded.exp * 1000 - now, CACHE_TTL_MS));
        }
        if (ttlMs > 0) {
            tokenCache.set(token, decoded, { ttl: ttlMs });
        }
        return decoded;
    } catch (e: unknown) {
        // Debug: Decode token to see why it failed
        const errorCode = e && typeof e === "object" && e !== null ? (("code" in e ? (e as Record<string, unknown>).code : (e as Record<string, Record<string, unknown>>)?.errorInfo?.code)) : undefined;
        const isExpired = errorCode === "auth/id-token-expired"
            || (e instanceof Error && e.message?.includes("expired"));

        if (isExpired) {
            logger.warn(`[Auth] Token expired (normal during reconnect)`);
            throw Object.assign(new Error("auth/id-token-expired"), { code: "auth/id-token-expired" });
        }

        try {
            const parts = token.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
                const nowSec = Math.floor(Date.now() / 1000);
                logger.error(
                    { error: e },
                    `[Auth] Verification failed. Token debug: exp=${payload.exp}, iat=${payload.iat}, now=${nowSec}, diff=${
                        payload.exp - nowSec
                    }, uid=${payload.uid || payload.user_id}`,
                );
            }
        } catch (parseErr) {
            logger.error({ error: e }, "[Auth] Failed to parse failed token for debug");
        }
        logger.error({ error: e }, `[Auth] Token verification failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
    }
}
