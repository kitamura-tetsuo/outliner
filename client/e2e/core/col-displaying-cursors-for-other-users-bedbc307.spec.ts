import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature COL-bedbc307
 *  Title   : Displaying cursors for other users
 *  Source  : docs/client-features/col-displaying-cursors-for-other-users-bedbc307.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("COL-bedbc307: remote cursor display", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first"]);
    });

    test("shows remote cursor", async ({ page }) => {
        const id = await page.locator(".outliner-item").first().getAttribute("data-item-id");
        await TestHelpers.setCursor(page, id!, 0, "local");
        await TestHelpers.setCursor(page, id!, 0, "remote");
        await TestHelpers.waitForCursorVisible(page);
        const count = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.cursors).length);
        expect(count).toBe(2);
    });
});
