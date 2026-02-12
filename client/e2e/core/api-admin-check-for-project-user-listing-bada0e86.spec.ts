import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature API-0003
 *  Title   : Admin check for project user listing
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @testcase Admin Check Feature
 * @description Confirm that Firebase Functions getProjectUsers is accessible only by administrators
 */

test.describe("Admin Check (API-0003)", () => {
    // API test only, so TestHelpers.prepareTestEnvironment is not needed

    test("Returns authentication error with invalid token", async ({ page }) => {
        // Health check for Firebase Hosting emulator
        try {
            const healthResponse = await page.request.get("http://127.0.0.1:57000/api/health");
            console.log(`Health check status: ${healthResponse.status()}`);
            if (healthResponse.status() !== 200) {
                console.log("Health check failed, Firebase Hosting emulator may not be running properly");
            }
        } catch (error) {
            console.log(`Health check error: ${error.message}`);
        }

        // First try accessing via Firebase Hosting emulator
        let response = await page.request.post("http://127.0.0.1:57000/api/adminCheckForProjectUserListing", {
            data: { idToken: "invalid-token", projectId: "test-project" },
        });

        // Output debug information
        console.log(`Hosting response status: ${response.status()}`);
        console.log(`Hosting response headers:`, response.headers());

        // In case of 404 error, access Firebase Functions emulator directly
        if (response.status() === 404) {
            console.log("Hosting emulator returned 404, trying direct Functions emulator access");

            // First, health check for Functions emulator
            try {
                const functionsHealthResponse = await page.request.get(
                    "http://127.0.0.1:57070/outliner-d57b0/us-central1/health",
                );
                console.log(`Functions health check status: ${functionsHealthResponse.status()}`);
            } catch (error) {
                console.log(`Functions health check error: ${error.message}`);
            }

            response = await page.request.post(
                "http://127.0.0.1:57070/outliner-d57b0/us-central1/adminCheckForProjectUserListing",
                {
                    data: { idToken: "invalid-token", projectId: "test-project" },
                },
            );
            console.log(`Functions response status: ${response.status()}`);
            console.log(`Functions response headers:`, response.headers());
        }

        let responseBody;
        try {
            responseBody = await response.json();
            console.log(`Response body:`, responseBody);
        } catch (error) {
            const textBody = await response.text();
            console.log(`Response text:`, textBody);
            console.log(`JSON parse error:`, error.message);
        }

        // In case of invalid token, Firebase authentication error is returned (usually 401 error)
        expect(response.status()).toBe(401);

        expect(responseBody.error).toBe("Authentication failed");
    });

    test("Returns 400 when projectId is not specified", async ({ page }) => {
        // Call Firebase Functions API without specifying projectId and confirm that 400 error is returned
        const response = await page.request.post("http://127.0.0.1:57000/api/adminCheckForProjectUserListing", {
            data: { idToken: "any-token" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("Project ID is required");
    });

    test("Returns 400 when ID token is not specified", async ({ page }) => {
        // Call Firebase Functions API without specifying ID token and confirm that 400 error is returned
        const response = await page.request.post("http://127.0.0.1:57000/api/adminCheckForProjectUserListing", {
            data: { projectId: "test-project" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });

    test("Returns 400 with empty ID token", async ({ page }) => {
        // Call Firebase Functions API with empty ID token and confirm that 400 error is returned
        const response = await page.request.post("http://127.0.0.1:57000/api/adminCheckForProjectUserListing", {
            data: { idToken: "", projectId: "test-project" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });
});
