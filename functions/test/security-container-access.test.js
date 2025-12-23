const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const functions = require("firebase-functions-test")();

// Mock dependencies before requiring index
describe("Vulnerability Reproduction: Insecure Direct Object Reference in saveContainer", () => {
  let admin;
  let myFunctions;
  let authSpy;
  let firestoreSpy;
  let transactionUpdateSpy;
  let transactionSetSpy;

  beforeEach(() => {
    jest.resetModules();
    admin = require("firebase-admin");

    // Mock admin.auth
    authSpy = jest.spyOn(admin, "auth").mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: "attacker-user" }),
    });

    // Mock Firestore
    const mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
    };
    transactionUpdateSpy = mockTransaction.update;
    transactionSetSpy = mockTransaction.set;

    const mockDb = {
      collection: jest.fn(),
      runTransaction: jest.fn(async callback => {
        return callback(mockTransaction);
      }),
    };

    firestoreSpy = jest.spyOn(admin, "firestore").mockReturnValue(mockDb);

    // Setup mocks for collections and docs
    const mockUserContainersDoc = {
      exists: true,
      data: () => ({ accessibleContainerIds: [] }),
      ref: { path: "userContainers/attacker-user" },
    };

    const mockContainerUsersDoc = {
      exists: true, // The container ALREADY EXISTS
      data: () => ({ accessibleUserIds: ["victim-user"] }), // It belongs to victim
      ref: { path: "containerUsers/target-container-id" },
    };

    const mockUserContainersRef = {
      get: jest.fn().mockResolvedValue(mockUserContainersDoc),
      path: "userContainers/attacker-user",
    };

    const mockContainerUsersRef = {
      get: jest.fn().mockResolvedValue(mockContainerUsersDoc),
      path: "containerUsers/target-container-id",
    };

    mockDb.collection.mockImplementation(name => {
      if (name === "userContainers") {
        return {
          doc: jest.fn().mockReturnValue(mockUserContainersRef),
        };
      }
      if (name === "containerUsers") {
        return {
          doc: jest.fn().mockReturnValue(mockContainerUsersRef),
        };
      }
      return {
        doc: jest.fn(),
      };
    });

    // Mock transaction.get behavior
    mockTransaction.get.mockImplementation(ref => {
      if (ref.path === "userContainers/attacker-user") {
        return Promise.resolve(mockUserContainersDoc);
      }
      if (ref.path === "containerUsers/target-container-id") {
        return Promise.resolve(mockContainerUsersDoc);
      }
      return Promise.resolve({ exists: false });
    });

    // Require index.js after mocking
    myFunctions = require("../index");
  });

  afterAll(() => {
    functions.cleanup();
    jest.restoreAllMocks();
  });

  it("allows an attacker to add themselves to an existing container they don't own", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "valid-token",
        containerId: "target-container-id",
      },
    };

    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      get: jest.fn(),
      removeHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      end: jest.fn(),
    };

    await myFunctions.saveContainer(req, res);

    // Expect 500 error because we throw an Error in the transaction which is caught and returns 500
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "Failed to save container ID",
    }));

    // Verify attacker was NOT added (update should not be called for containerUsers)
    expect(transactionUpdateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "containerUsers/target-container-id" }),
      expect.anything(),
    );
  });
});
