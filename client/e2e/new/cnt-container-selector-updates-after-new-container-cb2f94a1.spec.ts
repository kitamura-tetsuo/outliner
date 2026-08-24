import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("CNT-12ee98aa: Shared Project Store", () => {
    test("dropdown updates when a canonical project is added", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, [], undefined, { skipSync: true });
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const first = `project-first-${Date.now()}`;
        await TestHelpers.setAccessibleProjects(page, [first]);
        const select = page.locator("select.project-select");
        await expect(select.locator("option", { hasText: first })).toHaveCount(1);

        const added = `project-added-${Date.now()}`;
        await TestHelpers.setAccessibleProjects(page, [first, added]);
        await expect(select.locator("option", { hasText: added })).toHaveCount(1, { timeout: 15000 });
    });
});
