import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature COL-4706cafe
 *  Title   : Rebase the local caret after a collaborator edits the same item
 */
test("remote insertion before the caret preserves the local typing position", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    for (const page of [pageA, pageB]) {
        await page.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_E2E_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
        });
    }

    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(
        pageA,
        testInfo,
        ["0123456789"],
    );
    await TestHelpers.seedProjectAndNavigate(pageB, testInfo, [], undefined, {
        skipSeed: true,
        projectName,
        pageName,
    });
    await TestHelpers.waitForOutlinerItems(pageA, 2, 120_000);
    await TestHelpers.waitForOutlinerItems(pageB, 2, 120_000);

    const itemA = pageA.locator(".outliner-item").filter({ hasText: "0123456789" });
    const itemId = await itemA.getAttribute("data-item-id");
    expect(itemId).toBeTruthy();
    const itemB = pageB.locator(`[data-item-id="${itemId}"]`);
    await expect(itemB).toContainText("0123456789");

    await TestHelpers.setCursor(pageB, itemId!);
    await pageB.keyboard.press("End");
    await TestHelpers.setCursor(pageA, itemId!);
    await pageA.keyboard.press("Home");
    await pageA.keyboard.type("XYZ");

    await expect(itemB).toContainText("XYZ0123456789", { timeout: 30_000 });
    await expect.poll(async () =>
        pageB.evaluate((id) => {
            const editorStore = (globalThis as any).editorOverlayStore;
            const store = (globalThis as any).store;
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            if (textarea && store?.activeItemId === id && document.activeElement === textarea) {
                return textarea.selectionStart;
            }
            return editorStore?.getCursorInstances?.().find((cursor: any) => cursor.itemId === id)?.offset;
        }, itemId)
    ).toBe(13);

    await pageB.keyboard.type("!");
    await expect(itemA).toContainText("XYZ0123456789!", { timeout: 30_000 });
    await expect(itemB).toContainText("XYZ0123456789!");

    await contextA.close();
    await contextB.close();
});
