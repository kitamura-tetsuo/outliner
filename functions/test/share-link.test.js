const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const functions = require("firebase-functions-test")();

describe("acceptProjectShareLink Logic Tests", () => {
  let admin;
  let myFunctions;
  let transactionUpdateSpy;
  let transactionSetSpy;

  // Mock Data
  let mockUserProjects = {};
  let mockProjectUsers = {};
  let mockShareLinks = {};

  beforeEach(() => {
    jest.resetModules();
    admin = require("firebase-admin");

    // Reset Mock Data
    mockUserProjects = {};
    mockProjectUsers = {
      projectP: {
        title: "Test Project",
        accessibleUserIds: ["owner"],
      },
    };
    mockShareLinks = {
      "valid-token": {
        projectId: "projectP",
        token: "valid-token",
        createdBy: "owner",
      },
      "token-for-missing-project": {
        projectId: "missingProject",
        token: "token-for-missing-project",
        createdBy: "owner",
      },
    };

    // Mock admin.auth
    jest.spyOn(admin, "auth").mockReturnValue({
      verifyIdToken: jest.fn().mockImplementation(async token => {
        if (token === "token-user1") { return { uid: "user1" }; }
        const error = new Error("Invalid token");
        error.code = "auth/invalid-id-token";
        throw error;
      }),
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

    jest.spyOn(admin, "firestore").mockReturnValue(mockDb);

    // Mock Collection References
    mockDb.collection.mockImplementation(name => {
      return {
        doc: jest.fn().mockImplementation(docId => {
          return {
            path: `${name}/${docId}`,
            get: jest.fn().mockImplementation(async () => {
              let data;
              if (name === "shareLinks") {
                data = mockShareLinks[docId];
              } else if (name === "projectUsers") {
                data = mockProjectUsers[docId];
              } else if (name === "userProjects") {
                data = mockUserProjects[docId];
              }

              if (data) {
                return {
                  exists: true,
                  data: () => data,
                  ref: { path: `${name}/${docId}` },
                };
              } else {
                return { exists: false, ref: { path: `${name}/${docId}` } };
              }
            }),
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

  it("Scenario A: Successfully join project via share link", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user1",
        token: "valid-token",
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

    await myFunctions.acceptProjectShareLink(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ projectId: "projectP" });

    // Verify User 1 was added to projectUsers
    // FieldValue.arrayUnion returns an object with elements property
    expect(transactionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "projectUsers/projectP" }),
      expect.objectContaining({
        accessibleUserIds: expect.objectContaining({
          elements: expect.arrayContaining(["user1"]),
        }),
      }),
    );

    // Verify Project P was added to userProjects (via set since user1 didn't exist in mock)
    expect(transactionSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "userProjects/user1" }),
      expect.objectContaining({
        userId: "user1",
        accessibleProjectIds: ["projectP"],
        projectTitles: { projectP: "Test Project" },
      }),
    );
  });

  it("Scenario B: Invalid token (Should return 404)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user1",
        token: "invalid-token",
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

    await myFunctions.acceptProjectShareLink(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid link" });
  });

  it("Scenario C: Project not found (Should return 404)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user1",
        token: "token-for-missing-project",
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

    await myFunctions.acceptProjectShareLink(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Project not found" });
  });

  it("Scenario D: Unauthenticated (Should return 401)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "invalid-token",
        token: "valid-token",
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

    await myFunctions.acceptProjectShareLink(req, res);

    // verifyIdToken throws Error("Invalid token") in mock.
    // Ideally we should match this error message or code.
    // In real env, it throws error with code auth/...
    // Let's assume we handle generic auth error or specific code.
    // For this test with mock throwing generic Error("Invalid token"),
    // we might need to update the code to check message or just return 401 for any error?
    // No, checking code is better.
    // But my mock throws generic Error.
    // I should update mock to throw Error with code property if I want to test that logic properly.
    // Or just check if res.status(401) is called.
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
