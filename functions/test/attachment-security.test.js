const { describe, it, expect, afterAll, beforeEach } = require("@jest/globals");
const admin = require("firebase-admin");
const functions = require("firebase-functions-test")();

// Mock dependencies
const mockBucket = {
  file: jest.fn(),
  name: "test-bucket",
};
const mockFile = {
  save: jest.fn(),
  getSignedUrl: jest.fn().mockResolvedValue(["http://mock-url"]),
};

// Setup mocks
mockBucket.file.mockReturnValue(mockFile);
mockFile.save.mockResolvedValue();

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

describe("Attachment Security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBucket.file.mockReturnValue(mockFile);
    // Reset auth mock to return success
    mockAuth.verifyIdToken.mockResolvedValue({ uid: "test-user" });
  });

  afterAll(() => {
    functions.cleanup();
    jest.restoreAllMocks();
  });

  it("should force Content-Disposition: attachment for HTML files", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "c1",
        itemId: "i1",
        fileName: "evil.html",
        fileData: "PGh0bWw+PC9odG1sPg==",
      },
    };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.uploadAttachment(req, res);

    expect(mockFile.save).toHaveBeenCalled();
    const saveOptions = mockFile.save.mock.calls[0][1];

    expect(saveOptions).toBeDefined();
    expect(saveOptions.metadata).toBeDefined();
    expect(saveOptions.metadata.contentDisposition).toBe("attachment");
  });

  it("should allow inline for safe images (e.g. PNG)", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "c1",
        itemId: "i1",
        fileName: "nice.png",
        fileData:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.uploadAttachment(req, res);

    expect(mockFile.save).toHaveBeenCalled();
    const saveOptions = mockFile.save.mock.calls[0][1];

    expect(saveOptions).toBeDefined();
    expect(saveOptions.metadata).toBeDefined();
    expect(saveOptions.metadata.contentDisposition).toBe("inline");
    expect(saveOptions.metadata.contentType).toBe("image/png");
  });

  it("should NOT leak internal error details on upload failure", async () => {
    // Simulate a failure with sensitive internal details
    const sensitiveError = "Internal path /var/www/uploads/ failed. Database ID: db-prod-123";
    mockFile.save.mockRejectedValueOnce(new Error(sensitiveError));

    const req = {
      method: "POST",
      headers: { origin: "http://localhost:7090" },
      body: {
        idToken: "test-token",
        containerId: "c1",
        itemId: "i1",
        fileName: "test.txt",
        fileData: "dGVzdA==",
      },
    };

    let responseData = {};
    let statusCode = 0;

    const res = {
      set: jest.fn(),
      status: jest.fn().mockImplementation((code) => {
        statusCode = code;
        return res;
      }),
      json: jest.fn().mockImplementation((data) => {
        responseData = data;
        return res;
      }),
      on: jest.fn(),
      emit: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };

    await myFunctions.uploadAttachment(req, res);

    expect(statusCode).toBe(500);
    expect(responseData.error).toBe("Failed to upload attachment");

    // The security fix: verify details are NOT present
    expect(responseData.details).toBeUndefined();

    // Verify we didn't accidentally include the sensitive string anywhere in the response
    expect(JSON.stringify(responseData)).not.toContain("Internal path");
    expect(JSON.stringify(responseData)).not.toContain("db-prod-123");
  });
});
