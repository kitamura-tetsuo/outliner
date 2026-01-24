const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const functions = require("firebase-functions-test")();

describe("deleteProject Logic Tests", () => {
  let admin;
  let myFunctions;
  let transactionUpdateSpy;
  let transactionDeleteSpy;
  let transactionGetSpy;

  // Mock Data
  let mockUserProjects = {};
  let mockProjectUsers = {};

  beforeEach(() => {
    jest.resetModules();
    admin = require("firebase-admin");

    // Reset Mock Data
    mockUserProjects = {
      "user1": { accessibleProjectIds: ["projectP"], defaultProjectId: "projectP" },
      "user2": { accessibleProjectIds: ["projectP"], defaultProjectId: "projectP" },
    };
    mockProjectUsers = {
      "projectP": { accessibleUserIds: ["user1", "user2"] },
    };

    // Mock admin.auth
    jest.spyOn(admin, "auth").mockReturnValue({
      verifyIdToken: jest.fn().mockImplementation(async (token) => {
        if (token === "token-user1") return { uid: "user1" };
        if (token === "token-user2") return { uid: "user2" };
        throw new Error("Invalid token");
      }),
    });

    // Mock Firestore
    const mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      set: jest.fn(),
    };
    transactionUpdateSpy = mockTransaction.update;
    transactionDeleteSpy = mockTransaction.delete;
    transactionGetSpy = mockTransaction.get;

    const mockDb = {
      collection: jest.fn(),
      runTransaction: jest.fn(async callback => {
        return callback(mockTransaction);
      }),
    };

    jest.spyOn(admin, "firestore").mockReturnValue(mockDb);

    // Mock Collection References
    mockDb.collection.mockImplementation(name => {
      return {
        doc: jest.fn().mockImplementation(docId => {
          return {
            path: `${name}/${docId}`,
            // We don't need real get/set here as transaction methods are used
          };
        }),
      };
    });

    // Mock transaction.get behavior
    mockTransaction.get.mockImplementation(ref => {
      const [collection, docId] = ref.path.split("/");
      let data;
      if (collection === "userProjects") {
        data = mockUserProjects[docId];
      } else if (collection === "projectUsers") {
        data = mockProjectUsers[docId];
      }

      if (data) {
        return Promise.resolve({
          exists: true,
          data: () => data,
          ref: ref,
        });
      } else {
        return Promise.resolve({ exists: false, ref: ref });
      }
    });

    // Require index.js after mocking
    myFunctions = require("../index");
  });

  afterAll(() => {
    functions.cleanup();
    jest.restoreAllMocks();
  });

  it("Scenario A: User 1 leaves shared Project P (Project should remain)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user1",
        projectId: "projectP",
      },
    };

    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      end: jest.fn(),
    };

    await myFunctions.deleteProject(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Verify User 1 was updated (removed from project)
    expect(transactionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "userProjects/user1" }),
      expect.objectContaining({
        accessibleProjectIds: [], // Should be empty
        defaultProjectId: null,
      })
    );

    // Verify Project P was updated (User 1 removed from accessibleUserIds)
    expect(transactionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "projectUsers/projectP" }),
      expect.objectContaining({
        accessibleUserIds: ["user2"],
      })
    );

    // Verify Project P was NOT deleted
    expect(transactionDeleteSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "projectUsers/projectP" })
    );
  });

  it("Scenario B: Last user leaves Project P (Project should be deleted)", async () => {
    // Scenario: user2 is the only remaining user in projectP
    // Modify mock state so only user2 is in projectP
    mockProjectUsers["projectP"].accessibleUserIds = ["user2"];
    // Update user1 to not be in projectP (irrelevant for this test but good for consistency)
    mockUserProjects["user1"].accessibleProjectIds = [];

    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user2",
        projectId: "projectP",
      },
    };

    const res = {
      set: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      end: jest.fn(),
    };

    await myFunctions.deleteProject(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Verify User 2 was updated
    expect(transactionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "userProjects/user2" }),
      expect.objectContaining({
        accessibleProjectIds: [],
        defaultProjectId: null,
      })
    );

    // Verify Project P was DELETED
    expect(transactionDeleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "projectUsers/projectP" })
    );

    // Verify Project P was NOT updated (it should be deleted instead)
    expect(transactionUpdateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "projectUsers/projectP" }),
      expect.anything()
    );
  });
});
