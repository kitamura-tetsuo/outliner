import { getLogger } from "../../lib/logger";
const logger = getLogger("productionSetup");

import { afterAll, beforeAll } from "vitest";

// Production environment test setup
beforeAll(async () => {
    // Verify that Production Cloud Backend Servers are running
    try {
        const response = await fetch("http://localhost:57000/api/health");
        if (!response.ok) {
            throw new Error("Firebase Functions not available");
        }
        logger.debug("✓ Firebase Functions (Production) is running");
    } catch (error) {
        logger.error("❌ Firebase Functions (Production) is not running");
        logger.error("Please start Production Cloud Backend Servers first");
        throw error;
    }

    // Check SvelteKit server (temporarily disabled)
    try {
        const response = await fetch("http://localhost:7073/");
        if (!response.ok) {
            logger.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
        } else {
            logger.debug("✓ SvelteKit server (Production) is running");
        }
    } catch {
        logger.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
    }
});

afterAll(async () => {
    // Cleanup for production environment is not required
    // Since production Firebase Auth is used, test users must be deleted manually
    logger.debug("Production tests completed");
});
