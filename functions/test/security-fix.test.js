const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const functions = require("firebase-functions-test")();
const myFunctions = require("../index");

describe("Security Fix: deleteAllProductionData", () => {

  afterAll(() => {
    functions.cleanup();
  });

  it("should reject invalid token with 401", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "wrong-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM"
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: statusMock,
      json: jsonMock,
      end: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("should accept valid token (and return 400 in test env)", async () => {
    // In test env, we expect 400 because it's not production
    // But getting 400 means we passed the token check!

    // NOTE: Before the fix, this test should actually FAIL if we pass "test-admin-token"
    // because the code expects "ADMIN_DELETE_ALL_DATA_2024".
    // After the fix, it should PASS with "test-admin-token".

    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "test-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM"
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: statusMock,
      json: jsonMock,
      end: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };

    await myFunctions.deleteAllProductionData(req, res);

    // If verification passes, it checks env and returns 400
    // If verification fails, it returns 401
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
       error: "This endpoint only works in production environment"
    }));
  });
});
