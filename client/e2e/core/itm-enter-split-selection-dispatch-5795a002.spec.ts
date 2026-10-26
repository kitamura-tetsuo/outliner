import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { assertChildBearingSplit, seedChildBearingSplit } from "../utils/enterSplitSubtreeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (
    const scenario of [
        { key: "Enter", before: "He", after: "rld" },
        { key: "Shift+Enter", before: "HelloWo", after: "rld" },
    ]
) {
    test(`${scenario.key} preserves its selection preprocessing before child transfer`, async ({ page }, testInfo) => {
        const ids = await seedChildBearingSplit(page, testInfo, "HelloWorld");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        for (let offset = 2; offset < 7; offset++) await page.keyboard.press("Shift+ArrowRight");
        await expect.poll(async () => (await page.evaluate(() =>
            Object.keys((globalThis as any).editorOverlayStore.selections).length
        ))).toBe(1);
        await page.keyboard.press(scenario.key);
        await expect(page.locator(`.outliner-item[data-item-id="${ids.child1Id}"]`)).toBeVisible();
        await assertChildBearingSplit(page, ids, scenario.before, scenario.after);
    });
}
