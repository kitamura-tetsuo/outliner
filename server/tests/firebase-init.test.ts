import { expect } from "chai";
import crypto from "crypto";
import * as firebaseAdminApp from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import sinon from "sinon";
import { fileURLToPath } from "url";
import * as firebaseInit from "../src/firebase-init.js";
import { secretManager } from "../src/secret-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("firebase-init Secret Manager loading bypass", () => {
    let originalEnv: NodeJS.ProcessEnv;
    let loadSecretsStub: sinon.SinonStub;
    const dummySdkPath = path.resolve(__dirname, "dummy-sdk-test.json");
    let validKey: string;

    beforeEach(() => {
        originalEnv = { ...process.env };

        validKey = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        }).privateKey;

        // Provide dummy env vars so getServiceAccount() and cert() do not fail
        process.env.FIREBASE_PROJECT_ID = "test-project-id";
        process.env.FIREBASE_PRIVATE_KEY = validKey;
        process.env.FIREBASE_CLIENT_EMAIL = "test@example.com";
        delete process.env.USE_FIREBASE_EMULATOR;
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        delete process.env.FIRESTORE_EMULATOR_HOST;
        delete process.env.FIREBASE_EMULATOR_HOST;

        process.env.NODE_ENV = "production";

        // Mock Secret Manager
        loadSecretsStub = sinon.stub(secretManager, "loadSecrets").resolves();
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

        try {
            await firebaseInit.initializeFirebase();
        } catch (e: any) {
        }

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should load secrets when FIREBASE_ADMIN_SDK_PATH is set but the file does not exist", async () => {
        process.env.FIREBASE_ADMIN_SDK_PATH = "./non-existent-sdk-file-xyz.json";

        try {
            await firebaseInit.initializeFirebase();
        } catch (error) {
        }

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should skip loading secrets when FIREBASE_ADMIN_SDK_PATH is set and the file exists", async () => {
        const dummySdkContent = {
            type: "service_account",
            project_id: "test-project-id",
            private_key: validKey,
            client_email: "test@example.com",
        };
        fs.writeFileSync(dummySdkPath, JSON.stringify(dummySdkContent), "utf-8");

        process.env.FIREBASE_ADMIN_SDK_PATH = dummySdkPath;

        try {
            await firebaseInit.initializeFirebase();
        } catch (e: any) {
        }

        expect(loadSecretsStub.called).to.be.false;
    });
});
