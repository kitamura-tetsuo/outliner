const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

async function permanentlyDeleteProject(projectId) {
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
}


exports.purgeDeletedProjects = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
    const db = admin.firestore();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const snapshot = await db.collection("projects").where("deletedAt", "<=", thirtyDaysAgo).get();

    if (snapshot.empty) {
        console.log("No projects to purge.");
        return null;
    }

    const promises = [];
    snapshot.forEach((doc) => {
        promises.push(permanentlyDeleteProject(doc.id));
    });

    return Promise.all(promises);
});
