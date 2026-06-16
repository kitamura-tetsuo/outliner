// Jest test setup file
/* global jest, afterAll */
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK for testing
if (admin.apps === undefined && typeof admin.getApps === "function" ? admin.getApps().length === 0 : admin.apps && admin.apps.length === 0) {
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
  if (admin.app) { await admin.app().delete(); } else { await Promise.all(admin.getApps().map(app => app.delete())); }
});
