const admin = require("firebase-admin");

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
console.log(`Using credentials from: ${serviceAccountPath}`);
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const userId = "KmlyU2Cxljd5GB4IXjdKhdbJa272";
const projectId = "5189c058-e27c-4962-9366-d5d970538a2e"; // Default Project from userProjects list

async function repair() {
    console.log(`Repairing access for Project ${projectId} and User ${userId}...`);

    // 1. Ensure projectUsers doc exists
    const projectRef = db.collection("projectUsers").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
        console.log("projectUsers doc missing. Creating...");
        await projectRef.set({
            projectId: projectId,
            accessibleUserIds: [userId],
            ownerUserId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("Created projectUsers doc.");
    } else {
        console.log("projectUsers doc exists. Updating...");
        await projectRef.update({
            accessibleUserIds: admin.firestore.FieldValue.arrayUnion(userId),
        });
        console.log("Updated projectUsers doc.");
    }

    // 2. Ensure containerUsers (Legacy) doc exists (for dual compat)
    const containerRef = db.collection("containerUsers").doc(projectId);
    const containerDoc = await containerRef.get();

    if (!containerDoc.exists) {
        console.log("containerUsers doc missing. Creating...");
        await containerRef.set({
            containerId: projectId,
            accessibleUserIds: [userId],
            ownerUserId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("Created containerUsers doc.");
    } else {
        await containerRef.update({
            accessibleUserIds: admin.firestore.FieldValue.arrayUnion(userId),
        });
        console.log("Updated containerUsers doc.");
    }

    console.log("Repair complete.");
}

repair().catch(console.error);
