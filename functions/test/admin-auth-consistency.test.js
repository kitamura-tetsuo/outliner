const { describe, it, expect, afterAll } = require("@jest/globals");
const admin = require("firebase-admin");
const functions = require("firebase-functions-test")();
const myFunctions = require("../index");

describe("Admin Authorization Consistency", () => {
  afterAll(() => {
    functions.cleanup();
  });

  it("adminUserList should accept user with role='admin' claim", async () => {
    // Mock Request/Response
    const req = {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: {},
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
    };

    // Spy on admin.auth()
    const authSpy = jest.spyOn(admin, "auth");

    // Create a mock auth service
    const verifyIdTokenMock = jest.fn().mockResolvedValue({
      uid: "admin-user",
      role: "admin",
    });

    const getUserMock = jest.fn().mockResolvedValue({
      uid: "admin-user",
      customClaims: {
        role: "admin",
        // Missing "admin: true" which current code expects
      },
    });

    const listUsersMock = jest.fn().mockResolvedValue({
      users: [],
    });

    // Mock the auth() call to return our mock service
    authSpy.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
      getUser: getUserMock,
      listUsers: listUsersMock,
    });

    await myFunctions.adminUserList(req, res);

    // After fix, we expect 200.
    // Before fix, this will fail (it returns 403).
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
    }));

    authSpy.mockRestore();
  });
});
