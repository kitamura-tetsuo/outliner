import admin from "firebase-admin";

async function getTestAuthToken(): Promise<string> {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099";
    const host = authHost.startsWith("http") ? authHost : `http://${authHost}`;
    const apiKey = "fake-api-key";
    const url = `${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    console.log(`Fetching token from ${url}...`);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "test@example.com",
                password: "password",
                returnSecureToken: true,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Auth fetch failed: ${text}`);
        }

        const data: any = await response.json();
        return data.idToken;
    } catch (e) {
        console.error("Failed to get token", e);
        throw e;
    }
}

async function main() {
    console.log("Initializing admin app...");
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || "test-project-id",
        });
    }

    try {
        const token = await getTestAuthToken();
        console.log("Token obtained, verifying...");
        const decoded = await admin.auth().verifyIdToken(token);
        console.log("Verification success:", decoded.uid);
    } catch (e) {
        console.error("Verification failed:", e);
    }
}

main();
