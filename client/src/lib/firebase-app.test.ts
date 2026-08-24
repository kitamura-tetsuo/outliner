import { describe, expect, it } from "vitest";
import { getFirebaseConfig } from "./firebase-app";

describe("Firebase Web configuration", () => {
    it("provides Google sign-in with every shared Web App identifier", () => {
        const config = getFirebaseConfig();

        expect(config).to.include({
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
        });
    });
});
