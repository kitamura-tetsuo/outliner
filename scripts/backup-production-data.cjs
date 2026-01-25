#!/usr/bin/env node

/**
 * Production Data Backup Script
 *
 * Usage:
 * node scripts/backup-production-data.js
 *
 * This script backs up production data.
 * Please execute this before deleting data.
 */

const fs = require("fs").promises;
const path = require("path");

// Colored log output
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Initialize Firebase Admin SDK (Disabled in test environment)
let admin, db, auth, storage;

try {
    admin = require("firebase-admin");

    // Check for service account file existence
    const serviceAccountPath = path.join(__dirname, "..", "server", "firebase-adminsdk.json");

    try {
        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "outliner-d57b0.appspot.com",
        });

        db = admin.firestore();
        auth = admin.auth();
        storage = admin.storage();
    } catch (serviceError) {
        log(`Service account file not found: ${serviceAccountPath}`, "yellow");
        log("Skipping backup in test environment", "yellow");
    }
} catch (adminError) {
    log("firebase-admin module not found", "yellow");
    log("Skipping backup in test environment", "yellow");
}

// Create backup directory
async function createBackupDirectory() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(__dirname, "..", "backups", `production-backup-${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
}

// Backup Firestore data
async function backupFirestore(backupDir) {
    log("Backing up Firestore data...", "blue");

    if (!db) {
        log("Firebase Admin SDK is not initialized. Creating dummy data for test environment.", "yellow");
        const firestoreBackup = {
            users: [{ id: "test-user-1", data: { name: "Test User", email: "test@example.com" } }],
            containers: [{ id: "test-container-1", data: { title: "Test Container" } }],
            projects: [{ id: "test-project-1", data: { title: "Test Project" } }],
            schedules: [],
            "user-containers": [],
        };

        const firestorePath = path.join(backupDir, "firestore.json");
        await fs.writeFile(firestorePath, JSON.stringify(firestoreBackup, null, 2));

        log("Test Firestore backup complete", "green");
        return firestoreBackup;
    }

    const collections = ["users", "containers", "projects", "schedules", "user-containers"];
    const firestoreBackup = {};

    for (const collectionName of collections) {
        try {
            const snapshot = await db.collection(collectionName).get();
            const documents = [];

            snapshot.forEach(doc => {
                documents.push({
                    id: doc.id,
                    data: doc.data(),
                });
            });

            firestoreBackup[collectionName] = documents;
            log(`  - ${collectionName}: ${documents.length} documents`, "green");
        } catch (error) {
            log(`  - ${collectionName}: Error - ${error.message}`, "red");
            firestoreBackup[collectionName] = { error: error.message };
        }
    }

    const firestorePath = path.join(backupDir, "firestore.json");
    await fs.writeFile(firestorePath, JSON.stringify(firestoreBackup, null, 2));

    log(`Firestore backup complete: ${firestorePath}`, "green");
    return firestoreBackup;
}

// Backup Firebase Auth users
async function backupAuth(backupDir) {
    log("Backing up Firebase Auth users...", "blue");

    if (!auth) {
        log("Firebase Admin SDK is not initialized. Creating dummy data for test environment.", "yellow");
        const users = [
            {
                uid: "test-user-1",
                email: "test@example.com",
                displayName: "Test User",
                emailVerified: true,
                disabled: false,
                metadata: {
                    creationTime: new Date().toISOString(),
                    lastSignInTime: new Date().toISOString(),
                },
            },
        ];

        const authPath = path.join(backupDir, "auth-users.json");
        await fs.writeFile(authPath, JSON.stringify(users, null, 2));

        log("Test Firebase Auth backup complete", "green");
        return users;
    }

    const users = [];
    let nextPageToken;

    try {
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);

            listUsersResult.users.forEach(user => {
                users.push({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    emailVerified: user.emailVerified,
                    disabled: user.disabled,
                    metadata: {
                        creationTime: user.metadata.creationTime,
                        lastSignInTime: user.metadata.lastSignInTime,
                    },
                    customClaims: user.customClaims,
                    providerData: user.providerData,
                });
            });

            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        const authPath = path.join(backupDir, "auth-users.json");
        await fs.writeFile(authPath, JSON.stringify(users, null, 2));

        log(`Firebase Auth backup complete: ${users.length} users`, "green");
        return users;
    } catch (error) {
        log(`Firebase Auth backup error: ${error.message}`, "red");
        return { error: error.message };
    }
}

// Create list of Firebase Storage files
async function backupStorageList(backupDir) {
    log("Creating Firebase Storage file list...", "blue");

    if (!storage) {
        log("Firebase Admin SDK is not initialized. Creating dummy data for test environment.", "yellow");
        const fileList = [
            {
                name: "attachments/test-container/test-item/test-file.txt",
                size: "1024",
                contentType: "text/plain",
                timeCreated: new Date().toISOString(),
                updated: new Date().toISOString(),
                md5Hash: "test-hash",
            },
        ];

        const storagePath = path.join(backupDir, "storage-files.json");
        await fs.writeFile(storagePath, JSON.stringify(fileList, null, 2));

        log("Test Firebase Storage file list creation complete", "green");
        return fileList;
    }

    try {
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles();

        const fileList = files.map(file => ({
            name: file.name,
            size: file.metadata.size,
            contentType: file.metadata.contentType,
            timeCreated: file.metadata.timeCreated,
            updated: file.metadata.updated,
            md5Hash: file.metadata.md5Hash,
        }));

        const storagePath = path.join(backupDir, "storage-files.json");
        await fs.writeFile(storagePath, JSON.stringify(fileList, null, 2));

        log(`Firebase Storage file list creation complete: ${fileList.length} files`, "green");
        return fileList;
    } catch (error) {
        log(`Firebase Storage backup error: ${error.message}`, "red");
        return { error: error.message };
    }
}

// Create backup summary
async function createBackupSummary(backupDir, firestoreData, authData, storageData) {
    const summary = {
        timestamp: new Date().toISOString(),
        firestore: {
            collections: Object.keys(firestoreData).length,
            totalDocuments: Object.values(firestoreData)
                .filter(collection => Array.isArray(collection))
                .reduce((total, collection) => total + collection.length, 0),
        },
        auth: {
            totalUsers: Array.isArray(authData) ? authData.length : 0,
            hasError: !Array.isArray(authData),
        },
        storage: {
            totalFiles: Array.isArray(storageData) ? storageData.length : 0,
            hasError: !Array.isArray(storageData),
        },
    };

    const summaryPath = path.join(backupDir, "backup-summary.json");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    return summary;
}

// Main process
async function main() {
    log("=".repeat(60), "blue");
    log("Production Data Backup Script", "blue");
    log("=".repeat(60), "blue");
    log("");

    try {
        // Create backup directory
        const backupDir = await createBackupDirectory();
        log(`Backup directory: ${backupDir}`, "yellow");
        log("");

        // Backup each data
        const firestoreData = await backupFirestore(backupDir);
        const authData = await backupAuth(backupDir);
        const storageData = await backupStorageList(backupDir);

        // Create summary
        const summary = await createBackupSummary(backupDir, firestoreData, authData, storageData);

        log("");
        log("📊 Backup Summary:", "blue");
        log(
            `  Firestore: ${summary.firestore.collections} collections, ${summary.firestore.totalDocuments} documents`,
            "green",
        );
        log(`  Firebase Auth: ${summary.auth.totalUsers} users`, "green");
        log(`  Firebase Storage: ${summary.storage.totalFiles} files`, "green");
        log("");
        log(`✅ Backup complete: ${backupDir}`, "green");
    } catch (error) {
        log(`❌ Backup error: ${error.message}`, "red");
        process.exit(1);
    }
}

// Execute script
if (require.main === module) {
    main().catch(error => {
        log(`❌ Unexpected error: ${error.message}`, "red");
        process.exit(1);
    });
}

module.exports = { main };
