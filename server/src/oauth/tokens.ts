import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getOAuthAccessTokenTtlSeconds, getOAuthIssuer, getOAuthSigningSecret } from "./config.js";
import type { VerifiedOAuthAccessToken } from "./types.js";

/**
 * Outliner-minted access tokens are self-contained JWTs (HS256) tied to the
 * Firebase uid that completed the Google sign-in step. They are never raw
 * Firebase ID tokens and never contain Firebase credentials.
 */
export function signAccessToken(params: {
    uid: string;
    scope: string;
    clientId: string;
    ttlSeconds?: number;
}): { token: string; expiresIn: number; } {
    const expiresIn = params.ttlSeconds ?? getOAuthAccessTokenTtlSeconds();
    const issuer = getOAuthIssuer();
    const token = jwt.sign(
        {
            scope: params.scope,
            client_id: params.clientId,
        },
        getOAuthSigningSecret(),
        {
            subject: params.uid,
            issuer,
            audience: issuer,
            expiresIn,
            jwtid: crypto.randomUUID(),
        },
    );
    return { token, expiresIn };
}

export function verifyAccessToken(token: string): VerifiedOAuthAccessToken {
    const issuer = getOAuthIssuer();
    const decoded = jwt.verify(token, getOAuthSigningSecret(), {
        issuer,
        audience: issuer,
        algorithms: ["HS256"],
    }) as jwt.JwtPayload;

    if (!decoded.sub || typeof decoded.scope !== "string" || typeof decoded.client_id !== "string") {
        throw new Error("invalid_token_claims");
    }

    return { uid: decoded.sub, scope: decoded.scope, clientId: decoded.client_id };
}
