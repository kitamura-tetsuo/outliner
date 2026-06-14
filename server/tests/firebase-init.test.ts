import { expect } from "chai";
import admin from "firebase-admin";
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
        initializeAppStub = sinon.stub(admin, "initializeApp");
        certStub = sinon.stub(admin.credential, "cert").returns({} as any);
        deleteAppStub = sinon.stub().resolves();
        sinon.stub(admin, "app").returns({
            delete: deleteAppStub,
            auth: () => ({
                getUserByEmail: sinon.stub().rejects({ code: "auth/user-not-found" }),
                createUser: sinon.stub().resolves({ uid: "test-uid", email: "test@example.com" }),
                setCustomUserClaims: sinon.stub().resolves(),
            }),
        } as any);
        sinon.stub(admin, "apps").get(() => []);

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

        await initializeFirebase();

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
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADAN\n-----END PRIVATE KEY-----",
        };
        fs.writeFileSync(dummySdkPath, JSON.stringify(dummySdkContent), "utf-8");

        process.env.FIREBASE_ADMIN_SDK_PATH = dummySdkPath;

        await initializeFirebase();

        expect(loadSecretsStub.called).to.be.false;
    });
});
