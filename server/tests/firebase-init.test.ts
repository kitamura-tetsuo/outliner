import { expect } from "chai";
import * as adminApp from "firebase-admin/app";
import * as adminAuth from "firebase-admin/auth";
import { _testDeps, initializeFirebase } from "../src/firebase-init.js";
import { secretManager } from "../src/secret-manager.js";

import fs from "fs";
import path from "path";
import sinon from "sinon";

describe("firebase-init Secret Manager loading bypass", () => {
    let loadSecretsStub: sinon.SinonStub;
    let initializeAppStub: sinon.SinonStub;
    let certStub: sinon.SinonStub;
    let deleteAppStub: sinon.SinonStub;
    let getAppsStub: sinon.SinonStub;

    beforeEach(() => {
        sinon.restore();
        loadSecretsStub = sinon.stub(secretManager, "loadSecrets").resolves();

        // Stub the modular API functions
        initializeAppStub = sinon.stub(_testDeps, "initializeApp").returns({} as any);
        deleteAppStub = sinon.stub().resolves();
        getAppsStub = sinon.stub(_testDeps, "getApps").returns([]);
        certStub = sinon.stub(_testDeps, "cert").returns({} as any);

        // Mock getAuth if needed
        sinon.stub(_testDeps, "getAuth").returns({
            getUserByEmail: sinon.stub().rejects({ code: "auth/user-not-found" }),
            createUser: sinon.stub().resolves({ uid: "test-uid", email: "test@example.com" }),
            setCustomUserClaims: sinon.stub().resolves(),
            listUsers: sinon.stub().resolves({ users: [] }),
        } as any);

        // By default, make it look like non-emulator environment to trigger Secret Manager load checks
        delete process.env.USE_FIREBASE_EMULATOR;
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        process.env.GCLOUD_PROJECT = "test-project";

        // Ensure no previous errors bleed into logs during expected failures
        sinon.stub(console, "error");
        sinon.stub(console, "info");
        sinon.stub(console, "warn");
    });

    afterEach(() => {
        sinon.restore();
        delete process.env.FIREBASE_ADMIN_SDK_PATH;
        delete process.env.GCLOUD_PROJECT;
    });

    it("should load secrets when FIREBASE_ADMIN_SDK_PATH is not set", async () => {
        delete process.env.FIREBASE_ADMIN_SDK_PATH;

        await initializeFirebase();

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should load secrets when FIREBASE_ADMIN_SDK_PATH is set but the file does not exist", async () => {
        process.env.FIREBASE_ADMIN_SDK_PATH = "/tmp/nonexistent-file.json";

        await initializeFirebase();

        expect(loadSecretsStub.calledOnce).to.be.true;
    });

    it("should skip loading secrets when FIREBASE_ADMIN_SDK_PATH is set and the file exists", async () => {
        const dummySdkPath = path.join(process.cwd(), "tests", "dummy-sdk-test.json");
        const dummySdkContent = {
            type: "service_account",
            project_id: "test-project-id",
            client_email: "test@example.com",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIICXAIBAAKBgQDRm/X6o5O20vJtLw/8/oA=\n-----END PRIVATE KEY-----",
        };
        fs.writeFileSync(dummySdkPath, JSON.stringify(dummySdkContent), "utf-8");

        process.env.FIREBASE_ADMIN_SDK_PATH = dummySdkPath;

        try {
            await initializeFirebase();
        } catch (e: any) {
        }

        expect(loadSecretsStub.called).to.be.false;

        if (fs.existsSync(dummySdkPath)) {
            fs.unlinkSync(dummySdkPath);
        }
    });
});
