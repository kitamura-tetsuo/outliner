/**
 * Firebase Admin SDK initialization for emulator environment
 * This script initializes Firebase Admin SDK to work with Firebase emulators
 */
import admin from "firebase-admin";
import { serverLogger } from "../utils/logger.js";

async function initializeFirebase() {
    try {
        // Check if already initialized
        if (admin.apps.length === 0) {
            // For emulator environment, use a mock service account
            // The emulator will accept any credentials when running in emulator mode
            const serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID || "outliner-d57b0",
                // Use dummy credentials - emulator doesn't validate these
                clientEmail: "firebase-adminsdk@example.com",
                privateKey:
                    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDYZ3VWPY7gCpmB\n1mJ3JaH3V3q5a8c3FQ0Z9Y0xJ0xK0xL0xM0xN0xO0xP0xQ0xR0xS0xT0xU0xV0xW0xX\n0xY0xZ0xa0xb0xc0xd0xe0xf0xg0xh0xi0xj0xk0xl0xm0xn0xo0xp0xq0xr0xs0xt\n0xu0xv0xw0xx0xy0xz0xa0xb0xc0xd0xe0xf0xg0xh0xi0xj0xk0xl0xm0xn0xo\n-----END PRIVATE KEY-----\n",
            };

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });

            serverLogger.info(`Firebase Admin SDK initialized with project: ${serviceAccount.projectId}`);
        } else {
            serverLogger.info("Firebase Admin SDK already initialized");
        }

        return admin;
    } catch (error) {
        serverLogger.error("Firebase initialization error:", error);
        throw error;
    }
}

// Export for use by other modules
export { initializeFirebase };

// Run initialization if this script is executed directly
if (process.argv[1] && process.argv[1].endsWith("firebase-init.js")) {
    initializeFirebase()
        .then(() => {
            console.log("Firebase emulator initialization completed");
            process.exit(0);
        })
        .catch(err => {
            console.error("Firebase emulator initialization failed", err);
            process.exit(1);
        });
}
