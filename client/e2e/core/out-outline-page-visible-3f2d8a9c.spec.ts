import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

let ids: { projectName: string; pageName: string; };

test.beforeEach(async ({ page }, testInfo) => {
    ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
});

test("displays outline page after environment setup", async ({ page }) => {
    const encodedProject = encodeURIComponent(ids.projectName);
    const encodedPage = encodeURIComponent(ids.pageName);

    await expect(page).toHaveURL(new RegExp(`/${encodedProject}/${encodedPage}$`));
    await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();

    await TestHelpers.waitForOutlinerItems(page);
});
