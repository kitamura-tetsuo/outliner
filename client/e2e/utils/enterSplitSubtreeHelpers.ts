import { expect, type Page, type TestInfo } from "@playwright/test";
import { CursorValidator } from "./cursorValidation";
import { TestHelpers } from "./testHelpers";
import { TreeValidator } from "./treeValidation";

export async function seedChildBearingSplit(page: Page, testInfo: TestInfo, text: string) {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["P", text, "C1", "G", "C2", "Z"]);
    await TestHelpers.setupTreeDebugger(page);
    await TestHelpers.waitForOutlinerItems(page, 7);
    const [parentId, sourceId, child1Id, grandchildId, child2Id, followingId] = await Promise.all(
        [1, 2, 3, 4, 5, 6].map(index => TestHelpers.getItemIdByIndex(page, index)),
    ) as string[];
    const press = async (id: string, key: string) => {
        await page.locator(`.outliner-item[data-item-id="${id}"] .item-content`).click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press(key);
    };
    await press(sourceId, "Tab");
    for (const id of [child1Id, child1Id, grandchildId, grandchildId, grandchildId, child2Id, child2Id]) {
        await press(id, "Tab");
    }
    await press(sourceId, "Home");
    return { parentId, sourceId, child1Id, grandchildId, child2Id, followingId };
}

export async function assertChildBearingSplit(
    page: Page,
    ids: Awaited<ReturnType<typeof seedChildBearingSplit>>,
    before: string,
    after: string,
) {
    const tree = await TreeValidator.getTreeData(page);
    expect(tree.items.map((item: { id: string; }) => item.id)).toEqual([ids.parentId, ids.followingId]);
    const parent = tree.items[0];
    const source = parent.items.find((item: { id: string; }) => item.id === ids.sourceId)!;
    const sibling = parent.items.find((item: { id: string; }) => item.id !== ids.sourceId)!;
    expect(parent.items.map((item: { id: string; }) => item.id)).toEqual([ids.sourceId, sibling.id]);
    expect([source.text, sibling.text]).toEqual([before, after]);
    expect(sibling.items.map((item: { id: string; }) => item.id)).toEqual([ids.child1Id, ids.child2Id]);
    expect(sibling.items[0].items.map((item: { id: string; }) => item.id)).toEqual([ids.grandchildId]);
    expect(
        await page.locator(".outliner-item:not(.page-title)").evaluateAll(elements =>
            elements.map(element => element.getAttribute("data-item-id"))
        ),
    ).toEqual([
        ids.parentId,
        ids.sourceId,
        sibling.id,
        ids.child1Id,
        ids.grandchildId,
        ids.child2Id,
        ids.followingId,
    ]);
    const cursor = await CursorValidator.getCursorData(page);
    expect(cursor.selectionCount).toBe(0);
    expect(cursor.activeItemId).toBe(sibling.id);
    expect(cursor.cursorInstances.find((entry: { isActive: boolean; }) => entry.isActive)).toMatchObject({
        itemId: sibling.id,
        offset: 0,
    });
}
