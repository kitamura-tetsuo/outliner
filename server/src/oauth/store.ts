import crypto from "crypto";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { LRUCache } from "lru-cache";
import {
    getOAuthAuthorizationCodeTtlSeconds,
    getOAuthPendingRequestTtlSeconds,
    getOAuthRefreshTokenTtlSeconds,
} from "./config.js";
import type { IssuedAuthorizationCode, PendingAuthorizationRequest, RefreshTokenRecord } from "./types.js";

export function generateOpaqueToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

// Pending authorization requests: created when GET /oauth/authorize is opened;
// consumed exactly once when the browser posts back a verified Firebase ID
// token. In-memory is sufficient (and avoids persisting anything about a
// login attempt that never completes) since this is a single-server,
// on-premises deployment and the TTL is short. The ttl option is re-read on
// every set() (not fixed at cache construction) so config changes, and
// tests overriding OAUTH_PENDING_REQUEST_TTL_SECONDS/OAUTH_AUTH_CODE_TTL_SECONDS,
// take effect immediately.
const pendingRequests = new LRUCache<string, PendingAuthorizationRequest>({
    max: 10_000,
    ttl: getOAuthPendingRequestTtlSeconds() * 1000,
});

// Issued authorization codes: single-use, deleted immediately on redemption
// (in addition to the TTL) so a replayed code is rejected even within its
// validity window.
const issuedCodes = new LRUCache<string, IssuedAuthorizationCode>({
    max: 10_000,
    ttl: getOAuthAuthorizationCodeTtlSeconds() * 1000,
});

export function createPendingAuthorizationRequest(
    input: Omit<PendingAuthorizationRequest, "id" | "createdAt">,
): PendingAuthorizationRequest {
    const id = generateOpaqueToken();
    const request: PendingAuthorizationRequest = { ...input, id, createdAt: Date.now() };
    pendingRequests.set(id, request, { ttl: getOAuthPendingRequestTtlSeconds() * 1000 });
    return request;
}

export function consumePendingAuthorizationRequest(id: string): PendingAuthorizationRequest | undefined {
    const request = pendingRequests.get(id);
    if (request) pendingRequests.delete(id);
    return request;
}

export function issueAuthorizationCode(input: Omit<IssuedAuthorizationCode, "createdAt">): string {
    const code = generateOpaqueToken();
    issuedCodes.set(code, { ...input, createdAt: Date.now() }, { ttl: getOAuthAuthorizationCodeTtlSeconds() * 1000 });
    return code;
}

export function consumeAuthorizationCode(code: string): IssuedAuthorizationCode | undefined {
    const record = issuedCodes.get(code);
    if (record) issuedCodes.delete(code);
    return record;
}

/** Test-only: reset the in-memory pending-request/authorization-code stores. */
export function clearOAuthInMemoryStoresForTests(): void {
    pendingRequests.clear();
    issuedCodes.clear();
}

export interface RefreshTokenStore {
    issue(input: { uid: string; clientId: string; scope: string; }): Promise<string>;
    /**
     * Atomically validates and revokes a refresh token in one transaction,
     * returning the pre-revocation record iff it was valid (not already
     * revoked/expired). Doing the check-and-revoke as a single transaction
     * (rather than a separate read then write) prevents two concurrent
     * refresh/revoke requests from both reading "not yet revoked" and both
     * successfully rotating the same token.
     */
    consumeAndRevoke(token: string): Promise<(RefreshTokenRecord & { id: string; }) | undefined>;
}

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is
 * persisted (mirrors the API key pattern in api-keys-api.ts). Each use
 * rotates the token: the caller consumes it via consumeAndRevoke() and
 * issue()s a fresh one, so a stolen-and-replayed refresh token is
 * detectable (the legitimate client's next refresh will fail).
 */
export function createFirestoreRefreshTokenStore(firestoreInstance?: Firestore): RefreshTokenStore {
    const db = () => firestoreInstance || getFirestore();
    const collection = () => db().collection("oauthRefreshTokens");

    return {
        async issue({ uid, clientId, scope }) {
            const token = generateOpaqueToken();
            const now = Date.now();
            const record: RefreshTokenRecord = {
                tokenHash: hashToken(token),
                uid,
                clientId,
                scope,
                createdAt: now,
                expiresAt: now + getOAuthRefreshTokenTtlSeconds() * 1000,
                revoked: false,
            };
            await collection().add(record);
            return token;
        },

        async consumeAndRevoke(token) {
            const tokenHash = hashToken(token);
            return db().runTransaction(async (tx) => {
                const snapshot = await tx.get(collection().where("tokenHash", "==", tokenHash).limit(1));
                if (snapshot.empty) return undefined;

                const doc = snapshot.docs[0];
                const data = doc.data() as RefreshTokenRecord;
                if (data.revoked || data.expiresAt < Date.now()) return undefined;

                tx.update(collection().doc(doc.id), { revoked: true });
                return { ...data, id: doc.id };
            });
        },
    };
}
