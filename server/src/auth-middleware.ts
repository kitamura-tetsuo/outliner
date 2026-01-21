import { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    let token = req.headers.authorization?.replace("Bearer ", "");

    // Fallback to query param for GET requests if convenient,
    // but strictly speaking, headers are better.
    // We'll support 'token' query param for consistency with WebSocket if needed,
    // but for REST APIs, headers are standard.
    if (!token && typeof req.query.token === "string") {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
        const decoded = await verifyIdTokenCached(token);
        (req as any).user = decoded;
        next();
    } catch (error) {
        logger.warn({ event: "auth_failed", error: (error as Error).message, ip: req.ip });
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}
