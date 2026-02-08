import { afterAll, beforeAll } from "vitest";

// Production environment test setup
beforeAll(async () => {
    // Verify that Production Cloud Backend Servers are running
    try {
        const response = await fetch("http://localhost:57000/api/health");
        if (!response.ok) {
            throw new Error("Firebase Functions not available");
        }
        console.log("✓ Firebase Functions (Production) is running");
    } catch (error) {
        console.error("❌ Firebase Functions (Production) is not running");
        console.error("Please start Production Cloud Backend Servers first");
        throw error;
    }

    // Check SvelteKit server (temporarily disabled)
    try {
        const response = await fetch("http://localhost:7073/");
        if (!response.ok) {
            console.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
        } else {
            console.log("✓ SvelteKit server (Production) is running");
        }
    } catch {
        console.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
    }
});

afterAll(async () => {
    // Cleanup for production environment is not required
    // Since production Firebase Auth is used, test users must be deleted manually
    console.log("Production tests completed");
});
