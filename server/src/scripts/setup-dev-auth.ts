// Development environment authentication setup script
import "dotenv/config";
import admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { fileURLToPath } from "url";
import { serverLogger as logger } from "../utils/log-manager.js";

// Initialize Firebase Admin SDK
export async function initializeFirebase() {
    try {
        // Check if already initialized
        if (admin.apps.length === 0) {
            const serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                clientId: process.env.FIREBASE_CLIENT_ID,
                clientX509CertUrl: process.env.FIREBASE_CLIENT_CERT_URL,
            } as admin.ServiceAccount;

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });

            logger.info(`Firebase Admin SDK initialized with project: ${serviceAccount.projectId}`);
        } else {
            logger.info("Firebase Admin SDK already initialized");
        }

        return admin;
    } catch (error) {
        logger.error({ err: error }, "Firebase initialization error");
        throw error;
    }
}

// Create or retrieve test user
export async function setupTestUser(): Promise<UserRecord> {
    try {
        const adminInstance = await initializeFirebase();
        const auth = adminInstance.auth();

        const testEmail = "test@example.com";
        const testPassword = "password";
        const displayName = "Test User";

        // Check if user already exists
        try {
            const userRecord = await auth.getUserByEmail(testEmail);
            logger.info(`Test user already exists: ${userRecord.uid}`);
            return userRecord;
        } catch (error: any) {
            if (error.code !== "auth/user-not-found") {
                throw error;
            }

            // Create new user if not exists
            const userRecord = await auth.createUser({
                email: testEmail,
                password: testPassword,
                displayName: displayName,
                emailVerified: true,
            });

            logger.info(`Successfully created test user: ${userRecord.uid}`);

            // Add custom claims to bypass token verification in development environment
            await auth.setCustomUserClaims(userRecord.uid, {
                devUser: true,
                role: "admin",
            });

            logger.info(`Added custom claims to user: ${userRecord.uid}`);

            return userRecord;
        }
    } catch (error) {
        logger.error({ err: error }, "Error setting up test user");
        throw error;
    }
}

// When script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    setupTestUser()
        .then(user => {
            console.log("=================================================");
            console.log("Development test user setup completed");
            console.log("=================================================");
            console.log("Email:", user.email);
            console.log("UID:", user.uid);
            console.log("DisplayName:", user.displayName);
            console.log("Password: password");
            console.log("=================================================");
            console.log("Please use this user information to log in to the app.");
            process.exit(0);
        })
        .catch(error => {
            console.error("Failed to setup test user:", error);
            process.exit(1);
        });
}
