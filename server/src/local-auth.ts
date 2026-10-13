import { createHash, randomBytes, timingSafeEqual } from "crypto";
import express from "express";

export const LOCAL_USER_ID = "local-user";
export const LOCAL_USER_NAME = "Local User";
export const LOCAL_SESSION_COOKIE = "outliner_local_session";
export const LOCAL_PASSWORD_ENV_VAR = "OUTLINER_LOCAL_PASSWORD";

export interface LocalUser {
    id: typeof LOCAL_USER_ID;
    name: typeof LOCAL_USER_NAME;
}

export const LOCAL_USER: LocalUser = { id: LOCAL_USER_ID, name: LOCAL_USER_NAME };

function localUser(): LocalUser {
    return { id: LOCAL_USER_ID, name: LOCAL_USER_NAME };
}

function passwordMatches(configured: string, supplied: string): boolean {
    // Compare the exact UTF-16 code-unit sequences: "utf8" encoding replaces
    // lone surrogates with U+FFFD, which would make a nonmatching password
    // hash identically to a configured password containing U+FFFD.
    // "utf16le" maps each code unit to two bytes losslessly.
    const a = createHash("sha256").update(Buffer.from(configured, "utf16le")).digest();
    const b = createHash("sha256").update(Buffer.from(supplied, "utf16le")).digest();
    return timingSafeEqual(a, b);
}

export function parseLocalSessionId(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() !== LOCAL_SESSION_COOKIE) continue;
        const value = part.slice(separator + 1).trim();
        return value ? value : undefined;
    }
    return undefined;
}

function issueSessionCookie(res: express.Response, sessionId: string): void {
    res.setHeader(
        "Set-Cookie",
        `${LOCAL_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict`,
    );
}

function clearSessionCookie(res: express.Response): void {
    res.setHeader(
        "Set-Cookie",
        `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
}

export interface LocalAuth {
    readonly router: express.Router;
    readonly user: LocalUser;
    resolveSessionUser(sessionId: string | undefined): LocalUser | undefined;
    resolveRequestUser(req: express.Request): LocalUser | undefined;
    revokeSession(sessionId: string | undefined): boolean;
}

export function createLocalAuth(configuredPassword: string): LocalAuth {
    if (typeof configuredPassword !== "string" || configuredPassword.length === 0) {
        throw new Error(
            `${LOCAL_PASSWORD_ENV_VAR} is not configured: local authentication refuses to start without a password`,
        );
    }
    const sessions = new Map<string, true>();

    function resolveSessionUser(sessionId: string | undefined): LocalUser | undefined {
        if (!sessionId || !sessions.has(sessionId)) return undefined;
        return localUser();
    }

    function resolveRequestUser(req: express.Request): LocalUser | undefined {
        const header = req.headers.cookie;
        return resolveSessionUser(
            Array.isArray(header) ? parseLocalSessionId(header.join("; ")) : parseLocalSessionId(header),
        );
    }

    function revokeSession(sessionId: string | undefined): boolean {
        if (!sessionId) return false;
        return sessions.delete(sessionId);
    }

    const router = express.Router();

    router.post("/local-auth/login", (req, res) => {
        const password: unknown = (req.body as Record<string, unknown> | undefined)?.password;
        if (typeof password !== "string") {
            res.status(400).json({ error: "A string password is required" });
            return;
        }
        if (!passwordMatches(configuredPassword, password)) {
            res.status(401).json({ error: "Invalid password" });
            return;
        }
        const sessionId = randomBytes(32).toString("base64url");
        sessions.set(sessionId, true);
        issueSessionCookie(res, sessionId);
        res.status(200).json({ user: localUser() });
    });

    router.get("/local-auth/session", (req, res) => {
        const user = resolveRequestUser(req);
        if (!user) {
            res.status(401).json({ error: "No active local session" });
            return;
        }
        res.status(200).json({ user });
    });

    router.post("/local-auth/logout", (req, res) => {
        const header = req.headers.cookie;
        revokeSession(
            Array.isArray(header) ? parseLocalSessionId(header.join("; ")) : parseLocalSessionId(header),
        );
        clearSessionCookie(res);
        res.status(204).end();
    });

    return { router, user: localUser(), resolveSessionUser, resolveRequestUser, revokeSession };
}

export function createLocalAuthFromEnv(env: NodeJS.ProcessEnv = process.env): LocalAuth {
    const configured = env[LOCAL_PASSWORD_ENV_VAR];
    if (typeof configured !== "string" || configured.length === 0) {
        throw new Error(
            `${LOCAL_PASSWORD_ENV_VAR} is not configured: local authentication refuses to start without a password`,
        );
    }
    return createLocalAuth(configured);
}
