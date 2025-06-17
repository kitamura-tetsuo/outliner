const { describe, it, before, beforeEach } = require("mocha");
const { expect } = require("chai");
const admin = require("firebase-admin");
const request = require("supertest");

const API_PORT = process.env.TEST_API_PORT || 7091;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";

async function signInWithCustomToken(customToken) {
    const url = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const data = await res.json();
    return data.idToken;
}

async function createUser(role) {
    const email = `user-${role}-${Date.now()}@example.com`;
    const userRecord = await admin.auth().createUser({ email, password: "pw12345" });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });
    const customToken = await admin.auth().createCustomToken(userRecord.uid, { role });
    const idToken = await signInWithCustomToken(customToken);
    return { userRecord, idToken };
}

let adminUser;
let normalUser;
let containerId;

before(async function () {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:58080";
    if (admin.apps.length === 0) {
        const serviceAccount = require("../firebase-adminsdk.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id,
        });
    }
    adminUser = await createUser("admin");
    normalUser = await createUser("user");
});

beforeEach(async function () {
    containerId = `container-${Date.now()}`;
    await admin.firestore().collection("containerUsers").doc(containerId).set({
        accessibleUserIds: [adminUser.userRecord.uid, normalUser.userRecord.uid],
    });
});

describe("/api/get-container-users admin check (API-0003)", function () {
    it("admin can list users", async function () {
        const res = await request(API_BASE_URL)
            .post("/api/get-container-users")
            .send({ idToken: adminUser.idToken, containerId })
            .expect(200);

        expect(res.body).to.have.property("users");
        expect(res.body.users).to.include(adminUser.userRecord.uid);
        expect(res.body.users).to.include(normalUser.userRecord.uid);
    });

    it("non-admin user is forbidden", async function () {
        await request(API_BASE_URL)
            .post("/api/get-container-users")
            .send({ idToken: normalUser.idToken, containerId })
            .expect(403);
    });
});
