/**
 * Helper file to make log-service.js testable.
 * This file does not start the server directly but exports the Express middleware.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import jwt from "jsonwebtoken";
import {
    rotateClientLogs,
    rotateTelemetryLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshTelemetryLogStream,
    refreshServerLogStream,
} from "../utils/logger.js";

// Firebase initialization (minimal configuration for testing)
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";
    process.env.GCLOUD_PROJECT = "test-project";
}

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "test-project",
    });
}

const db = admin.firestore();
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    db.settings({
        host: "localhost:58080",
        ssl: false,
    });
}

const userContainersCollection = db.collection("userContainers");
const containerUsersCollection = db.collection("containerUsers");

function getSafeOrigins(): string[] {
    const defaultOrigins = ["http://localhost:7070"];

    if (!process.env.CORS_ORIGIN) {
        return defaultOrigins;
    }

    try {
        const origins = process.env.CORS_ORIGIN.split(",").map(origin => origin.trim());
        const safeOrigins = origins.filter(origin => {
            try {
                new URL(origin);
                if (origin.includes("pathToRegexpError") || origin.includes("git.new")) {
                    console.warn(`Filtering out invalid origin: ${origin}`);
                    return false;
                }
                return true;
            } catch (e) {
                console.warn(`Invalid origin URL format: ${origin}`);
                return false;
            }
        });

        if (safeOrigins.length === 0) {
            return defaultOrigins;
        }

        return safeOrigins;
    } catch (error: any) {
        console.error(`Error parsing CORS_ORIGIN: ${error.message}, using defaults`);
        return defaultOrigins;
    }
}

const app = express();
app.use(cors({
    origin: getSafeOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/api/save-container", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const userDocRef = userContainersCollection.doc(userId);
        const docSnapshot = await userDocRef.get();

        if (docSnapshot.exists) {
            await userDocRef.update({
                defaultContainerId: containerId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            res.status(200).json({
                success: true,
                operation: "updated",
                containerId: containerId,
            });
        } else {
            await userDocRef.set({
                userId,
                defaultContainerId: containerId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            res.status(200).json({
                success: true,
                operation: "created",
                containerId: containerId,
            });
        }
    } catch (error: any) {
        if (error.message === "Invalid token") {
            res.status(401).json({ error: "Authentication failed", details: error.message });
        } else {
            console.error("Error saving container ID:", error);
            res.status(500).json({ error: "Failed to save container ID", details: error.message });
        }
    }
});

app.post("/api/get-container-users", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        const containerDoc = await containerUsersCollection.doc(containerId).get();

        if (!containerDoc.exists) {
            return res.status(404).json({ error: "Container not found" });
        }

        res.status(200).json({
            users: containerDoc.data()?.accessibleUserIds || [],
        });
    } catch (error) {
        console.error("Error getting container users:", error);
        res.status(500).json({ error: "Failed to get container users" });
    }
});

app.post("/api/list-users", async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "ID token required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        const result = await admin.auth().listUsers();
        const users = result.users.map(u => ({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
        }));

        res.status(200).json({ users });
    } catch (error) {
        console.error("Error listing users:", error);
        res.status(500).json({ error: "Failed to list users" });
    }
});

app.get("/debug/token-info", async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }

        const decoded = jwt.decode(token as string, { complete: true });

        if (!decoded) {
            return res.status(400).json({ error: "Invalid JWT" });
        }

        const payload = decoded.payload as jwt.JwtPayload;

        return res.json({
            header: decoded.header,
            payload: payload,
            expiresIn: payload.exp ? new Date(payload.exp * 1000).toISOString() : "N/A",
            issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : "N/A",
        });
    } catch (error) {
        console.error("Token debug error:", error);
        res.status(500).json({ error: "Failed to get token info" });
    }
});

app.post("/api/rotate-logs", async (req, res) => {
    try {
        const clientRotated = await rotateClientLogs(2);
        const telemetryRotated = await rotateTelemetryLogs(2);
        const serverRotated = await rotateServerLogs(2);

        if (clientRotated) refreshClientLogStream();
        if (telemetryRotated) refreshTelemetryLogStream();
        if (serverRotated) refreshServerLogStream();

        res.status(200).json({
            success: true,
            clientRotated,
            telemetryRotated,
            serverRotated,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export { app };
