const { describe, it, expect, beforeEach, afterEach } = require("@jest/globals");
const admin = require("firebase-admin");

describe("admin.initializeApp try-catch tests", () => {
  beforeEach(() => {
    // Clear the require cache to allow re-evaluating index.js
    delete require.cache[require.resolve("../index.js")];
  });

  afterEach(async () => {
    // We do not delete apps to avoid interfering with test/setup.js
  });

  it("should catch error when initializing more than once", () => {
    // Force first initialization if it doesn't exist
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: "first-init" });
    }

    // Attempt to require index.js which will try to initialize again
    jest.isolateModules(() => {
      // It should not throw because index.js has try/catch around `admin.initializeApp`
      expect(() => {
        require("../index.js");
      }).not.toThrow();
    });
  });
});
