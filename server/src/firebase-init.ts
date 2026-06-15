import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import { setupTestUser } from "./scripts/setup-dev-auth.js";
import { secretManager } from "./secret-manager.js";

function getServiceAccount() {
    // 1. Try path provided via environment variable
    const possiblePaths = [];

    if (process.env.FIREBASE_ADMIN_SDK_PATH) {
        possiblePaths.push(process.env.FIREBASE_ADMIN_SDK_PATH);
    }

    // 2. Add common fallback paths based on likely runtime environments
    possiblePaths.push("/app/server/outliner-d57b0-firebase-adminsdk-dummy.json"); // Example production container path
    possiblePaths.push("/app/server/src/outliner-d57b0-firebase-adminsdk-dummy.json"); // Example local/test container path
    possiblePaths.push("./outliner-d57b0-firebase-adminsdk-dummy.json"); // Local fallback

    // Filter paths to only those that exist
    const validPaths = possiblePaths.filter((p) => {
        try {
            return fs.existsSync(p);
        } catch (e) {
            return false;
        }
    });

    if (validPaths.length > 0) {
        const selectedPath = validPaths[0];
        console.log(`[Firebase] Loading credentials from valid path: ${selectedPath}`);
        try {
            return JSON.parse(fs.readFileSync(selectedPath, "utf8"));
        } catch (e) {
            console.warn(`[Firebase] Failed to read or parse file at ${selectedPath}:`, e);
        }
    }

    console.warn(`[Firebase] No valid service account file found in candidates: ${possiblePaths.join(", ")}`);
    return {};
}

// Ensure the helper is exported so tests can stub/mock it.
export const _testDeps = {
    initializeApp,
    getApps,
    cert,
    getApp,
    getAuth,
};

export async function initializeFirebase() {
    try {
        const isEmulator = process.env.USE_FIREBASE_EMULATOR === "true" || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
        let serviceAccount: any = undefined;

        // Try getting service account first from file
        serviceAccount = getServiceAccount();

        // Skip Secret Manager check entirely in emulator/test environment
        // Also skip if we successfully loaded a valid service account with a private key
        if (!isEmulator && !(serviceAccount && Object.keys(serviceAccount).length > 0 && serviceAccount.private_key)) {
            // First try loading from Secret Manager in production environment
            const loadSecretsResult = await secretManager.loadSecrets();

            // If FIREBASE_PRIVATE_KEY exists in env, we prioritize that (e.g. injected via Secret Manager or process.env)
            if (process.env.FIREBASE_PRIVATE_KEY) {
                // If the private key is injected via Secret Manager (as env var), we construct the service account
                serviceAccount = {
                    project_id: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
                    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                    client_email: process.env.FIREBASE_CLIENT_EMAIL,
                };
            }
        }

        const projectId = serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT
            || "demo-project";
        const isDemoProject = projectId === "demo-project";

        // Check if an app is already initialized
        if (_testDeps.getApps().length > 0) {
            console.log("Firebase Admin SDK instance already exists, preserving...");
            return;
        }

        if (isEmulator || isDemoProject) {
            console.log(
                `Initializing Firebase Admin SDK in ${
                    isEmulator ? "Emulator" : "Demo"
                } mode (Project ID: ${projectId})`,
            );
            _testDeps.initializeApp({
                projectId,
            });
        } else if (serviceAccount && Object.keys(serviceAccount).length > 0 && serviceAccount.private_key) {
            console.log(`Initializing Firebase Admin SDK with Service Account (Project ID: ${projectId})`);
            _testDeps.initializeApp({
                credential: _testDeps.cert(serviceAccount),
                projectId,
            });
        } else {
            console.log(
                `Initializing Firebase Admin SDK with default Google Application Credentials (Project ID: ${projectId})`,
            );
            // Without passing credential, it uses GOOGLE_APPLICATION_CREDENTIALS
            _testDeps.initializeApp({
                projectId,
            });
        }

        // Wait for Firebase emulator if running in emulator mode
        if (isEmulator) {
            console.log("Firebase emulator detected, waiting for connection... (max retries: 30)");
            console.log(
                `Emulator hosts: AUTH=${process.env.FIREBASE_AUTH_EMULATOR_HOST}, FIRESTORE=${process.env.FIRESTORE_EMULATOR_HOST}, FUNCTIONS=${process.env.FIREBASE_EMULATOR_HOST}`,
            );

            let connected = false;
            let retries = 0;
            const maxRetries = 30;
            let delay = 1000; // start with 1 second delay

            while (!connected && retries < maxRetries) {
                try {
                    retries++;
                    console.log(`Firebase connection attempt ${retries}/${maxRetries}...`);
                    // Simple check if Auth emulator is responding by listing users
                    const listUsersResult = await _testDeps.getAuth().listUsers(1);
                    connected = true;
                    console.log(
                        `Firebase emulator connection successful. Found users: ${listUsersResult.users.length}`,
                    );

                    // Create test user if none exists (for UI test automation)
                    if (listUsersResult.users.length > 0) {
                        console.log(`First user: ${JSON.stringify(listUsersResult.users[0])}`);
                    }
                    console.log("Firebase emulator connection established successfully");

                    // Always run test user setup when in emulator mode
                    // This handles creating the user if needed, or silently succeeding if they exist
                    try {
                        await setupTestUser();
                    } catch (setupError) {
                        console.error("Failed to setup development test user:", setupError);
                    }

                    break;
                } catch (error: any) {
                    if (error.code === "ECONNREFUSED" || error.code === "auth/emulator-connection-failed") {
                        // Keep waiting for emulator to start
                        console.log(
                            `Emulator not ready yet (attempt ${retries}), retrying in ${delay / 1000} seconds...`,
                        );
                        await new Promise(resolve => setTimeout(resolve, delay));
                        // Exponential backoff with 10s max
                        delay = Math.min(delay * 1.5, 10000);
                    } else {
                        // Unrelated error, log it but assume connected to avoid blocking startup indefinitely
                        console.error("Unexpected error checking Firebase connection:", error.message || error);
                        connected = true;
                    }
                }
            }

            if (!connected) {
                console.error("Failed to connect to Firebase emulator after maximum retries");
                console.error("The server will continue, but Firebase integration may fail.");
            } else {
                console.log("Firebase emulator initialization completed");
            }
        }
    } catch (error) {
        console.error("Firebase initialization error:", error);
    }
}
export { getServiceAccount };
