const { describe, it, expect, afterAll, beforeAll, beforeEach } = require(
  "@jest/globals",
);
const admin = require("firebase-admin");
const functions = require("firebase-functions-test")();

// Mock Firestore before requiring index.js
const mockGet = jest.fn();
const mockDb = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  where: jest.fn().mockReturnThis(),
};
jest.spyOn(admin, "firestore").mockReturnValue(mockDb);

const myFunctions = require("../index");

describe("debugUserProjects Security", () => {
  let authSpy;

  beforeAll(() => {
    authSpy = jest.spyOn(admin, "auth");
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    functions.cleanup();
    authSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should return 400 if idToken is missing", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
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

    await myFunctions.debugUserProjects(req, res);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "ID token is required" });
  });

  it("should return 403 if user is not an admin", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
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

    await myFunctions.debugUserProjects(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: "Admin access required",
    });
  });

  it("should return 403 if in production environment", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
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

    // Simulate production environment
    const originalEnv = process.env.NODE_ENV;
    const originalEmulator = process.env.FUNCTIONS_EMULATOR;
    process.env.NODE_ENV = "production";
    delete process.env.FUNCTIONS_EMULATOR;

    try {
      await myFunctions.debugUserProjects(req, res);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Debug endpoint is disabled in production",
      });
    } finally {
      // Restore environment
      process.env.NODE_ENV = originalEnv;
      process.env.FUNCTIONS_EMULATOR = originalEmulator;
    }
  });

  it("should not expose environment variables in response", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
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
      email: "admin@example.com",
    });
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });

    // Mock successful DB results
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ some: "data" }),
    });
    // For the query result
    mockDb.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ some: "data" }),
    }).mockResolvedValueOnce({
      forEach: callback => {
        callback({ id: "p1", data: () => ({ title: "Project 1" }) });
      },
    });

    await myFunctions.debugUserProjects(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
    const response = jsonMock.mock.calls[0][0];
    expect(response.environment).toBeUndefined();
    expect(response.success).toBe(true);
    expect(response.userId).toBe("admin123");
  });
});
