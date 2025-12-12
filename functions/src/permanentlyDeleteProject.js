const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

exports.permanentlyDeleteProject = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const projectId = data.projectId;
    if (!projectId) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a \"projectId\" argument.");
    }

    // Delete from Yjs
    const yjsUrl = process.env.YJS_URL || "http://localhost:3000";
    const yjsSecretKey = process.env.YJS_SECRET_KEY || "default-secret-key";
    const docName = `projects/${projectId}`;

    await fetch(`${yjsUrl}/docs/${docName}`, {
        method: "DELETE",
        headers: {
            "x-secret-key": yjsSecretKey,
        },
    });

    // Now, delete the firestore document
    const db = admin.firestore();
    const projectRef = db.collection("projects").doc(projectId);
    await projectRef.delete();

    return { success: true };
});
