// Jest test setup file
/* global jest, afterAll */

// Initialize Firebase Admin SDK for testing
if (require("firebase-admin/app").getApps().length === 0) {
  require("firebase-admin/app").initializeApp({
    projectId: "test-project-id",
  });
}

// Use Firestore emulator for testing
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

// Set global test timeout
jest.setTimeout(30000);

// Cleanup after tests
afterAll(async () => {
  // Cleanup Firebase Admin SDK
  try { await require("firebase-admin/app").getApp().delete(); } catch { /* ignore */ }
});
