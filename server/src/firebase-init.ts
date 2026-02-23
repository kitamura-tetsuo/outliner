import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { secretManager } from "./secret-manager.js";
import { serverLogger as logger } from "./utils/log-manager.js";

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normalize emulator env hosts to expected ports when provided by parent process
// This avoids accidental drift (e.g., external 9100) breaking local setup
try {
    const expectedAuthPort = process.env.FIREBASE_AUTH_PORT;
    const expectedFsPort = process.env.FIREBASE_FIRESTORE_PORT;
    const expectedFnPort = process.env.FIREBASE_FUNCTIONS_PORT;
    if (expectedAuthPort) {
        const expected = `127.0.0.1:${expectedAuthPort}`;
        if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST !== expected) {
            logger.warn(
                `Overriding FIREBASE_AUTH_EMULATOR_HOST ${process.env.FIREBASE_AUTH_EMULATOR_HOST} -> ${expected}`,
            );
        }
        process.env.FIREBASE_AUTH_EMULATOR_HOST = expected;
        process.env.AUTH_EMULATOR_HOST = expected; // legacy
    }
    if (expectedFsPort) {
        const expected = `127.0.0.1:${expectedFsPort}`;
        if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== expected) {
            logger.warn(`Overriding FIRESTORE_EMULATOR_HOST ${process.env.FIRESTORE_EMULATOR_HOST} -> ${expected}`);
        }
        process.env.FIRESTORE_EMULATOR_HOST = expected;
    }
    if (expectedFnPort) {
        const expected = `127.0.0.1:${expectedFnPort}`;
        if (process.env.FIREBASE_EMULATOR_HOST && process.env.FIREBASE_EMULATOR_HOST !== expected) {
            logger.warn(`Overriding FIREBASE_EMULATOR_HOST ${process.env.FIREBASE_EMULATOR_HOST} -> ${expected}`);
        }
        process.env.FIREBASE_EMULATOR_HOST = expected;
    }
} catch (e) {
    // Non-fatal; continue with existing env
}

// Development auth helper
const isDevelopment = process.env.NODE_ENV !== "production";
let devAuthHelper: any;
if (isDevelopment) {
    try {
        // @ts-ignore - dynamic import of script outside src
        devAuthHelper = await import("./scripts/setup-dev-auth.js");
        logger.info("Development auth helper loaded");
    } catch (error: any) {
        logger.warn(error, "Development auth helper not available");
    }
}

// Firebase service account configuration
export function getServiceAccount() {
    // If Firebase Admin SDK file is specified, use it
    if (process.env.FIREBASE_ADMIN_SDK_PATH) {
        // Try multiple paths:
        // 1. As absolute path or relative to CWD
        // 2. Relative to __dirname (dist/)
        // 3. Relative to project root (parent of dist/)
        const candidates = [
            path.resolve(process.env.FIREBASE_ADMIN_SDK_PATH),
            path.resolve(__dirname, process.env.FIREBASE_ADMIN_SDK_PATH),
            path.resolve(__dirname, "..", process.env.FIREBASE_ADMIN_SDK_PATH),
        ];

        let sdkPath = "";
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                sdkPath = candidate;
                break;
            }
        }

        if (sdkPath) {
            logger.info(`Using Firebase Admin SDK file: ${sdkPath}`);
            const sdkFile = fs.readFileSync(sdkPath, "utf-8");
            return JSON.parse(sdkFile);
        } else {
            logger.warn(`Firebase Admin SDK file not found in candidates: ${candidates.join(", ")}`);
        }
    }

    // Read configuration from environment variables (traditional method)
    // Prioritize loading from Secret Manager
    const privateKey = secretManager.getSecret("FIREBASE_PRIVATE_KEY") || process.env.FIREBASE_PRIVATE_KEY || "";

    return {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "outliner-d57b0",
        private_key_id: secretManager.getSecret("FIREBASE_PRIVATE_KEY_ID") || process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: (() => {
            let key = typeof privateKey === "string" ? privateKey : "";

            // Remove surrounding quotes if present (double or single)
            if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
                key = key.slice(1, -1);
            }

            // Handle escaped newlines (e.g. from .env or JSON string)
            key = key.replace(/\\n/g, "\n");

            // Validate simple PEM format check
            if (key && !key.includes("-----BEGIN PRIVATE KEY-----")) {
                logger.warn("Private key does not contain standard PEM header. It might be malformed.");
                logger.warn(`Key start: ${key.substring(0, 20)}... Key length: ${key.length}`);
            }
            return key;
        })(),
        client_email: secretManager.getSecret("FIREBASE_CLIENT_EMAIL") || process.env.FIREBASE_CLIENT_EMAIL,
        client_id: secretManager.getSecret("FIREBASE_CLIENT_ID") || process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: secretManager.getSecret("FIREBASE_CLIENT_CERT_URL")
            || process.env.FIREBASE_CLIENT_CERT_URL,
    };
}

const isEmulatorEnvironment = process.env.USE_FIREBASE_EMULATOR === "true"
    || process.env.FIREBASE_AUTH_EMULATOR_HOST
    || process.env.FIRESTORE_EMULATOR_HOST
    || process.env.FIREBASE_EMULATOR_HOST;

