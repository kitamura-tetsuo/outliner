/** @feature PRS-0001
 *  Title   : Show real-time presence indicators
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

let projectName: string;
let pageName: string;

test.describe("PRS-0001: presence indicators", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, ["first line"]);
        projectName = ids.projectName;
        pageName = ids.pageName;
    });

    test("shows multiple user avatars", async ({ page, browser }, testInfo) => {
        await page.goto(`/${projectName}/${pageName}`);
        await TestHelpers.waitForCursorVisible(page);

        const context = await browser.newContext();
        const page2 = await context.newPage();
        await TestHelpers.prepareTestEnvironment(page2, testInfo, []);
        await page2.goto(`/${projectName}/${pageName}`);
        await TestHelpers.waitForCursorVisible(page2);

        const avatars = page.locator('[data-testid="presence-row"] .presence-avatar');
        await expect(avatars).toHaveCount(2);

        const firstColor = await avatars.nth(0).evaluate(el => getComputedStyle(el).backgroundColor);
        const secondColor = await page2.locator('[data-testid="presence-row"] .presence-avatar').nth(0).evaluate(el => getComputedStyle(el).backgroundColor);
        expect(firstColor).not.toBe('');
        expect(firstColor).toBe(secondColor);

        await page2.close();
        await expect(avatars).toHaveCount(1);
    });
});
