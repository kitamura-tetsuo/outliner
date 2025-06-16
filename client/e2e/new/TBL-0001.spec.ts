/** @feature TBL-0001
 * Editable JOIN Table
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: Editable JOIN Table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false);
        await page.goto("/join-table");
    });

    test("editable join table loads", async ({ page }) => {
        await expect(page).toHaveURL('/join-table');
    });
});