async function waitForFirebaseEmulator(maxRetries = 30, initialDelay = 1000, maxDelay = 10000) {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST
        || process.env.FIRESTORE_EMULATOR_HOST
        || process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.info("Firebase emulator not configured, skipping connection wait");
        return;
    }
    logger.info(`Firebase emulator detected, waiting for connection... (max retries: ${maxRetries})`);
    logger.info(
        `Emulator hosts: AUTH=${process.env.FIREBASE_AUTH_EMULATOR_HOST || "(unset)"}, `
            + `FIRESTORE=${process.env.FIRESTORE_EMULATOR_HOST || "(unset)"}, FUNCTIONS=${
                process.env.FIREBASE_EMULATOR_HOST || "(unset)"
            }`,
    );
    let retryCount = 0;
    let delay = initialDelay;
    while (retryCount < maxRetries) {
        try {
            logger.info(`Firebase connection attempt ${retryCount + 1}/${maxRetries}...`);
            const listUsersResult = await admin.auth().listUsers(1);
            logger.info({ userCount: listUsersResult.users.length }, "Firebase emulator connection successful");
            if (listUsersResult.users.length > 0) {
                logger.info(
                    {
                        uid: listUsersResult.users[0].uid,
                        email: listUsersResult.users[0].email,
                        displayName: listUsersResult.users[0].displayName,
                    },
                    "First user",
                );
            }
            return;
        } catch (error: any) {
            retryCount++;
            if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                logger.warn(
                    error,
                    `Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries})`,
                );
                if (retryCount < maxRetries) {
                    logger.info({ delayMs: delay }, "Waiting before next retry...");
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 1.5, maxDelay);
                }
            } else {
                logger.error(error, "Firebase emulator connection failed with non-connection error");
                throw error;
            }
        }
    }
    throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
}

async function clearFirestoreEmulatorData() {
    const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.warn("Skipping data clearing because Firestore emulator was not detected");
        return false;
    }

    // Execute data clearing only in Test environment
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
        logger.info("Skipping Firestore emulator data clearing in Production environment");
        return false;
    }

    try {
        logger.info("Clearing Firestore emulator data...");

        // Clear data using Firebase Admin REST API (more efficient)
        const projectId = process.env.FIREBASE_PROJECT_ID || "test-project-id";
        const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:58080";

        // Clear the entire database via REST API
        const clearUrl = `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

        const response = await fetch(clearUrl, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer owner",
            },
        });

        if (response.ok) {
            logger.info("All Firestore emulator data has been cleared");
            return true;
        } else {
            logger.warn(`Firestore data clearing response: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error: any) {
        logger.error(error, "An error occurred while clearing Firestore emulator data");
        // Continue process even if an error occurs
        return false;
    }
}

export async function initializeFirebase() {
    try {
        // Load secrets from GCP Secret Manager if not in emulator environment
        if (!isEmulatorEnvironment) {
            await secretManager.loadSecrets([
                "FIREBASE_PRIVATE_KEY",
                "FIREBASE_PRIVATE_KEY_ID",
                "FIREBASE_CLIENT_EMAIL",
                "FIREBASE_CLIENT_ID",
                "FIREBASE_CLIENT_CERT_URL",
            ]);
        }

        const serviceAccount = getServiceAccount();

        if (!serviceAccount.project_id && !isEmulatorEnvironment) {
            logger.error(
                "Firebase service account environment variables are not properly configured.",
            );
            process.exit(1);
        }

        try {
            const apps = admin.apps;
            if (apps.length) {
                logger.info("Firebase Admin SDK instance already exists, deleting...");
                await admin.app().delete();
                logger.info("Previous Firebase Admin SDK instance deleted");
            }
        } catch (deleteError: any) {
            logger.warn(deleteError, "Previous Firebase Admin SDK instance deletion failed");
        }
        const emulatorVariables = {
            FIREBASE_EMULATOR_HOST: process.env.FIREBASE_EMULATOR_HOST,
            FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
            FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
        };
        const configuredEmulators = Object.entries(emulatorVariables)
            .filter(([_, value]) => value)
            .map(([name, value]) => `${name}=${value}`);
        if (configuredEmulators.length > 0) {
            logger.warn("⚠️ Firebase Emulator environment variables are set. This may be an issue in production!");
            logger.warn(`Configured Emulator environment variables: ${configuredEmulators.join(", ")}`);
            logger.warn("These environment variables should be set in .env.test and should not be set in production.");
        }
        if (
            isEmulatorEnvironment
            && (!serviceAccount.private_key || serviceAccount.private_key.includes("Your Private Key Here"))
        ) {
            admin.initializeApp({ projectId: serviceAccount.project_id });
        } else {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        logger.info({ projectId: serviceAccount.project_id }, "Firebase Admin SDK initialized successfully");
        if (isDevelopment) {
            try {
                await waitForFirebaseEmulator();
                logger.info("Firebase emulator connection established successfully");
            } catch (error: any) {
                logger.error(error, "Firebase emulator connection failed after retries");
            }
        }
        if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            logger.warn(`Firebase Auth Emulator is configured: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        }
        if (isDevelopment && devAuthHelper) {
            try {
                const user = await devAuthHelper.setupTestUser();
                logger.info({ email: user.email, uid: user.uid }, "Setup development test user");
                const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
                if (isEmulator) {
                    try {
                        // Execute Firestore data clearing (improved version)
                        const cleared = await clearFirestoreEmulatorData();
                        if (cleared) {
                            logger.info("Cleared development Firestore emulator data");
                        }
                    } catch (error: any) {
                        logger.error(error, "Failed to clear Firestore emulator data");
                        // Continue process even if an error occurs
                        logger.info("Firestore data clearing failed, but continuing process");
                    }
                }
            } catch (error: any) {
                logger.warn(error, "Failed to setup test user");
            }
        }
    } catch (error: any) {
        logger.error(error, "Firebase initialization error");
        throw error;
    }
}
