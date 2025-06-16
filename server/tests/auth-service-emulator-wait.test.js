const { describe, it, before } = require("mocha");
const { expect } = require("chai");
const admin = require("firebase-admin");

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";

describe("Firebase emulator connection (API-0002)", function () {
  this.timeout(10000);

  before(function () {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: "demo-test" });
    }
    process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;
  });

  it("lists users from the Auth emulator", async function () {
    const list = await admin.auth().listUsers(10);
    expect(list.users).to.be.an("array");
  });
});
