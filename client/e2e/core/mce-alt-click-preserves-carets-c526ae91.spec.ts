import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

registerCoverageHooks();

/** @feature MCE-37b78b62: additive mouse gestures preserve existing local carets. */
async function localCursors(page: Page) {
    const state = await CursorValidator.getCursorData(page);
    return state.cursors.filter((c: { userId?: string; }) => (c.userId ?? "local") === "local");
}
async function canonicalTree(page: Page) {
    const tree = await TreeValidator.getTreeData(page);
    expect(tree.error).toBeUndefined();
    expect(tree.itemCount).toBeGreaterThan(0);
    const text = JSON.stringify(tree.items);
    for (const value of ["alpha", "beta", "gamma"]) expect(text).toContain(value);
    return tree;
}
async function row(page: Page, text: string) {
    const item = page.locator(".outliner-item[data-item-id]").filter({
        has: page.locator(".item-text", { hasText: text }),
    });
    await expect(item).toHaveCount(1);
    const id = await item.getAttribute("data-item-id");
    expect(id).toBeTruthy();
    return { id: id!, text: item.locator(".item-text") };
}
test.beforeEach(async ({ page }, info) => {
    await TestHelpers.seedProjectAndNavigate(page, info, ["alpha", "beta", "gamma"]);
});

test("ordinary click places a caret; Alt+Click preserves its identity and adds a second", async ({ page }) => {
    const first = await row(page, "alpha"), second = await row(page, "beta");
    const canonicalBefore = await canonicalTree(page);
    // Begin with browser gestures, never a constructed cursor-store result.
    await first.text.click({ position: { x: 1, y: 8 } });
    await expect.poll(async () => (await localCursors(page)).length, { timeout: 10000 }).toBe(1);
    const original = (await localCursors(page))[0];
    expect(original).toMatchObject({ itemId: first.id, offset: 0, userId: "local", isActive: true });
    await second.text.click({ position: { x: 1, y: 8 }, modifiers: ["Alt"] });
    await expect.poll(async () => (await localCursors(page)).length, { timeout: 10000 }).toBe(2);
    const after = await localCursors(page);
    expect(after.find((c: { cursorId: string; }) => c.cursorId === original.cursorId)).toEqual(original);
    expect(after.find((c: { itemId: string; }) => c.itemId === second.id)).toMatchObject({
        offset: 0,
        userId: "local",
        isActive: true,
    });
    expect((await CursorValidator.getCursorData(page)).selections).toEqual([]);
    expect(await canonicalTree(page)).toEqual(canonicalBefore);
});

test("Shift+Arrow selection still works after an ordinary browser click", async ({ page }) => {
    const first = await row(page, "alpha");
    const canonicalBefore = await canonicalTree(page);
    await first.text.click({ position: { x: 1, y: 8 } });
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => (await CursorValidator.getCursorData(page)).selections.length, { timeout: 10000 })
        .toBe(1);
    expect((await CursorValidator.getCursorData(page)).selections[0]).toMatchObject({
        startItemId: first.id,
        startOffset: 0,
        endItemId: first.id,
        endOffset: 1,
    });
    expect(await canonicalTree(page)).toEqual(canonicalBefore);
});

test("a modified right click does not enter the left-button additive path", async ({ page }) => {
    const first = await row(page, "alpha"), second = await row(page, "beta");
    await first.text.click({ position: { x: 1, y: 8 } });
    const before = await localCursors(page);
    const canonicalBefore = await canonicalTree(page);
    await second.text.click({ button: "right", modifiers: ["Alt"] });
    await page.keyboard.press("Escape");
    expect(await localCursors(page)).toEqual(before);
    expect(await canonicalTree(page)).toEqual(canonicalBefore);
});
