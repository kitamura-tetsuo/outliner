import { expect } from "chai";
import { initializeFirebase } from "../src/firebase-init.js";
import { secretManager } from "../src/secret-manager.js";

import fs from "fs";
import path from "path";
import sinon from "sinon";
import { fileURLToPath } from "url";
import { initializeFirebase } from "../src/firebase-init.js";
import { secretManager } from "../src/secret-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("firebase-init Secret Manager loading bypass", () => {
    let originalEnv: NodeJS.ProcessEnv;
    let loadSecretsStub: sinon.SinonStub;
    let initializeAppStub: sinon.SinonStub;
    let deleteAppStub: sinon.SinonStub;
    let certStub: sinon.SinonStub;
    const dummySdkPath = path.resolve(__dirname, "dummy-sdk-test.json");

    beforeEach(() => {
        originalEnv = { ...process.env };

        // Mock Secret Manager
        loadSecretsStub = sinon.stub(secretManager, "loadSecrets").resolves();

        // Mock Firebase Admin
                // Mock Firebase Admin
        // Instead of stubbing ES modules directly (which fails), we stub a wrapper or rely on the fact that admin wrapper might not be fully working as a default import for stubs anymore. Let's mock it at the helper or inject layer if possible. For now let's stub the default export properties if they exist, or test doubles.
        // Actually, firebase-admin v14 does not support the old default export methods like admin.initializeApp. It's better to use testdouble or proxyquire, or simply stub the new module using proxyquire/testdouble if possible. Since we can't stub ESM modules with Sinon easily without loaders, and we are in typescript, let's see if we can just mock the import.

        // By default, make it look like non-emulator environment to trigger Secret Manager load checks
        delete process.env.USE_FIREBASE_EMULATOR;
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        delete process.env.FIRESTORE_EMULATOR_HOST;
        delete process.env.FIREBASE_EMULATOR_HOST;

        process.env.NODE_ENV = "production";
    });

    afterEach(() => {
        sinon.restore();
        process.env = originalEnv;
        if (fs.existsSync(dummySdkPath)) {
            fs.unlinkSync(dummySdkPath);
        }
    });

    it("should load secrets when FIREBASE_ADMIN_SDK_PATH is not set", async () => {
        delete process.env.FIREBASE_ADMIN_SDK_PATH;

        try { await initializeFirebase(); } catch (e) {}

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should load secrets when FIREBASE_ADMIN_SDK_PATH is set but the file does not exist", async () => {
        process.env.FIREBASE_ADMIN_SDK_PATH = "./non-existent-sdk-file-xyz.json";

        // Try-catch block since getServiceAccount might fail if no environment variables are present either
        try {
            await initializeFirebase();
        } catch (error) {
            // we only care whether loadSecrets was called before any failure
        }

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should skip loading secrets when FIREBASE_ADMIN_SDK_PATH is set and the file exists", async () => {
        // Create dummy SDK file
        const dummySdkContent = {
            type: "service_account",
            project_id: "test-project-id",
            client_email: "test@example.com",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIICXAIBAAKBgQDRm/X6o5O20vJtLw/8/oA=\n-----END PRIVATE KEY-----",
        };
        fs.writeFileSync(dummySdkPath, JSON.stringify(dummySdkContent), "utf-8");

        process.env.FIREBASE_ADMIN_SDK_PATH = dummySdkPath;

        try { await initializeFirebase(); } catch (e) {}

        expect(loadSecretsStub.called).to.be.false;
    });
});
