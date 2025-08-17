import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Global Search", () => {
    test("should search across projects", async ({ page }, testInfo) => {
        // Prepare environment (auth, stores, routing) without relying on homepage UI
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Create two projects and pages via Fluid API (faster and reliable for CI)
        const project1 = "Project 1";
        const page1 = "Page 1 in Project 1";
        await TestHelpers.createTestProjectAndPageViaAPI(page, project1, page1, [page1]);

        const project2 = "Project 2";
        const page2 = "Page 2 in Project 2";
        await TestHelpers.createTestProjectAndPageViaAPI(page, project2, page2, [page2]);

        // Stub the search API to avoid emulator dependency in GitHub reporting job
        await page.route("**/api/search", async route => {
            const postData = route.request().postDataJSON() as any;
            // Validate request shape minimally
            if (!postData || typeof postData.query !== "string") {
                return route.fulfill({ status: 400, json: { results: [] } });
            }

            const q = postData.query.toLowerCase();
            const results = [
                { project: { title: project1 }, page: { text: page1 } },
                { project: { title: project2 }, page: { text: page2 } },
            ].filter(r => r.page.text.toLowerCase().includes(q));

            await route.fulfill({ status: 200, json: { results } });
        });

        // Perform global searches and verify dropdown shows results
        const searchInput = page.locator('input[placeholder="Global Search"]');
        await expect(searchInput).toBeVisible();

        await searchInput.fill("Page 1");
        await expect(page.locator('li:has-text("Project 1 / Page 1 in Project 1")')).toBeVisible();

        await searchInput.fill("Page 2");
        await expect(page.locator('li:has-text("Project 2 / Page 2 in Project 2")')).toBeVisible();

        // Navigate to the page in Project 1 by clicking the button in the list item
        await searchInput.fill("Page 1");
        await page.click('li:has-text("Project 1 / Page 1 in Project 1") button');
        await page.waitForURL("**/Project%201/Page%201%20in%20Project%201");
        await expect(page.locator('.outliner .item-text:has-text("Page 1 in Project 1")')).toBeVisible();
    });
});
