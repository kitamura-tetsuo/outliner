const { describe, it, beforeEach, afterEach } = require("mocha");
const { expect } = require("chai");
const sinon = require("sinon");
const request = require("supertest");
const admin = require("firebase-admin");

// Use the Express app defined for testing
const app = require("./auth-service-test-helper");

describe("/api/get-container-users admin role check (API-0003)", function () {
    let verifyStub;
    let docStub;

    beforeEach(function () {
        verifyStub = sinon.stub(admin.auth(), "verifyIdToken");
        const firestore = admin.firestore();
        const collectionStub = sinon.stub(firestore, "collection");
        const docRef = { get: sinon.stub() };
        collectionStub.withArgs("containerUsers").returns({ doc: sinon.stub().withArgs("test-container").returns(docRef) });
        docStub = docRef.get;
    });

    afterEach(function () {
        sinon.restore();
    });

    it("returns 403 when user is not admin", async function () {
        verifyStub.resolves({ uid: "user1", role: "user" });

        const res = await request(app)
            .post("/api/get-container-users")
            .send({ idToken: "token", containerId: "test-container" });

        expect(res.status).to.equal(403);
        expect(res.body).to.have.property("error", "Admin privileges required");
    });

    it("returns user list when admin", async function () {
        verifyStub.resolves({ uid: "admin1", role: "admin" });
        docStub.resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["u1", "u2"] }),
        });

        const res = await request(app)
            .post("/api/get-container-users")
            .send({ idToken: "token", containerId: "test-container" });

        expect(res.status).to.equal(200);
        expect(res.body.users).to.deep.equal(["u1", "u2"]);
    });
});
