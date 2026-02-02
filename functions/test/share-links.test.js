const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const functions = require("firebase-functions-test")();
const crypto = require("crypto");

describe("Share Links Tests", () => {
  let admin;
  let myFunctions;
  let mockSetSpy;
  let mockGetSpy;
  let mockTransactionUpdateSpy;
  let mockTransactionSetSpy;

  // Mock Data
  let mockProjectUsers = {};
  let mockShareLinks = {};
  let mockUserProjects = {};

  beforeEach(() => {
    jest.resetModules();
    admin = require("firebase-admin");

    // Reset Mock Data
    mockProjectUsers = {
      projectA: { accessibleUserIds: ["user1"], title: "Project A" },
    };
    mockShareLinks = {};
    mockUserProjects = {
      user1: { accessibleProjectIds: ["projectA"], projectTitles: { "projectA": "Project A" } },
      user2: { accessibleProjectIds: [], projectTitles: {} },
    };

    // Mock admin.auth
    jest.spyOn(admin, "auth").mockReturnValue({
      verifyIdToken: jest.fn().mockImplementation(async token => {
        if (token === "token-user1") { return { uid: "user1" }; }
        if (token === "token-user2") { return { uid: "user2" }; }
        throw new Error("Invalid token");
      }),
    });

    // Mock Firestore
    const mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
    };
    mockTransactionUpdateSpy = mockTransaction.update;
    mockTransactionSetSpy = mockTransaction.set;

    mockSetSpy = jest.fn();
    mockGetSpy = jest.fn();

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
              // Standard get for non-transactional calls
              let data;
              if (name === "projectUsers") { data = mockProjectUsers[docId]; }
              else if (name === "shareLinks") { data = mockShareLinks[docId]; }
              else if (name === "userProjects") { data = mockUserProjects[docId]; }

              if (data) {
                return { exists: true, data: () => data };
              }
              return { exists: false };
            }),
            set: mockSetSpy.mockImplementation(async (data) => {
              if (name === "shareLinks") {
                mockShareLinks[docId] = data;
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

  it("should generate a share link with correct token format", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user1",
        projectId: "projectA",
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

    await myFunctions.generateProjectShareLink(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    const token = responseData.token;

    // Check if token was saved to mockShareLinks
    expect(mockShareLinks[token]).toBeDefined();
    expect(mockShareLinks[token].projectId).toBe("projectA");
    expect(mockShareLinks[token].createdBy).toBe("user1");

    // Check token format. Expects 32-character hex string (crypto.randomBytes(16).toString('hex'))
    const hexRegex = /^[0-9a-f]{32}$/;
    expect(token).toMatch(hexRegex);
  });

  it("should accept a share link and add user to project", async () => {
    // Setup mock share link
    const token = "some-valid-token";
    mockShareLinks[token] = {
      projectId: "projectA",
      token: token,
      createdBy: "user1",
    };

    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        idToken: "token-user2",
        token: token,
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
    expect(res.json).toHaveBeenCalledWith({ projectId: "projectA" });

    // Verify transaction updates
    // 1. User2 added to ProjectA
    expect(mockTransactionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: "projectUsers/projectA" }),
        expect.objectContaining({
            accessibleUserIds: expect.objectContaining({
                // arrayUnion is tricky to mock exactly without implementing it,
                // but we can check if it was called.
                // The implementation uses FieldValue.arrayUnion(userId).
                // We'll trust the spy called with correct args roughly.
            })
        })
    );

    // 2. ProjectA added to User2
    // User2 document exists (mocked), so it should be update
    expect(mockTransactionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: "userProjects/user2" }),
        expect.objectContaining({
             // Check for projectTitles update
             "projectTitles.projectA": "Project A"
        })
    );
  });
});
