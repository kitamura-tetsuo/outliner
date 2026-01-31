const { describe, it, expect, afterAll, beforeAll } = require("@jest/globals");
const admin = require("firebase-admin");
const functions = require("firebase-functions-test")();
const myFunctions = require("../index");

describe("Security Fix: deleteAllProductionData", () => {
  let authSpy;

  beforeAll(() => {
    authSpy = jest.spyOn(admin, "auth");
  });

  afterAll(() => {
    functions.cleanup();
    authSpy.mockRestore();
  });

  it("should reject missing ID token with 401", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "test-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM",
        // No idToken
      },
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
      emit: jest.fn(),
    };

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("should reject invalid ID token with 401", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "test-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM",
        idToken: "invalid-token",
      },
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
      emit: jest.fn(),
    };

    // Mock verifyIdToken failure
    const verifyIdTokenMock = jest.fn().mockRejectedValue(
      new Error("Invalid token"),
    );
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Authentication failed" });
  });

  it("should reject non-admin user with 403", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "test-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM",
        idToken: "valid-user-token",
      },
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
      emit: jest.fn(),
    };

    // Mock verifyIdToken success but NOT admin
    const verifyIdTokenMock = jest.fn().mockResolvedValue({
      uid: "user123",
      role: "user", // Not admin
    });
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: "Admin privileges required",
    });
  });

  it("should reject invalid adminToken (with valid Admin ID token) with 401", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "wrong-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM",
        idToken: "valid-admin-token",
      },
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
      emit: jest.fn(),
    };

    // Mock verifyIdToken success AND admin
    const verifyIdTokenMock = jest.fn().mockResolvedValue({
      uid: "admin123",
      role: "admin",
    });
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("should accept valid request (valid Admin ID token + valid adminToken) (and return 400 in test env)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        adminToken: "test-admin-token",
        confirmationCode: "DELETE_ALL_PRODUCTION_DATA_CONFIRM",
        idToken: "valid-admin-token",
      },
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
      emit: jest.fn(),
    };

    // Mock verifyIdToken success AND admin
    const verifyIdTokenMock = jest.fn().mockResolvedValue({
      uid: "admin123",
      role: "admin",
    });
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });

    await myFunctions.deleteAllProductionData(req, res);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: "This endpoint only works in production environment",
    }));
  });
});
