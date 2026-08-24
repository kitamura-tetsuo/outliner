import { expect } from "chai";
import { getOAuthFirebaseWebConfig, renderAuthorizePage } from "../../src/oauth/authorize-page.js";

const CONFIG_ENV_KEYS = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
    "FIREBASE_PROJECT_ID",
    "GCLOUD_PROJECT",
    "FIREBASE_AUTH_EMULATOR_HOST",
] as const;

describe("OAuth authorize-page Firebase Web configuration", () => {
    const originalEnv = new Map<string, string | undefined>();

    beforeEach(() => {
        for (const key of CONFIG_ENV_KEYS) {
            originalEnv.set(key, process.env[key]);
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of CONFIG_ENV_KEYS) {
            const value = originalEnv.get(key);
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        originalEnv.clear();
    });

    it("uses the same VITE_FIREBASE_* Web App values as the client", () => {
        process.env.VITE_FIREBASE_API_KEY = "shared-api-key";
        process.env.VITE_FIREBASE_AUTH_DOMAIN = "shared.firebaseapp.com";
        process.env.VITE_FIREBASE_PROJECT_ID = "shared-project";
        process.env.VITE_FIREBASE_APP_ID = "1:42:web:shared";

        expect(getOAuthFirebaseWebConfig()).to.deep.equal({
            apiKey: "shared-api-key",
            authDomain: "shared.firebaseapp.com",
            projectId: "shared-project",
            appId: "1:42:web:shared",
        });
    });

    it("fails explicitly rather than using demo values when configuration is absent", () => {
        const readConfig = () => getOAuthFirebaseWebConfig();
        expect(readConfig).to.throw(
            "Missing required Firebase Web configuration for OAuth",
        );
        expect(readConfig).to.throw("VITE_FIREBASE_API_KEY");
    });

    it("uses practical defaults and connects Firebase Auth when the emulator is configured", () => {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:59099";
        process.env.FIREBASE_PROJECT_ID = "emulator-project";

        expect(getOAuthFirebaseWebConfig()).to.deep.equal({
            apiKey: "firebase-auth-emulator-api-key",
            authDomain: "emulator-project.firebaseapp.com",
            projectId: "emulator-project",
            appId: "1:0:web:firebase-auth-emulator",
        });
        const html = renderAuthorizePage({ requestId: "request", scope: "outliner.read", nonce: "nonce" });
        expect(html).to.include('connectAuthEmulator(auth, "http://127.0.0.1:59099"');
    });
});
