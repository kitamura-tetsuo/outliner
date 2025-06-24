// Firebase Auth Emulator Test User Setup
const admin = require("firebase-admin");
const http = require("http");
require("dotenv").config();

// Check if Firebase Auth emulator is running
const checkEmulatorRunning = (host = "localhost", port = 59099) => {
    return new Promise(resolve => {
        const req = http.request({
            method: "GET",
            host,
            port,
            path: "/",
            timeout: 1000,
        }, res => {
            // Response received, emulator is running
            resolve(true);
        });

        req.on("error", () => {
            // Error connecting, emulator is not running
            resolve(false);
        });

        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
};

// Firebase Admin initialization for emulator
const initializeAdminEmulator = (host, port) => {
    try {
        // Check if already initialized
        if (admin.apps.length === 0) {
            admin.initializeApp({
                projectId: "demo-project",
            });
        }

        // Point to the Auth emulator
        process.env.FIREBASE_EMULATOR_HOST = host;
        process.env.AUTH_EMULATOR_PORT = String(port);
        console.log(`Setting Auth emulator host to: ${host}:${port}`);
    }
    catch (error) {
        console.error("Error initializing Firebase Admin:", error);
        throw error;
    }
};

// Create a test user in Firebase Auth emulator
const createTestUser = async () => {
    // Check if emulator is running on possible hosts
    const hostOptions = [
        { host: "firebase-emulator", port: 59099 },
        { host: "localhost", port: 59099 },
        { host: "localhost", port: 6499 }, // Host port mapping
        { host: "172.18.0.2", port: 59099 }, // Direct IP of emulator container
        { host: "172.20.0.3", port: 59099 }, // Direct IP of emulator container on firebase-network
        { host: "devcontainer-firebase-emulator-1", port: 59099 }, // Container name
    ];

    let emulatorHost, emulatorPort, isRunning = false;

    for (const option of hostOptions) {
        console.log(`Checking emulator at ${option.host}:${option.port}...`);
        isRunning = await checkEmulatorRunning(option.host, option.port);
        if (isRunning) {
            emulatorHost = option.host;
            emulatorPort = option.port;
            console.log(`Firebase Auth emulator is running at ${emulatorHost}:${emulatorPort}`);
            break;
        }
    }

    if (!isRunning) {
        console.error(`Firebase Auth emulator is not running on any host`);
        console.error("Please make sure the Firebase emulator container is running");
        throw new Error("Firebase Auth emulator not running");
    }

    try {
        initializeAdminEmulator(emulatorHost, emulatorPort);

        const testEmail = "test@example.com";
        const testPassword = "password";

        // Check if user already exists
        try {
            const userRecord = await admin.auth().getUserByEmail(testEmail);
            console.log(`Test user already exists: ${userRecord.uid}`);
            return userRecord;
        }
        catch (error) {
            // User doesn't exist, continue to create
            if (error.code !== "auth/user-not-found") {
                throw error;
            }
        }

        // Create the test user
        const userRecord = await admin.auth().createUser({
            email: testEmail,
            password: testPassword,
            displayName: "Test User",
            emailVerified: true,
        });

        console.log(`Successfully created test user: ${userRecord.uid}`);
        return userRecord;
    }
    catch (error) {
        console.error("Error creating test user:", error);
        throw error;
    }
};

// If this script is run directly
if (require.main === module) {
    createTestUser()
        .then(() => {
            console.log("Test user setup completed");
            process.exit(0);
        })
        .catch(error => {
            console.error("Test user setup failed:", error);
            process.exit(1);
        });
}

module.exports = { createTestUser, initializeAdminEmulator, checkEmulatorRunning };
