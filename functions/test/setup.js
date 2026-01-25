// Jest test setup file
/* global jest, afterAll */
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK for testing
if (!admin.apps.length) {
  admin.initializeApp({
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
  await admin.app().delete();
});
