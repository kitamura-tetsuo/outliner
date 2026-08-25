import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("CNT-7b28a4f0: Eventless ProjectSelector", () => {
    test("option list refreshes from the canonical project directory", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, [], undefined, { skipSync: true });
        const baseline = `selector-baseline-${Date.now()}`;
        await TestHelpers.setAccessibleProjects(page, [baseline]);

        const select = page.locator("select.project-select");
        await expect(select).toBeVisible();
        await expect(select.locator("option", { hasText: baseline })).toHaveCount(1);

        const added = `selector-added-${Date.now()}`;
        await TestHelpers.setAccessibleProjects(page, [baseline, added]);
        await expect(select.locator("option", { hasText: added })).toHaveCount(1, { timeout: 15000 });
    });
});
