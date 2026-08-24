import crypto from "crypto";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { verifyIdTokenCached as defaultVerifyIdTokenCached } from "../websocket-auth.js";
import { getAuthorizePageContentSecurityPolicy, renderAuthorizePage } from "./authorize-page.js";
import { type ClientStore, createFirestoreClientStore, isValidRedirectUri } from "./clients.js";
import {
    getOAuthIssuer,
    OAUTH_DEFAULT_SCOPE,
    OAUTH_SUPPORTED_SCOPES,
    warnIfOAuthMisconfiguredInProduction,
} from "./config.js";
import { buildAuthorizationServerMetadata } from "./discovery.js";
import {
    clearOAuthInMemoryStoresForTests,
    consumeAuthorizationCode,
    consumePendingAuthorizationRequest,
    createFirestoreRefreshTokenStore,
    createPendingAuthorizationRequest,
    issueAuthorizationCode,
    type RefreshTokenStore,
} from "./store.js";
import { signAccessToken } from "./tokens.js";

export { verifyAccessToken } from "./tokens.js";
export { clearOAuthInMemoryStoresForTests };

function pkceChallengeFromVerifier(verifier: string): string {
    return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const AuthorizeQuerySchema = z.object({
    response_type: z.literal("code"),
    client_id: z.string().min(1),
    redirect_uri: z.string().min(1),
    state: z.string().optional(),
    scope: z.string().optional(),
    code_challenge: z.string().min(43).max(128),
    code_challenge_method: z.literal("S256"),
});

const CallbackBodySchema = z.object({
    requestId: z.string().min(1),
    idToken: z.string().min(1),
});

const RegisterBodySchema = z.object({
    redirect_uris: z.array(z.string().min(1)).min(1),
    client_name: z.string().optional(),
});

const TokenBodySchema = z.discriminatedUnion("grant_type", [
    z.object({
        grant_type: z.literal("authorization_code"),
        code: z.string().min(1),
        redirect_uri: z.string().min(1),
        client_id: z.string().min(1),
        code_verifier: z.string().min(43).max(128),
    }),
    z.object({
        grant_type: z.literal("refresh_token"),
        refresh_token: z.string().min(1),
        client_id: z.string().min(1).optional(),
    }),
]);

const RevokeBodySchema = z.object({
    token: z.string().min(1),
});

export interface OAuthRouterOverrides {
    verifyIdTokenCached?: typeof defaultVerifyIdTokenCached;
    clientStore?: ClientStore;
    refreshTokenStore?: RefreshTokenStore;
}

/**
 * Standards-compliant OAuth 2.0 authorization-code + PKCE bridge that
 * authenticates the human user through the existing Firebase Auth Google
 * sign-in flow, and issues Outliner-minted access/refresh tokens bound to
 * the Firebase uid. See docs/client-features for the ftr-oauth-oidc-bridge
 * feature doc and GitHub issue #5032 for the full design rationale.
 */
export function createOAuthRouter(overrides: OAuthRouterOverrides = {}) {
    warnIfOAuthMisconfiguredInProduction();

    const verifyIdTokenCached = overrides.verifyIdTokenCached || defaultVerifyIdTokenCached;
    const clientStore = overrides.clientStore || createFirestoreClientStore();
    const refreshTokenStore = overrides.refreshTokenStore || createFirestoreRefreshTokenStore();

    const router = express.Router();

    router.get(
        ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"],
        (_req: Request, res: Response) => {
            try {
                res.json(buildAuthorizationServerMetadata(getOAuthIssuer()));
            } catch (e) {
                logger.error({ event: "oauth_discovery_error", error: e instanceof Error ? e.message : String(e) });
                res.status(500).json({ error: "server_error" });
            }
        },
    );

    // Dynamic Client Registration (RFC 7591). Clients are always "public"
    // (PKCE-only, no client secret) since ChatGPT/MCP connectors cannot hold
    // a confidential secret. Only the redirect URIs submitted here are ever
    // accepted for this client_id at /oauth/authorize.
    router.post("/oauth/register", async (req: Request, res: Response) => {
        const parsed = RegisterBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "invalid_client_metadata" });
            return;
        }
        try {
            const client = await clientStore.registerClient({
                redirectUris: parsed.data.redirect_uris,
                clientName: parsed.data.client_name,
            });
            res.status(201).json({
                client_id: client.clientId,
                redirect_uris: client.redirectUris,
                client_name: client.clientName,
                token_endpoint_auth_method: "none",
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
            });
        } catch (e) {
            logger.warn({ event: "oauth_register_rejected", error: e instanceof Error ? e.message : String(e) });
            res.status(400).json({ error: "invalid_redirect_uri" });
        }
    });

    router.get("/oauth/authorize", async (req: Request, res: Response) => {
        const parsed = AuthorizeQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({
                error: "invalid_request",
                error_description: "Missing or invalid authorization parameters (PKCE with S256 is required)",
            });
            return;
        }
        const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = parsed.data;

        let client;
        try {
            client = await clientStore.getClient(client_id);
        } catch (e) {
            logger.error({ event: "oauth_client_lookup_error", error: e instanceof Error ? e.message : String(e) });
            res.status(500).json({ error: "server_error" });
            return;
        }
        if (!client) {
            res.status(400).json({ error: "invalid_client" });
            return;
        }
        if (!isValidRedirectUri(redirect_uri) || !client.redirectUris.includes(redirect_uri)) {
            res.status(400).json({ error: "invalid_redirect_uri" });
            return;
        }

        const requestedScopes = (scope || OAUTH_DEFAULT_SCOPE).split(/\s+/).filter(Boolean);
        const grantedScopes = requestedScopes.filter(s => (OAUTH_SUPPORTED_SCOPES as readonly string[]).includes(s));
        if (grantedScopes.length === 0) grantedScopes.push(OAUTH_DEFAULT_SCOPE);

        const pending = createPendingAuthorizationRequest({
            clientId: client_id,
            redirectUri: redirect_uri,
            state,
            scope: grantedScopes.join(" "),
            codeChallenge: code_challenge,
            codeChallengeMethod: code_challenge_method,
        });

        // Overrides helmet()'s default `script-src 'self'` (applied globally
        // in server.ts) for this page only: it needs to load the Firebase
        // Auth SDK from gstatic and run its own inline sign-in script.
        const nonce = crypto.randomBytes(16).toString("base64");
        res.setHeader("Content-Security-Policy", getAuthorizePageContentSecurityPolicy(nonce));
        // helmet() also defaults COOP to `same-origin`, which severs the
        // Window reference used by Firebase Auth to complete its cross-origin
        // Google sign-in popup. Relax COOP only for this authorization page;
        // all other routes keep helmet's stricter default.
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
        res.status(200).set("Content-Type", "text/html; charset=utf-8").send(
            renderAuthorizePage({ requestId: pending.id, clientName: client.clientName, scope: pending.scope, nonce }),
        );
    });

    // Called by the authorize page's own client-side JS once Firebase Google
    // sign-in succeeds. The server independently verifies the Firebase ID
    // token — the client-supplied uid is never trusted — and rejects any
    // identity that was not authenticated via the Google provider.
    router.post("/oauth/authorize/callback", async (req: Request, res: Response) => {
        const parsed = CallbackBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "invalid_request" });
            return;
        }

        const pending = consumePendingAuthorizationRequest(parsed.data.requestId);
        if (!pending) {
            res.status(400).json({
                error: "invalid_request",
                error_description: "Authorization request expired or already used",
            });
            return;
        }

        let decoded;
        try {
            decoded = await verifyIdTokenCached(parsed.data.idToken);
        } catch {
            logger.warn({ event: "oauth_firebase_verification_failed" });
            res.status(401).json({
                error: "access_denied",
                error_description: "Firebase identity verification failed",
            });
            return;
        }

        const signInProvider = (decoded as { firebase?: { sign_in_provider?: string; }; }).firebase?.sign_in_provider;
        if (signInProvider !== "google.com") {
            logger.warn({ event: "oauth_non_google_provider_rejected", uid: decoded.uid, signInProvider });
            res.status(403).json({
                error: "access_denied",
                error_description: "Only Google-backed Outliner accounts can authorize ChatGPT/MCP access",
            });
            return;
        }

        const code = issueAuthorizationCode({
            clientId: pending.clientId,
            redirectUri: pending.redirectUri,
            uid: decoded.uid,
            scope: pending.scope,
            codeChallenge: pending.codeChallenge,
            codeChallengeMethod: pending.codeChallengeMethod,
        });

        const redirectUrl = new URL(pending.redirectUri);
        redirectUrl.searchParams.set("code", code);
        if (pending.state) redirectUrl.searchParams.set("state", pending.state);

        logger.info({ event: "oauth_authorization_code_issued", uid: decoded.uid, clientId: pending.clientId });
        res.status(200).json({ redirectTo: redirectUrl.toString() });
    });

    router.post(
        "/oauth/token",
        express.urlencoded({ extended: false }),
        async (req: Request, res: Response) => {
            const body = { ...req.body };
            const parsed = TokenBodySchema.safeParse(body);
            if (!parsed.success) {
                res.status(400).json({ error: "invalid_request" });
                return;
            }

            try {
                if (parsed.data.grant_type === "authorization_code") {
                    const { code, redirect_uri, client_id, code_verifier } = parsed.data;
                    const record = consumeAuthorizationCode(code);
                    if (!record) {
                        res.status(400).json({
                            error: "invalid_grant",
                            error_description: "Authorization code is invalid, expired, or already used",
                        });
                        return;
                    }
                    if (record.clientId !== client_id || record.redirectUri !== redirect_uri) {
                        res.status(400).json({
                            error: "invalid_grant",
                            error_description: "client_id/redirect_uri mismatch",
                        });
                        return;
                    }
                    if (pkceChallengeFromVerifier(code_verifier) !== record.codeChallenge) {
                        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
                        return;
                    }

                    const { token: accessToken, expiresIn } = signAccessToken({
                        uid: record.uid,
                        scope: record.scope,
                        clientId: record.clientId,
                    });
                    const refreshToken = await refreshTokenStore.issue({
                        uid: record.uid,
                        clientId: record.clientId,
                        scope: record.scope,
                    });

                    logger.info({
                        event: "oauth_token_issued",
                        uid: record.uid,
                        clientId: record.clientId,
                        grant: "authorization_code",
                    });
                    res.status(200).json({
                        access_token: accessToken,
                        token_type: "Bearer",
                        expires_in: expiresIn,
                        refresh_token: refreshToken,
                        scope: record.scope,
                    });
                    return;
                }

                // grant_type === "refresh_token". consumeAndRevoke() atomically
                // validates and revokes in one transaction, so two concurrent
                // requests replaying the same refresh token cannot both succeed.
                const { refresh_token, client_id } = parsed.data;
                const record = await refreshTokenStore.consumeAndRevoke(refresh_token);
                if (!record) {
                    res.status(400).json({
                        error: "invalid_grant",
                        error_description: "Refresh token is invalid, expired, or revoked",
                    });
                    return;
                }
                if (client_id && record.clientId !== client_id) {
                    // The token is already revoked at this point (see
                    // consumeAndRevoke above) even though we reject the
                    // request: a client_id mismatch on an otherwise-valid
                    // refresh token is suspicious enough that burning it
                    // (forcing full reauth) is the safer outcome.
                    res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
                    return;
                }

                const { token: accessToken, expiresIn } = signAccessToken({
                    uid: record.uid,
                    scope: record.scope,
                    clientId: record.clientId,
                });
                const newRefreshToken = await refreshTokenStore.issue({
                    uid: record.uid,
                    clientId: record.clientId,
                    scope: record.scope,
                });

                logger.info({
                    event: "oauth_token_issued",
                    uid: record.uid,
                    clientId: record.clientId,
                    grant: "refresh_token",
                });
                res.status(200).json({
                    access_token: accessToken,
                    token_type: "Bearer",
                    expires_in: expiresIn,
                    refresh_token: newRefreshToken,
                    scope: record.scope,
                });
            } catch (e) {
                // Covers a missing signing secret (production misconfiguration) and
                // any Firestore failure. Never leak internal error detail to the
                // client; log server-side only.
                logger.error({
                    event: "oauth_token_endpoint_error",
                    error: e instanceof Error ? e.message : String(e),
                });
                res.status(500).json({ error: "server_error" });
            }
        },
    );

    // RFC 7009 token revocation. Standards-compliant clients send this as
    // application/x-www-form-urlencoded (like /oauth/token), which the
    // server's global JSON-only body parser does not handle. Always answers
    // 200 regardless of whether the token was found/valid, so this endpoint
    // cannot be used to probe for live refresh tokens.
    router.post(
        "/oauth/revoke",
        express.urlencoded({ extended: false }),
        async (req: Request, res: Response) => {
            const parsed = RevokeBodySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "invalid_request" });
                return;
            }
            try {
                await refreshTokenStore.consumeAndRevoke(parsed.data.token);
            } catch (e) {
                logger.error({ event: "oauth_revoke_error", error: e instanceof Error ? e.message : String(e) });
            }
            res.status(200).json({});
        },
    );

    return router;
}
