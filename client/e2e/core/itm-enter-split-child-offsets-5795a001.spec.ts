import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { assertChildBearingSplit, seedChildBearingSplit } from "../utils/enterSplitSubtreeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (
    const scenario of [
        { name: "start", text: "HelloWorld", offset: 0, before: "", after: "HelloWorld" },
        { name: "middle", text: "HelloWorld", offset: 5, before: "Hello", after: "World" },
        { name: "end", text: "HelloWorld", offset: 10, before: "HelloWorld", after: "" },
        { name: "empty", text: "", offset: 0, before: "", after: "" },
    ]
) {
    test(`keyboard Enter reparents children at the ${scenario.name}`, async ({ page }, testInfo) => {
        const ids = await seedChildBearingSplit(page, testInfo, scenario.text);
        for (let offset = 0; offset < scenario.offset; offset++) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await expect(page.locator(`.outliner-item[data-item-id="${ids.child1Id}"]`)).toBeVisible();
        await assertChildBearingSplit(page, ids, scenario.before, scenario.after);
    });
}
