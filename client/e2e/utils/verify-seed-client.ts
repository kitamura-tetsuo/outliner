/**
 * Simple verification script for HTTP-based seeding
 * This bypasses authentication for testing purposes
 */

import { SeedClient } from "./seedClient";

async function main() {
    console.log("Testing HTTP-based seeding...");

    // For testing, we'll use a dummy token (server should accept it in test mode)
    const token = "test-token";

    // Create a unique project name for this test
    const projectName = `test-project-verify-${Date.now()}`;
    const seedClient = new SeedClient(projectName, token);

    console.log(`Seeding project: ${projectName}`);
    await seedClient.seed([
        {
            name: "test-page",
            lines: ["Line 1", "Line 2", "Line 3"],
        },
    ]);

    console.log("✅ Seeding completed successfully via HTTP API!");
    console.log("The data should now be persisted in the Yjs server database.");
    console.log(`Project: ${projectName}`);
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});
