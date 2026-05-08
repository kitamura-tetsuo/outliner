import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { logger } from "./logger.js";
import { requireAuth } from "./auth-middleware.js";

const router = express.Router();

export interface ApiKeyDocument {
    userId: string;
    keyHash: string;
    description: string;
    createdAt: number;
    lastUsedAt?: number;
}

export function hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
}

router.post("/api-keys", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { uid } = (req as any).user;
        const { description } = req.body;

        const rawKey = crypto.randomBytes(32).toString("hex");
        const keyHash = hashApiKey(rawKey);

        const db = admin.firestore();
        const docRef = db.collection("apiKeys").doc();

        const apiKeyData: ApiKeyDocument = {
            userId: uid,
            keyHash,
            description: description || "API Key",
            createdAt: Date.now(),
        };

        await docRef.set(apiKeyData);

        logger.info({ event: "api_key_created", userId: uid, keyId: docRef.id });

        res.status(201).json({
            id: docRef.id,
            apiKey: rawKey,
            description: apiKeyData.description,
            createdAt: apiKeyData.createdAt,
        });
    } catch (error: any) {
        logger.error({ event: "api_key_create_error", error: error.message });
        res.status(500).json({ error: "Failed to create API key" });
    }
});

router.get("/api-keys", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { uid } = (req as any).user;
        const db = admin.firestore();
        const snapshot = await db.collection("apiKeys").where("userId", "==", uid).get();

        const keys = snapshot.docs.map((doc) => ({
            id: doc.id,
            description: doc.data().description,
            createdAt: doc.data().createdAt,
            lastUsedAt: doc.data().lastUsedAt,
        }));

        res.status(200).json(keys);
    } catch (error: any) {
        logger.error({ event: "api_key_list_error", error: error.message });
        res.status(500).json({ error: "Failed to list API keys" });
    }
});

router.delete("/api-keys/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { uid } = (req as any).user;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const db = admin.firestore();
        const docRef = db.collection("apiKeys").doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: "API key not found" });
            return;
        }

        if (doc.data()?.userId !== uid) {
            res.status(403).json({ error: "Access denied" });
            return;
        }

        await docRef.delete();
        logger.info({ event: "api_key_deleted", userId: uid, keyId: id });

        res.status(200).json({ success: true });
    } catch (error: any) {
        logger.error({ event: "api_key_delete_error", error: error.message });
        res.status(500).json({ error: "Failed to delete API key" });
    }
});

// Middleware for validating API Key
export async function validateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        let apiKeyHeader = req.headers["x-api-key"];
        let apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

        if (!apiKey) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
                apiKey = authHeader.substring(7);
            }
        }

        if (!apiKey) {
            res.status(401).json({ error: "Unauthorized: Missing API Key" });
            return;
        }

        const keyHash = hashApiKey(apiKey);
        const db = admin.firestore();
        const snapshot = await db.collection("apiKeys").where("keyHash", "==", keyHash).limit(1).get();

        if (snapshot.empty) {
            res.status(401).json({ error: "Unauthorized: Invalid API Key" });
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data() as ApiKeyDocument;

        // Optional: Update lastUsedAt asynchronously
        doc.ref.update({ lastUsedAt: Date.now() }).catch((err) => {
            logger.error({ event: "api_key_update_lastused_error", error: err.message });
        });

        // Set user context
        (req as any).user = { uid: data.userId };
        next();
    } catch (error: any) {
        logger.error({ event: "api_key_validation_error", error: error.message });
        res.status(500).json({ error: "Internal Server Error during API Key validation" });
    }
}

export { router as apiKeysRouter };
