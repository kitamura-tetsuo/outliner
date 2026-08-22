import crypto from "crypto";
import { logger } from "../logger.js";
import { secretManager } from "../secret-manager.js";

// Read-only scope is intentionally the only project-data scope. `offline_access`
// is the protocol-level signal a client uses to request a refresh token; we
// always issue one on the authorization_code grant regardless, but accept the
// scope value so standards-compliant clients can request it explicitly.
export const OAUTH_SUPPORTED_SCOPES = ["outliner.read", "offline_access"] as const;
export type OAuthScope = (typeof OAUTH_SUPPORTED_SCOPES)[number];
export const OAUTH_DEFAULT_SCOPE: OAuthScope = "outliner.read";

let devSigningSecret: string | undefined;

/**
 * Signing secret for Outliner-issued OAuth access tokens (JWT, HS256).
 * SECURITY: In production this must come from an explicit secret; we never
 * fall back to a guessable default. In dev/test we generate an ephemeral
 * per-process secret so tokens simply stop validating across restarts.
 */
export function getOAuthSigningSecret(): string {
    const configured = secretManager.getSecret("OAUTH_ACCESS_TOKEN_SECRET") || process.env.OAUTH_ACCESS_TOKEN_SECRET;
    if (configured) return configured;

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "SECURITY CRITICAL: OAUTH_ACCESS_TOKEN_SECRET is not configured in PRODUCTION. "
                + "The OAuth/OIDC bridge cannot issue or verify access tokens without an explicit signing secret.",
        );
    }

    if (!devSigningSecret) {
        devSigningSecret = crypto.randomBytes(32).toString("hex");
        logger.warn(
            "[OAuth] OAUTH_ACCESS_TOKEN_SECRET is not set. Generated an ephemeral signing secret for this process; "
                + "issued tokens will stop validating after a restart.",
        );
    }
    return devSigningSecret;
}

/** Test-only: forget the generated dev secret and re-read env on next call. */
export function resetOAuthSigningSecretForTests(): void {
    devSigningSecret = undefined;
}

/**
 * Logs (but does not throw for) a production misconfiguration where the OAuth
 * bridge is reachable but cannot safely issue tokens yet. We deliberately do
 * not refuse to start the whole Yjs/Hocuspocus server over this: an
 * unconfigured secret fails closed per-request (500 on /oauth/token) rather
 * than disabling authentication, unlike ALLOW_TEST_ACCESS.
 */
export function warnIfOAuthMisconfiguredInProduction(): void {
    if (process.env.NODE_ENV !== "production") return;
    const configured = secretManager.getSecret("OAUTH_ACCESS_TOKEN_SECRET") || process.env.OAUTH_ACCESS_TOKEN_SECRET;
    if (!configured) {
        logger.error(
            "[OAuth] OAUTH_ACCESS_TOKEN_SECRET is not configured. The /oauth/* endpoints are mounted but will "
                + "reject every token request until this is set.",
        );
    }
    if (!process.env.OAUTH_ISSUER) {
        logger.error(
            "[OAuth] OAUTH_ISSUER is not configured. The /oauth/* endpoints are mounted but will reject every "
                + "request until this is set to the externally reachable HTTPS origin.",
        );
    }
}

function positiveIntFromEnv(name: string, fallback: number): number {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function getOAuthAccessTokenTtlSeconds(): number {
    return positiveIntFromEnv("OAUTH_ACCESS_TOKEN_TTL_SECONDS", 3600); // 1 hour
}

export function getOAuthRefreshTokenTtlSeconds(): number {
    return positiveIntFromEnv("OAUTH_REFRESH_TOKEN_TTL_SECONDS", 60 * 60 * 24 * 30); // 30 days
}

export function getOAuthAuthorizationCodeTtlSeconds(): number {
    return positiveIntFromEnv("OAUTH_AUTH_CODE_TTL_SECONDS", 60); // single-use, short-lived
}

export function getOAuthPendingRequestTtlSeconds(): number {
    return positiveIntFromEnv("OAUTH_PENDING_REQUEST_TTL_SECONDS", 600); // time allowed to complete Google sign-in
}

/**
 * The issuer identity used for `iss`/`aud` claims and discovery metadata.
 * Deployments behind the Cloudflare Tunnel / Traefik path must set
 * OAUTH_ISSUER explicitly to the externally reachable HTTPS origin: an
 * external ChatGPT/MCP client cannot reach a "http://localhost:PORT"
 * fallback, so in production we fail closed instead of silently publishing
 * an unusable issuer.
 */
export function getOAuthIssuer(): string {
    const configured = process.env.OAUTH_ISSUER;
    if (configured) return configured.replace(/\/+$/, "");

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "SECURITY CRITICAL: OAUTH_ISSUER is not configured in PRODUCTION. The OAuth/OIDC bridge cannot "
                + "publish a usable issuer/discovery metadata without an explicit externally reachable origin.",
        );
    }

    const port = process.env.PORT || "7093";
    return `http://localhost:${port}`;
}
