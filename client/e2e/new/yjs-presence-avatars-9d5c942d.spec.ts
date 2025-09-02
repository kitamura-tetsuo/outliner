/** @feature YJS-9d5c942d
 *  Title   : Show Yjs presence avatars
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("shows avatars for two users", async ({ browser }, testInfo) => {
    const context1 = await browser.newContext();
    await context1.addInitScript(() => {
        (window as any).__TEST_USER__ = { id: "user1", name: "User One" };
    });
    const page1 = await context1.newPage();
    const ids = await TestHelpers.prepareTestEnvironment(page1, testInfo, ["first line"]);
    const { projectName, pageName } = ids;
    await page1.goto(`/${projectName}/${pageName}`);

    const context2 = await browser.newContext();
    await context2.addInitScript(() => {
        (window as any).__TEST_USER__ = { id: "user2", name: "User Two" };
    });
    const page2 = await context2.newPage();
    await page2.goto(`/${projectName}/${pageName}`);

    const locator1 = page1.locator('[data-testid="presence-row"] .presence-avatar');
    await expect(locator1).toHaveCount(2, { timeout: 10000 });

    await context1.close();
    await context2.close();
});
