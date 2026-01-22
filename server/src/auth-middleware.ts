import { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
        res.status(401).json({ error: "Unauthorized: Missing token" });
        return;
    }

    try {
        const decoded = await verifyIdTokenCached(token);
        (req as any).user = decoded;
        next();
    } catch (error) {
        logger.warn({ event: "auth_failed", error: (error as Error).message, ip: req.ip });
        res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}
