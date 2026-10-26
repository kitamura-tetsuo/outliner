import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-0001
 *  Title   : Add new item with Enter
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("ITM-0001: Add new item with Enter", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First part of text. Second part of text."]);
        await TestHelpers.setupTreeDebugger(page);

        // Click on the first non-page-title item containing the test text
        const contentItem = page.locator(".outliner-item:not(.page-title)");
        await contentItem.first().locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
    });

    test("Yjs tree reflects split after Enter", async ({ page }) => {
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Home");
        for (let i = 0; i < "First part of text.".length; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        await TreeValidator.waitForProjectReady(page);
        const treeData = await TreeValidator.getTreeData(page);
        expect(treeData.items[0].text).toBe("First part of text.");
        expect(treeData.items[1].text.trimStart()).toBe("Second part of text.");
    });
});

test("Enter reparents and reveals a collapsed nested subtree in visual order", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["P", "HelloWorld", "C1", "G", "C2", "Z"]);
    await TestHelpers.setupTreeDebugger(page);
    await TestHelpers.waitForOutlinerItems(page, 7);
    const ids = await Promise.all([1, 2, 3, 4, 5, 6].map(index => TestHelpers.getItemIdByIndex(page, index)));
    const [parentId, sourceId, child1Id, grandchildId, child2Id, followingId] = ids as string[];

    const focusAndPress = async (id: string, key: string) => {
        await page.locator(`.outliner-item[data-item-id="${id}"] .item-content`).click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press(key);
    };
    await focusAndPress(sourceId, "Tab");
    for (const id of [child1Id, child1Id, grandchildId, grandchildId, grandchildId, child2Id, child2Id]) {
        await focusAndPress(id, "Tab");
    }

    const source = page.locator(`.outliner-item[data-item-id="${sourceId}"]`);
    await expect(source).toHaveAttribute("aria-expanded", "true");
    await source.locator("button.collapse-btn").click({ force: true });
    await expect(source).toHaveAttribute("aria-expanded", "false");
    await focusAndPress(sourceId, "End");
    await page.keyboard.press("Enter");

    await expect(page.locator(`.outliner-item[data-item-id="${child1Id}"]`)).toBeVisible();
    const treeData = await TreeValidator.getTreeData(page);
    expect(treeData.items.map((item: { id: string; }) => item.id)).toEqual([parentId, followingId]);
    const parent = treeData.items[0];
    const newItem = parent.items.find((item: { id: string; text: string; }) =>
        item.text === "" && item.id !== sourceId
    )!;
    expect(parent.items.map((item: { id: string; }) => item.id)).toEqual([sourceId, newItem.id]);
    expect(newItem.items.map((item: { id: string; }) => item.id)).toEqual([child1Id, child2Id]);
    expect(newItem.items[0].items.map((item: { id: string; }) => item.id)).toEqual([grandchildId]);
    const visualIds = await page.locator(".outliner-item:not(.page-title)").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id"))
    );
    expect(visualIds).toEqual([
        parentId,
        sourceId,
        newItem.id,
        child1Id,
        grandchildId,
        child2Id,
        followingId,
    ]);
});
