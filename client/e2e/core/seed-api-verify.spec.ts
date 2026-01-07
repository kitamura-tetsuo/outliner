import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Server-side Seeding Verification", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Use standard setup but SKIP SEEDING in TestHelpers
        // We will seed MANUALLY in the test to verify SeedClient
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, {
            skipSeed: true,
            doNotNavigate: true,
        });
    });

    test("should correctly seed a page via API using shared schema", async ({ page }, testInfo) => {
        page.on("console", msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
        page.on("pageerror", err => console.log(`[BROWSER ERROR] ${err}`));
        // 1. Define seed data
        const workerIndex = testInfo.workerIndex;
        const timestamp = Date.now();
        const projectName = `Test Project ${workerIndex} ${timestamp}`;
        const pageName = "SeededPage";
        const lines = ["Line 1", "Line 2", "Line 3"];

        // 2. Perform Server-side Seeding
        const authToken = await TestHelpers.getTestAuthToken();
        const seeder = new SeedClient(projectName, authToken);
        await seeder.seedPage(pageName, lines);
        console.log(`Seeded project "${projectName}" page "${pageName}"`);

        // 3. Navigate to the page
        const yjsPort = process.env.VITE_YJS_PORT || "7082";
        await page.addInitScript((port) => {
            // eslint-disable-next-line no-restricted-globals
            window.localStorage.setItem("VITE_YJS_PORT", port);
        }, yjsPort);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        await page.goto(`/${encodedProject}/${encodedPage}?isTest=true`);

        // 4. Wait for app readiness
        try {
            await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
        } catch (e) {
            console.log("FAILED to find outliner-base. Page content:");
            console.log(await page.locator("body").innerHTML());
            throw e;
        }
        // 5. Verify Content
        // The page title should be visible
        await expect(page.locator("h1")).toContainText(pageName, { timeout: 10000 });

        // The lines should be visible as items
        // We expect "Line 1", "Line 2", "Line 3"
        // Note: waitForOutlinerItems waits for *any* items.
        // We can check specific text.
        for (const line of lines) {
            await expect(page.locator(`text=${line}`)).toBeVisible();
        }
    });
});
