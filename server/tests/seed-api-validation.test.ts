import { expect } from "chai";
import express from "express";
import admin from "firebase-admin";
import sinon from "sinon";
import request from "supertest";
import { createSeedRouter } from "../src/seed-api.js";
import { clearTokenCache } from "../src/websocket-auth.js";

describe("Seed API Validation", () => {
    let app: express.Express;
    let verifyIdTokenStub: sinon.SinonStub;
    let firestoreStub: sinon.SinonStub;
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Clear auth cache
        clearTokenCache();

        // Mock Auth
        // admin.auth() returns the Auth service. verifyIdToken is a method on it.
        // We need to stub the method on the instance returned by admin.auth()
        // But admin.auth() is a factory/getter.
        // Typically: sinon.stub(admin.auth(), 'verifyIdToken') works if admin.auth() returns the same instance.
        // Or stub admin.auth.

        // In metrics-endpoint.test.ts: sinon.stub(admin.auth(), "verifyIdToken")
        // So we do the same.
        if ((admin.auth() as any).verifyIdToken.restore) {
            (admin.auth() as any).verifyIdToken.restore();
        }
        verifyIdTokenStub = sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "test-user" } as any);

        // Mock Firestore
        getStub = sinon.stub();
        // Default: Project does not exist (so we can seed/create it)
        getStub.resolves({ exists: false, data: () => ({}) });

        docStub = sinon.stub().returns({ get: getStub });
        collectionStub = sinon.stub().returns({ doc: docStub });

        if ((admin.firestore as any).restore) {
            (admin.firestore as any).restore();
        }
        firestoreStub = sinon.stub(admin, "firestore").returns({
            collection: collectionStub,
        } as any);

        const mockHocuspocus = {
            openDirectConnection: sinon.stub().resolves({
                document: {},
                transact: sinon.stub().callsFake(async (callback) => {
                    const mockDoc = {
                        getMap: () => ({ get: () => null, set: () => {} }),
                    };
                    await callback(mockDoc);
                }),
                disconnect: sinon.stub(),
            }),
        };

        app.use("/api", createSeedRouter(mockHocuspocus));
    });

    afterEach(() => {
        sinon.restore();
    });

    it("should return 400 when projectName is a number", async () => {
        const res = await request(app)
            .post("/api/seed")
            .set("Authorization", "Bearer valid-token")
            .send({
                projectName: 123,
                pages: [{ name: "Test Page", lines: ["Line 1"] }],
            });

        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("Invalid request body");
        expect(res.body.details.projectName).to.exist;
    });

    it("should return 400 when pages is invalid", async () => {
        const res = await request(app)
            .post("/api/seed")
            .set("Authorization", "Bearer valid-token")
            .send({
                projectName: "valid-project",
                pages: [{ invalid: "data" }],
            });

        expect(res.status).to.equal(400);
        expect(res.body.details.pages).to.exist;
    });
});
