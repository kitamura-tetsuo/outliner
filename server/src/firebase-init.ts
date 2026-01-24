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
        logger.warn(`Development auth helper not available: ${error.message}`);
    }
}

// Firebase service account configuration
export function getServiceAccount() {
    // Firebase Admin SDKファイルが指定されている場合はそれを使用
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

    // 環境変数から設定を読み取る（従来の方式）
    // Secret Manager からの読み込みを優先
    const privateKey = secretManager.getSecret("FIREBASE_PRIVATE_KEY") || process.env.FIREBASE_PRIVATE_KEY || "";

    return {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "outliner-d57b0",
        private_key_id: secretManager.getSecret("FIREBASE_PRIVATE_KEY_ID") || process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey.replace(/\\n/g, "\n"),
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
            logger.info(`Firebase emulator connection successful. Found users: ${listUsersResult.users.length}`);
            if (listUsersResult.users.length > 0) {
                logger.info(
                    `First user: ${
                        JSON.stringify({
                            uid: listUsersResult.users[0].uid,
                            email: listUsersResult.users[0].email,
                            displayName: listUsersResult.users[0].displayName,
                        })
                    }`,
                );
            }
            return;
        } catch (error: any) {
            retryCount++;
            if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                logger.warn(`Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries}): ${error.message}`);
                if (retryCount < maxRetries) {
                    logger.info(`Waiting ${delay}ms before next retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 1.5, maxDelay);
                }
            } else {
                logger.error(`Firebase emulator connection failed with non-connection error: ${error.message}`);
                throw error;
            }
        }
    }
    throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
}

async function clearFirestoreEmulatorData() {
    const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.warn("Firestore エミュレータが検出されなかったため、データ消去をスキップします");
        return false;
    }

    // Test環境でのみデータ消去を実行
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
        logger.info("Production環境ではFirestoreエミュレータのデータ消去をスキップします");
        return false;
    }

    try {
        logger.info("Firestore エミュレータのデータを消去しています...");

        // Firebase Admin REST APIを使用してデータを消去（より効率的）
        const projectId = process.env.FIREBASE_PROJECT_ID || "test-project-id";
        const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:58080";

        // REST APIでデータベース全体をクリア
        const clearUrl = `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

        const response = await fetch(clearUrl, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer owner",
            },
        });

        if (response.ok) {
            logger.info("Firestore エミュレータのデータを全て消去しました");
            return true;
        } else {
            logger.warn(`Firestore データ消去のレスポンス: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error: any) {
        logger.error(`Firestore エミュレータのデータ消去中にエラーが発生しました: ${error.message}`);
        // エラーが発生してもプロセスを継続
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
            logger.warn(`Previous Firebase Admin SDK instance deletion failed: ${deleteError.message}`);
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
            logger.warn("⚠️ Firebase Emulator環境変数が設定されています。本番環境では問題になる可能性があります！");
            logger.warn(`設定されているEmulator環境変数: ${configuredEmulators.join(", ")}`);
            logger.warn("これらの環境変数は本来 .env.test に設定すべきもので、本番環境では設定しないでください。");
        }
        if (
            isEmulatorEnvironment
            && (!serviceAccount.private_key || serviceAccount.private_key.includes("Your Private Key Here"))
        ) {
            admin.initializeApp({ projectId: serviceAccount.project_id });
        } else {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        logger.info(`Firebase Admin SDK initialized successfully. Project ID: ${serviceAccount.project_id}`);
        if (isDevelopment) {
            try {
                await waitForFirebaseEmulator();
                logger.info("Firebase emulator connection established successfully");
            } catch (error: any) {
                logger.error(`Firebase emulator connection failed after retries: ${error.message}`);
            }
        }
        if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            logger.warn(`Firebase Auth Emulator is configured: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        }
        if (isDevelopment && devAuthHelper) {
            try {
                const user = await devAuthHelper.setupTestUser();
                logger.info(`開発環境用テストユーザーをセットアップしました: ${user.email} (${user.uid})`);
                const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
                if (isEmulator) {
                    try {
                        // Firestoreデータ消去を実行（改善版）
                        const cleared = await clearFirestoreEmulatorData();
                        if (cleared) {
                            logger.info("開発環境の Firestore エミュレータデータを消去しました");
                        }
                    } catch (error: any) {
                        logger.error(`Firestore エミュレータデータの消去に失敗しました: ${error.message}`);
                        // エラーが発生してもプロセスを継続
                        logger.info("Firestore データ消去に失敗しましたが、処理を継続します");
                    }
                }
            } catch (error: any) {
                logger.warn(`テストユーザーのセットアップに失敗しました: ${error.message}`);
            }
        }
    } catch (error: any) {
        logger.error(`Firebase初期化エラー: ${error.message}`);
        throw error;
    }
}
