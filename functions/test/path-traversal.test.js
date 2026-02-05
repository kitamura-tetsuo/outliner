const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const admin = require("firebase-admin");
const functions = require("firebase-functions-test")();

// Mock dependencies
const mockBucket = {
  file: jest.fn(),
  name: "test-bucket",
  getFiles: jest.fn(),
};
const mockFile = {
  save: jest.fn(),
  delete: jest.fn(),
  getSignedUrl: jest.fn().mockResolvedValue(["http://mock-url"]),
};

// Setup mocks
mockBucket.file.mockReturnValue(mockFile);
mockFile.save.mockResolvedValue();
mockFile.delete.mockResolvedValue();
mockBucket.getFiles.mockResolvedValue([[]]);

// Mock admin.storage
jest.spyOn(admin, "storage").mockReturnValue({
  bucket: jest.fn().mockReturnValue(mockBucket),
});

// Mock Auth verifyIdToken
const mockAuth = {
  verifyIdToken: jest.fn().mockResolvedValue({ uid: "test-user" }),
  getUser: jest.fn(),
};
jest.spyOn(admin, "auth").mockReturnValue(mockAuth);

// Set NODE_ENV to test to bypass container access checks
process.env.NODE_ENV = "test";

const myFunctions = require("../index");

describe("Path Traversal Vulnerability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBucket.file.mockReturnValue(mockFile);
    mockAuth.verifyIdToken.mockResolvedValue({ uid: "test-user" });
  });

  afterAll(() => {
    functions.cleanup();
    jest.restoreAllMocks();
  });

  it("should REJECT uploadAttachment with traversal in itemId", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "c1",
        itemId: "../other-container",
        fileName: "malicious.png",
        fileData:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    };

    let statusCode;
    let responseData;

    const res = {
      set: jest.fn(),
      status: jest.fn().mockImplementation(code => {
        statusCode = code;
        return res;
      }),
      json: jest.fn().mockImplementation(data => {
        responseData = data;
        return res;
      }),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.uploadAttachment(req, res);

    // Expect rejection due to security fix (this test is expected to fail before fix)
    // If vulnerable, it saves the file.
    if (statusCode === 200) {
      // It was accepted (VULNERABLE)
      // Assert that the path was indeed traversed
      const savePath = mockBucket.file.mock.calls[0][0];
      // Depending on implementation, it might normalize or not.
      // But we expect it to contain the traversal string.
      expect(savePath).toContain(
        "attachments/c1/../other-container/malicious.png",
      );

      // We manually fail the test to indicate vulnerability needs fixing
      // But for the purpose of "reproduction", we want to confirm it fails to REJECT.
      // So we expect statusCode to be 400.
    }

    expect(statusCode).toBe(400);
    expect(responseData.error).toMatch(
      /Invalid ID|Invalid request|contains invalid characters/,
    );
  });

  it("should REJECT deleteAttachment with traversal in containerId", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "../system",
        itemId: "i1",
        fileName: "config.json",
      },
    };

    let statusCode;
    let responseData;

    const res = {
      set: jest.fn(),
      status: jest.fn().mockImplementation(code => {
        statusCode = code;
        return res;
      }),
      json: jest.fn().mockImplementation(data => {
        responseData = data;
        return res;
      }),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.deleteAttachment(req, res);

    expect(statusCode).toBe(400);
    expect(responseData.error).toMatch(
      /Invalid ID|Invalid request|contains invalid characters/,
    );
  });

  it("should REJECT listAttachments with traversal in itemId", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "c1",
        itemId: "../secret-folder",
      },
    };

    let statusCode;
    let responseData;

    const res = {
      set: jest.fn(),
      status: jest.fn().mockImplementation(code => {
        statusCode = code;
        return res;
      }),
      json: jest.fn().mockImplementation(data => {
        responseData = data;
        return res;
      }),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.listAttachments(req, res);

    expect(statusCode).toBe(400);
    expect(responseData.error).toMatch(
      /Invalid ID|Invalid request|contains invalid characters/,
    );
  });
});
