import { HocuspocusProvider } from "@hocuspocus/provider";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";
import * as Y from "yjs";

// Polyfill global WebSocket for Hocuspocus with custom headers
class CustomWebSocket extends WebSocket {
    constructor(url, protocols) {
        super(url, protocols, {
            headers: {
                "Origin": "https://outliner-d57b0.web.app",
            },
        });
    }
}
global.WebSocket = CustomWebSocket;

// --- Configuration ---
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const SERVER_URL = "ws://127.0.0.1:1234";
const PROJECT_ID = "verification-project";
// Try container path first, then host path
const CONTAINER_PATH = "/usr/src/app/outliner-d57b0-firebase-adminsdk-fbsvc-a989b4a237.json";
const HOST_PATH = "/srv/docker/outliner-yjs-ws/outliner-d57b0-firebase-adminsdk-fbsvc-a989b4a237.json";
const SERVICE_ACCOUNT_PATH = fs.existsSync(CONTAINER_PATH) ? CONTAINER_PATH : HOST_PATH;

if (!FIREBASE_API_KEY) {
    console.error("Error: VITE_FIREBASE_API_KEY is not set");
    process.exit(1);
}

// --- Setup Firebase Admin ---
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

async function getValidToken(uid) {
    try {
        const customToken = await admin.auth().createCustomToken(uid);
        const params = new URLSearchParams();
        params.append("key", FIREBASE_API_KEY);
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?${params.toString()}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token: customToken,
                    returnSecureToken: true,
                }),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Firebase Auth Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.idToken;
    } catch (error) {
        console.error("Error getting token:", error);
        throw error;
    }
}

async function setupAccess(uid, projectId) {
    console.log(`Seeding access control for user ${uid} on project ${projectId}...`);
    const db = admin.firestore();
    const docRef = db.collection("projectUsers").doc(projectId);
    await docRef.set({
        accessibleUserIds: [uid],
        testData: true,
    });
    console.log("Access granted in Firestore.");
    return async () => {
        console.log("Cleaning up access control...");
        await docRef.delete();
        console.log("Cleanup complete.");
    };
}

async function runTest() {
    console.log("--- Starting Persistence Verification ---");

    const uid = "verifier-user";
    const cleanUp = await setupAccess(uid, PROJECT_ID);

    try {
        // 1. Get Token
        console.log("Generating valid token...");
        const token = await getValidToken(uid);

        // 2. Connect and Write Data
        console.log(`Connecting to ${SERVER_URL}/projects/${PROJECT_ID}...`);

        const doc1 = new Y.Doc();
        const provider1 = new HocuspocusProvider({
            url: `${SERVER_URL}/projects/${PROJECT_ID}?token=${token}`,
            name: `projects/${PROJECT_ID}`,
            document: doc1,
            WebSocketPolyfill: WebSocket,
            token: token,
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout connecting")), 10000);
            provider1.on("synced", () => {
                clearTimeout(timeout);
                resolve();
            });
            provider1.on("close", (e) => {
                console.log("Closed:", e);
            });
        });
        console.log("Connected (1). Writing data...");

        const map1 = doc1.getMap("verification");
        const updateKey = `update-${Date.now()}`;
        map1.set(updateKey, "persisted-value");

        // Wait a bit for server to receive
        await new Promise(r => setTimeout(r, 1000));

        console.log("Disconnecting (1)...");
        provider1.destroy();

        // 3. Reconnect and Verify
        console.log("Waiting 2 seconds...");
        await new Promise(r => setTimeout(r, 2000));

        console.log("Reconnecting (2) to verify persistence...");
        const doc2 = new Y.Doc();
        const provider2 = new HocuspocusProvider({
            url: `${SERVER_URL}/projects/${PROJECT_ID}?token=${token}`,
            name: `projects/${PROJECT_ID}`,
            document: doc2,
            WebSocketPolyfill: WebSocket,
            token: token,
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout connecting 2")), 5000);
            provider2.on("synced", () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        console.log("Connected (2). Checking data...");
        const map2 = doc2.getMap("verification");
        const value = map2.get(updateKey);

        console.log(`Retrieved value for key '${updateKey}':`, value);

        if (value === "persisted-value") {
            console.log("SUCCESS: Data persisted!");
            process.exitCode = 0;
        } else {
            console.error("FAILURE: Data did NOT persist.");
            process.exitCode = 1;
        }
    } catch (e) {
        console.error("Test failed with error:", e);
        process.exitCode = 1;
    } finally {
        await cleanUp();
    }
}

runTest();
