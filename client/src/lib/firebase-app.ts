import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getLogger } from "./logger";

const logger = getLogger("firebase-app");

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (singleton)
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

export const getFirebaseApp = () => app;

if (typeof window !== "undefined") {
    (window as any).__firebase_client_app__ = app;
}

// Connect to emulator if necessary
if (typeof window !== "undefined") {
    const useEmulator = window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true"
        || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

    if (useEmulator) {
        logger.info("Connecting to Firebase Emulator...");

        const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "localhost";
        const authPort = import.meta.env.VITE_AUTH_EMULATOR_PORT
            ? parseInt(import.meta.env.VITE_AUTH_EMULATOR_PORT)
            : 9099;
        const firestorePort = import.meta.env.VITE_FIRESTORE_EMULATOR_PORT
            ? parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT)
            : 8080;

        // Connect Auth emulator
        // Check if already connected (no direct check API, so manage with flag)
        if (!(window as any).__FIREBASE_EMULATOR_CONNECTED__) {
            try {
                connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
                connectFirestoreEmulator(db, host, firestorePort);

                (window as any).__FIREBASE_EMULATOR_CONNECTED__ = true;
                logger.info("Connected to Firebase Emulator");
            } catch (e) {
                logger.warn("Failed to connect to Firebase Emulator (already connected?)", e);
            }
        }
    }
}
