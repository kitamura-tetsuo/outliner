import crypto from "crypto";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { logger } from "../logger.js";
import type { OAuthClient } from "./types.js";

/**
 * Redirect URIs must be HTTPS, or plain HTTP pointed at a loopback address
 * (native/dev clients performing a local-server PKCE callback). This mirrors
 * the "do not accept arbitrary callback targets" requirement: we never
 * accept a redirect_uri that was not registered ahead of time for the
 * matching client_id, and we never accept non-HTTPS remote targets at all.
 */
export function isValidRedirectUri(uri: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(uri);
    } catch {
        return false;
    }
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
        return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }
    return false;
}

function parseStaticClients(): OAuthClient[] {
    const raw = process.env.OAUTH_STATIC_CLIENTS;
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const clients: OAuthClient[] = [];
        for (const entry of parsed) {
            if (typeof entry?.client_id !== "string" || !Array.isArray(entry?.redirect_uris)) continue;
            const redirectUris = entry.redirect_uris.filter((u: unknown): u is string => typeof u === "string");
            clients.push({
                clientId: entry.client_id,
                redirectUris,
                clientName: typeof entry.client_name === "string" ? entry.client_name : undefined,
                tokenEndpointAuthMethod: "none",
            });
        }
        return clients;
    } catch (e) {
        logger.error({
            event: "oauth_static_clients_parse_error",
            error: e instanceof Error ? e.message : String(e),
        }, "Failed to parse OAUTH_STATIC_CLIENTS");
        return [];
    }
}

export interface ClientStore {
    getClient(clientId: string): Promise<OAuthClient | undefined>;
    registerClient(input: { redirectUris: string[]; clientName?: string; }): Promise<OAuthClient>;
}

/**
 * Firestore-backed dynamic client registry (RFC 7591), seeded with any
 * statically pre-configured clients from OAUTH_STATIC_CLIENTS. Clients are
 * public (PKCE-only, no client secret) since ChatGPT/MCP connectors cannot
 * safely hold a confidential secret.
 */
export function createFirestoreClientStore(firestoreInstance?: Firestore): ClientStore {
    const staticClients = new Map(parseStaticClients().map(c => [c.clientId, c]));
    const db = () => firestoreInstance || getFirestore();

    return {
        async getClient(clientId: string): Promise<OAuthClient | undefined> {
            const staticClient = staticClients.get(clientId);
            if (staticClient) return staticClient;

            const doc = await db().collection("oauthClients").doc(clientId).get();
            if (!doc.exists) return undefined;
            const data = doc.data() as { redirectUris?: string[]; clientName?: string; } | undefined;
            if (!data?.redirectUris || data.redirectUris.length === 0) return undefined;

            return {
                clientId,
                redirectUris: data.redirectUris,
                clientName: data.clientName,
                tokenEndpointAuthMethod: "none",
            };
        },

        async registerClient(input: { redirectUris: string[]; clientName?: string; }): Promise<OAuthClient> {
            const redirectUris = input.redirectUris;
            if (
                redirectUris.length === 0
                || !redirectUris.every(isValidRedirectUri)
            ) {
                throw new Error("invalid_redirect_uri");
            }

            const clientId = crypto.randomBytes(16).toString("hex");
            await db().collection("oauthClients").doc(clientId).set({
                redirectUris,
                clientName: input.clientName ?? null,
                createdAt: Date.now(),
            });

            logger.info({ event: "oauth_client_registered", clientId });

            return {
                clientId,
                redirectUris,
                clientName: input.clientName,
                tokenEndpointAuthMethod: "none",
            };
        },
    };
}
