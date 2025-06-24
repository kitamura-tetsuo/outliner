require("@dotenvx/dotenvx").config();
const admin = require("firebase-admin");
const { serverLogger: logger } = require("./utils/logger");

// Development auth helper
const isDevelopment = process.env.NODE_ENV !== "production";
let devAuthHelper;
if (isDevelopment) {
    try {
        devAuthHelper = require("./scripts/setup-dev-auth");
        logger.info("Development auth helper loaded");
    }
    catch (error) {
        logger.warn(`Development auth helper not available: ${error.message}`);
    }
}

// Firebase service account from env
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

const isEmulatorEnvironment = process.env.USE_FIREBASE_EMULATOR === "true" ||
    process.env.FIREBASE_EMULATOR_HOST;

if (!serviceAccount.project_id && !isEmulatorEnvironment) {
    logger.error(
        "Firebase service account environment variables are not properly configured.",
    );
    process.exit(1);
}

async function waitForFirebaseEmulator(maxRetries = 30, initialDelay = 1000, maxDelay = 10000) {
    const isEmulator = process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.info("Firebase emulator not configured, skipping connection wait");
        return;
    }
    logger.info(`Firebase emulator detected, waiting for connection... (max retries: ${maxRetries})`);
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
        }
        catch (error) {
            retryCount++;
            if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                logger.warn(`Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries}): ${error.message}`);
                if (retryCount < maxRetries) {
                    logger.info(`Waiting ${delay}ms before next retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 1.5, maxDelay);
                }
            }
            else {
                logger.error(`Firebase emulator connection failed with non-connection error: ${error.message}`);
                throw error;
            }
        }
    }
    throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
}

async function clearFirestoreEmulatorData() {
    const db = admin.firestore();
    const isEmulator = process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.warn("Firestore エミュレータが検出されなかったため、データ消去をスキップします");
        return false;
    }
    try {
        logger.info("Firestore エミュレータのデータを消去しています...");
        const collections = await db.listCollections();
        for (const collection of collections) {
            const collectionName = collection.id;
            logger.info(`コレクション '${collectionName}' のドキュメントを削除しています...`);
            const batchSize = 500;
            const query = db.collection(collectionName).limit(batchSize);
            await deleteQueryBatch(query);
            logger.info(`コレクション '${collectionName}' のドキュメントを削除しました`);
        }
        logger.info("Firestore エミュレータのデータを全て消去しました");
        return true;
    }
    catch (error) {
        logger.error(`Firestore エミュレータのデータ消去中にエラーが発生しました: ${error.message}`);
        return false;
    }
}

async function deleteQueryBatch(query) {
    const snapshot = await query.get();
    if (snapshot.size === 0) {
        return;
    }
    const batch = admin.firestore().batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    if (snapshot.size > 0) {
        await deleteQueryBatch(query);
    }
}

async function initializeFirebase() {
    try {
        try {
            const apps = admin.apps;
            if (apps.length) {
                logger.info("Firebase Admin SDK instance already exists, deleting...");
                admin.app().delete().then(() => {
                    logger.info("Previous Firebase Admin SDK instance deleted");
                });
            }
        }
        catch (deleteError) {
            logger.warn(`Previous Firebase Admin SDK instance deletion failed: ${deleteError.message}`);
        }
        const emulatorVariables = {
            FIREBASE_EMULATOR_HOST: process.env.FIREBASE_EMULATOR_HOST,
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
            isEmulatorEnvironment &&
            (!serviceAccount.private_key || serviceAccount.private_key.includes("Your Private Key Here"))
        ) {
            admin.initializeApp({ projectId: serviceAccount.project_id });
        }
        else {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        logger.info(`Firebase Admin SDK initialized successfully. Project ID: ${serviceAccount.project_id}`);
        if (isDevelopment) {
            try {
                await waitForFirebaseEmulator();
                logger.info("Firebase emulator connection established successfully");
            }
            catch (error) {
                logger.error(`Firebase emulator connection failed after retries: ${error.message}`);
            }
        }
        if (isDevelopment && devAuthHelper) {
            try {
                const user = await devAuthHelper.setupTestUser();
                logger.info(`開発環境用テストユーザーをセットアップしました: ${user.email} (${user.uid})`);
                const isEmulator = process.env.FIREBASE_EMULATOR_HOST;
                if (isEmulator) {
                    try {
                        const cleared = await clearFirestoreEmulatorData();
                        if (cleared) {
                            logger.info("開発環境の Firestore エミュレータデータを消去しました");
                        }
                    }
                    catch (error) {
                        logger.error(`Firestore エミュレータデータの消去に失敗しました: ${error.message}`);
                    }
                }
            }
            catch (error) {
                logger.warn(`テストユーザーのセットアップに失敗しました: ${error.message}`);
            }
        }
    }
    catch (error) {
        logger.error(`Firebase初期化エラー: ${error.message}`);
        throw error;
    }
}

module.exports = { initializeFirebase };
