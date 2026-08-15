/** @feature CLP-4584c0de */
import { expect, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * The outline as (text, depth) pairs, read straight from Yjs. `project.items`
 * holds the project's pages, so the walk starts one level in — the seeded
 * fixture has a single page.
 */
async function readOutline(page: Page): Promise<Array<{ text: string; depth: number; }>> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-globals
        const project = (window as any).__YJS_STORE__?.yjsClient?.getProject();
        if (!project) throw new Error("Current Yjs project is unavailable");
        const rows: Array<{ text: string; depth: number; }> = [];
        const walk = (items: any, depth: number) => {
            for (let index = 0; index < items.length; index++) {
                const item = items.at(index);
                if (!item) continue;
                rows.push({ text: String(item.text ?? ""), depth });
                if (item.items) walk(item.items, depth + 1);
            }
        };
        for (let index = 0; index < project.items.length; index++) {
            const pageItem = project.items.at(index);
            if (pageItem?.items) walk(pageItem.items, 0);
        }
        return rows;
    });
}

async function itemIdByText(page: Page, text: string): Promise<string> {
    const id = await page.locator(".outliner-item[data-item-id]")
        .filter({ has: page.locator(".item-text", { hasText: text }) })
        .first()
        .getAttribute("data-item-id");
    if (!id) throw new Error(`No outliner item found for "${text}"`);
    return id;
}

/** Put the caret in an item, the way the Tab/Shift+Tab suite does. */
async function focusItem(page: Page, itemId: string): Promise<void> {
    const item = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
    await expect(item).toBeVisible({ timeout: 30000 });
    await item.locator(".item-content").click({ force: true });
    await expect(page.locator("textarea.global-textarea:focus")).toBeVisible({ timeout: 15000 });
}

// The copied depth of every item rode on the clipboard and was thrown away at
// the other end, so a copied subtree pasted as a flat run of siblings.
test.describe("pasting a nested selection", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("puts the copied children back under their parents", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Root one",
            "Child A",
            "Child B",
            "Root two",
            "Paste target",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);

        const ids = {
            childA: await itemIdByText(page, "Child A"),
            childB: await itemIdByText(page, "Child B"),
            target: await itemIdByText(page, "Paste target"),
        };

        // Build the nesting with the real keyboard, one confirmed step at a
        // time, so the copy reads the tree the user actually sees.
        let indented = 0;
        for (const itemId of [ids.childA, ids.childB]) {
            await focusItem(page, itemId);
            await page.keyboard.press("Tab");
            indented++;
            await expect.poll(
                async () => (await readOutline(page)).filter(row => row.depth === 1).length,
                { timeout: 15000 },
            ).toBe(indented);
        }
        expect((await readOutline(page)).map(row => row.depth)).toEqual([0, 1, 1, 0, 0]);

        await page.keyboard.press("Control+a");
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("Root one");

        await focusItem(page, ids.target);
        await page.keyboard.press("End");
        await page.keyboard.press("Control+v");

        // The caret item absorbs the first copied line — the page title, which
        // Ctrl/Cmd+A includes — and everything after it is rebuilt with the
        // shape it was copied with, at the top level rather than nested under
        // the heading it was copied beneath.
        await expect.poll(async () => (await readOutline(page)).map(row => row.depth), { timeout: 30000 })
            .toEqual([0, 1, 1, 0, 0, 0, 1, 1, 0, 0]);
        const outline = await readOutline(page);
        expect(outline.slice(5).map(row => row.text)).toEqual([
            "Root one",
            "Child A",
            "Child B",
            "Root two",
            "Paste target",
        ]);
    });
});
