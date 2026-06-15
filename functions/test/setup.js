/* eslint-disable no-unused-vars */
// Jest test setup file
/* global jest, afterAll */
const { getApps, getApp, initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const adminAuth = require("firebase-admin/auth");
const adminFirestore = require("firebase-admin/firestore");
const adminStorage = require("firebase-admin/storage");
// Initialize Firebase Admin SDK for testing
if (!getApps().length) {
  initializeApp({
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
  await deleteApp(getApp());
});
