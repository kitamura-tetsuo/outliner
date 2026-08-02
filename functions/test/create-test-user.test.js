const { describe, it, expect, afterAll, beforeAll } = require("@jest/globals");
const functions = require("firebase-functions-test")();
const myFunctions = require("../index");

describe("createTestUser Security Tests", () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
    functions.cleanup();
  });

  it("should return 403 if ALLOW_TEST_USERS is not true", async () => {
    process.env.ALLOW_TEST_USERS = "false";
    const req = {
      method: "POST",
      body: { email: "test@test.com", password: "pass" },
      headers: { origin: "http://localhost:54000" }
    };
    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    };

    await myFunctions.createTestUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "Test user creation is disabled",
    }));
  });
});
