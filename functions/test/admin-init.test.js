/* eslint-disable no-unused-vars */
const { getApps, getApp, initializeApp, deleteApp } = require(
  "firebase-admin/app",
);
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const adminAuth = require("firebase-admin/auth");
const adminFirestore = require("firebase-admin/firestore");
const adminStorage = require("firebase-admin/storage");
const { describe, it, expect, beforeEach, afterEach } = require(
  "@jest/globals",
);
describe("initializeApp try-catch tests", () => {
  beforeEach(() => {
    // Clear the require cache to allow re-evaluating index.js
    delete require.cache[require.resolve("../index.js")];
  });

  afterEach(async () => {
    // We do not delete apps to avoid interfering with test/setup.js
  });

  it("should catch error when initializing more than once", () => {
    // Force first initialization if it doesn't exist
    if (!getApps().length) {
      initializeApp({ projectId: "first-init" });
    }

    // Attempt to require index.js which will try to initialize again
    jest.isolateModules(() => {
      // It should not throw because index.js has try/catch around `initializeApp`
      expect(() => {
        require("../index.js");
      }).not.toThrow();
    });
  });
});
