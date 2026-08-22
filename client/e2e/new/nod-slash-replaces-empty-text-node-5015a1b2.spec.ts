import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5015a1b2
 *  Title   : Immutable outline node kinds with text owned only by Text nodes
 *  Source  : docs/client-features/nod-immutable-outline-node-kinds-5015a1b2.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Slash creation looks like conversion and is implemented as replacement
 * (#5015): an eligible empty Text node is removed and a freshly created visual
 * node takes its exact place. Nothing with content is ever discarded.
 */

/** The outline as (text, componentType) pairs, straight from the Yjs tree. */
const outline = (page: Page) =>
    page.evaluate(() =>
        [...(globalThis as any).generalStore.currentPage.items].map((item: any) => ({
            id: item.id as string,
            text: String(item.text ?? ""),
            componentType: item.componentType as string | undefined,
            children: [...item.items].length,
        }))
    );

async function runCommand(page: Page, itemId: string, command: string, componentType: string) {
    // The caret is placed through the store rather than by clicking: an empty
    // Text node - the interesting case here - renders a zero-width text span
    // that a click cannot reliably land in.
    const length = await page.evaluate((id) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const item = [...items].find((entry: any) => entry.id === id);
        return String(item?.text ?? "").length;
    }, itemId);
    await TestHelpers.setCursor(page, itemId, length);
    await TestHelpers.focusGlobalTextarea(page);
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type(`/${command}`);
    await expect(page.locator(`[data-testid="command-item-${componentType}"]`)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Enter");
    await expect(page.locator(".slash-command-palette")).toBeHidden();
}

test.describe("FTR-5015a1b2: slash creation replaces an eligible empty Text node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["A", "", "B"]);
        await TestHelpers.waitForOutlinerItems(page, 3);
    });

    for (const [command, componentType] of [["Grid", "yjstable"], ["Calendar", "calendar"], ["Layout", "layout"]]) {
        test(`/${command} removes the empty Text node and inserts the block at its position`, async ({ page }) => {
            const before = await outline(page);
            const blankId = before[1].id;

            await runCommand(page, blankId, command, componentType);
            await page.waitForTimeout(500);

            const after = await outline(page);
            expect(after.map(entry => entry.text)).toEqual(["A", "", "B"]);
            expect(after.map(entry => entry.componentType)).toEqual([undefined, componentType, undefined]);
            // Replacement, not in-place retyping: the old node is gone.
            expect(after[1].id).not.toBe(blankId);
            expect(after.map(entry => entry.id)).not.toContain(blankId);
        });
    }

    test("keeps text the user typed beside the command, inserting the block after it", async ({ page }) => {
        const before = await outline(page);

        await runCommand(page, before[0].id, "Grid", "yjstable");
        await page.waitForTimeout(500);

        const after = await outline(page);
        expect(after.map(entry => entry.text)).toEqual(["A", "", "", "B"]);
        expect(after.map(entry => entry.componentType)).toEqual([undefined, "yjstable", undefined, undefined]);
        // The node the command was typed in is untouched, kind included.
        expect(after[0].id).toBe(before[0].id);
    });

    test("keeps a node's children, inserting the block after it", async ({ page }) => {
        const before = await outline(page);
        await page.evaluate((parentId) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const parent = [...items].find((item: any) => item.id === parentId);
            parent.items.addNode("e2e").updateText("child");
        }, before[1].id);
        await page.waitForTimeout(300);

        await runCommand(page, before[1].id, "Grid", "yjstable");
        await page.waitForTimeout(500);

        const after = await outline(page);
        const kept = after.find(entry => entry.id === before[1].id);
        expect(kept, "the node with children survives").toBeTruthy();
        expect(kept!.children).toBe(1);
        expect(after.map(entry => entry.componentType)).toContain("yjstable");
    });

    test("never replaces the page-title node", async ({ page }) => {
        const pageTitle = page.locator(".outliner-item.page-title .item-text");
        await pageTitle.click();
        await page.keyboard.press("End");
        await page.keyboard.type("/Grid");
        await expect(page.locator('[data-testid="command-item-yjstable"]')).toBeVisible({ timeout: 10000 });
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);

        const titleKind = await page.evaluate(() =>
            (globalThis as any).generalStore.currentPage.componentType as string | undefined
        );
        expect(titleKind).toBeUndefined();
    });

    test("undo puts the replaced empty Text node back in one step", async ({ page }) => {
        const before = await outline(page);

        await runCommand(page, before[1].id, "Grid", "yjstable");
        await page.waitForTimeout(500);
        expect((await outline(page)).map(entry => entry.componentType)).toContain("yjstable");

        await page.keyboard.press("Control+z");
        await page.waitForTimeout(700);

        const after = await outline(page);
        expect(after.map(entry => entry.componentType)).toEqual([undefined, undefined, undefined]);
        expect(after.map(entry => entry.text)).toEqual(["A", "", "B"]);
    });
});
