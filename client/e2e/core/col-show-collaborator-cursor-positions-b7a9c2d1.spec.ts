/** @feature COL-b7a9c2d1
 * Title   : Show collaborator cursor positions
 * Source  : docs/client-features/col-show-collaborator-cursor-positions-b7a9c2d1.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("COL-b7a9c2d1: collaborator cursor presence", () => {
    test("renders remote cursor and selection updates", async ({ browser }, testInfo) => {
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page1, testInfo, ["Collaborators"]);
        await page1.goto(`/${projectName}/${pageName}`);

        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await TestHelpers.prepareTestEnvironment(page2, testInfo);
        await page2.goto(`/${projectName}/${pageName}`);

        await TestHelpers.waitForElementVisible(page1, ".outliner-item", 20000);
        await TestHelpers.waitForElementVisible(page2, ".outliner-item", 20000);

        const firstItem1 = page1.locator(".outliner-item").first();
        await firstItem1.locator(".item-content").click({ force: true });
        await page1.keyboard.type("team effort");
        await page1.waitForTimeout(200);

        const firstItemId = await firstItem1.getAttribute("data-item-id");
        await page1.evaluate(({ itemId }) => {
            const store = (window as any).editorOverlayStore;
            if (!store) throw new Error("editorOverlayStore unavailable");
            store.setSelection({
                startItemId: itemId,
                startOffset: 0,
                endItemId: itemId,
                endOffset: 4,
                isReversed: false,
                userId: "local",
            });
        }, { itemId: firstItemId });

        await page2.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return false;
            return Object.values(store.cursors).some((c: any) => c.userId && c.userId !== "local");
        }, { timeout: 15000 });

        const remoteCursorColor = await page2.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            const cursor = Object.values(store.cursors).find((c: any) => c.userId && c.userId !== "local");
            return cursor?.color || null;
        });
        expect(remoteCursorColor).not.toBeNull();

        await page2.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return false;
            return Object.values(store.selections).some((sel: any) => sel.userId && sel.userId !== "local");
        }, { timeout: 15000 });

        await context1.close();
        await context2.close();
    });
});
