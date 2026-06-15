import "dotenv/config";
import cors from "cors";
import express from "express";
import * as adminApp from "firebase-admin/app";
import * as adminFirestore from "firebase-admin/firestore";
import * as adminAuth from "firebase-admin/auth";
import jwt from "jsonwebtoken";

// Firebase initialization (minimal configuration for testing)
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIREBASE_PROJECT_ID = "test-project";
    process.env.GCLOUD_PROJECT = "test-project";
}

if (!adminApp.getApps().length) {
    adminApp.initializeApp({
        projectId: "test-project",
    });
}

const db = adminFirestore.getFirestore();
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    db.settings({
        host: "localhost:58080",
        ssl: false,
    });
}

// Log service app matching structure
const app = express();
app.use(express.json());
app.use(cors());

// Middleware definitions inside app to make testing self-contained
app.post("/api/save-container-id", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!idToken || !containerId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const currentAdmin = getAdmin();
        const decodedToken = await currentAdmin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const firestore = typeof currentAdmin.firestore === "function"
            ? currentAdmin.firestore()
            : currentAdmin.firestore;
        const containerUsersCollection = firestore.collection("containerUsers");

        const userDocRef = containerUsersCollection.doc(userId);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
            await userDocRef.update({
                defaultContainerId: containerId,
                updatedAt: currentAdmin.firestore.FieldValue.serverTimestamp(),
            });

            return res.status(200).json({
                success: true,
                operation: "updated",
                containerId: containerId,
            });
        } else {
            await userDocRef.set({
                userId,
                defaultContainerId: containerId,
                createdAt: currentAdmin.firestore.FieldValue.serverTimestamp(),
                updatedAt: currentAdmin.firestore.FieldValue.serverTimestamp(),
            });

            return res.status(200).json({
                success: true,
                operation: "created",
                containerId: containerId,
            });
        }
    } catch (error: any) {
        if (error.message === "Invalid token") {
            return res.status(401).json({ error: "Authentication failed", details: error.message });
        } else {
            console.error("Error saving container ID:", error);
            return res.status(500).json({ error: "Failed to save container ID", details: error.message });
        }
    }
});

app.get("/health", (req, res) => {
    return res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

let adminInstance = {
    auth: () => adminAuth.getAuth(),
    firestore: Object.assign(() => adminFirestore.getFirestore(), { FieldValue: adminFirestore.FieldValue })
};
export const setAdmin = (mock: any) => {
    adminInstance = mock;
};
export const getAdmin = () => adminInstance;

app.post("/api/get-container-users", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        const currentAdmin = getAdmin();
        const decodedToken = await currentAdmin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        // Use currentAdmin to allow mocking
        const firestore = typeof currentAdmin.firestore === "function"
            ? currentAdmin.firestore()
            : currentAdmin.firestore;
        const containerUsersCollection = firestore.collection("containerUsers");
        const containerDoc = await containerUsersCollection.doc(containerId).get();

        if (!containerDoc.exists) {
            return res.status(404).json({ error: "Container not found" });
        }

        return res.status(200).json({
            users: containerDoc.data()?.accessibleUserIds || [],
        });
    } catch (error) {
        console.error("Error getting container users:", error);
        return res.status(500).json({ error: "Failed to get container users" });
    }
});

app.post("/api/list-users", async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "ID token required" });
        }

        const currentAdmin = getAdmin();
        const decodedToken = await currentAdmin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        const result = await currentAdmin.auth().listUsers();
        const users = result.users.map(u => ({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
        }));

        return res.status(200).json({ users });
    } catch (error) {
        console.error("Error listing users:", error);
        return res.status(500).json({ error: "Failed to list users" });
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
        return res.status(500).json({ error: "Failed to get token info" });
    }
});

import LogManager from "../src/utils/log-manager.js";

app.post("/api/rotate-logs", async (req, res) => {
    try {
        const clientRotated = await LogManager.rotateClientLogs(2);
        const telemetryRotated = await LogManager.rotateTelemetryLogs(2);
        const serverRotated = await LogManager.rotateServerLogs(2);

        if (clientRotated) LogManager.refreshClientLogStream();
        if (telemetryRotated) LogManager.refreshTelemetryLogStream();
        if (serverRotated) LogManager.refreshServerLogStream();

        return res.status(200).json({
            success: true,
            clientRotated,
            telemetryRotated,
            serverRotated,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

const admin = { apps: adminApp.getApps() };
export { admin, app };
