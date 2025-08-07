const test = require("firebase-functions-test")({
  databaseURL: "https://not-a-project.firebaseio.com",
  storageBucket: "not-a-project.appspot.com",
  projectId: "not-a-project",
}, "path/to/serviceAccountKey.json");
const admin = require("firebase-admin");
const { expect } = require("@jest/globals");

// Mock the dependencies
jest.mock("ical-generator", () => {
  const mIcal = {
    createEvent: jest.fn(),
    toString: jest.fn(() => "VCALENDAR"),
  };
  return jest.fn(() => mIcal);
});

describe("Cloud Functions", () => {
  let myFunctions;
  let db;

  beforeAll(() => {
    // Initialize the test environment
    myFunctions = require("../index.js");
    db = admin.firestore();
  });

  afterAll(() => {
    // Clean up the test environment
    test.cleanup();
  });

  describe("exportSchedules", () => {
    it("should generate an iCal file with the correct content", async () => {
      // Mock the request and response objects
      const req = {
        method: "POST",
        body: {
          idToken: "test-token",
          pageId: "test-page-id",
        },
        headers: {
          origin: "http://localhost:7090",
        },
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        on: jest.fn(),
      };

      // Mock the Firestore snapshot
      const snapshot = {
        forEach: callback => {
          callback({
            id: "1",
            data: () => ({
              strategy: "test-strategy",
              nextRunAt: { toDate: () => new Date() },
            }),
          });
        },
      };

      // Mock the Firestore query
      db.collection = jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(snapshot)),
              })),
            })),
          })),
        })),
      }));

      // Mock the auth check
      admin.auth = jest.fn(() => ({
        verifyIdToken: jest.fn(() => Promise.resolve({ uid: "test-uid" })),
      }));

      // Call the function
      await myFunctions.exportSchedules(req, res);

      // Verify the response
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/calendar;charset=utf-8",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="schedules.ics"',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("VCALENDAR");
    });
  });
});
