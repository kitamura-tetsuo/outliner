// Creating visual blocks in E2E, now that node kinds are immutable (#5015).
//
// There is no "Change to Database / Calendar / Layout" action any more: a node
// is created as its kind. Every spec that used to convert an item now creates
// the block from the slash command instead, which is the interaction users
// actually have. Keeping it here means the specs stay short enough for
// Playwright to run reliably (AGENTS.md §2).

import { expect, type Locator, type Page } from "@playwright/test";

export type BlockCommand = "Grid" | "Calendar" | "Layout";

/** The `componentType` each command creates, which is also its palette test id. */
const COMPONENT_TYPE: Record<BlockCommand, string> = {
    Grid: "yjstable",
    Calendar: "calendar",
    Layout: "layout",
};

/** The `data-node-kind` the created outline row carries. */
const NODE_KIND: Record<BlockCommand, string> = {
    Grid: "grid",
    Calendar: "calendar",
    Layout: "layout",
};

/**
 * Run a creation slash command from `item` and return the block it created.
 *
 * When `item` is an empty Text node the command replaces it in place; when it
 * holds text or children the block is created as its next sibling. Either way
 * the returned locator is the new block's outline row.
 */
export async function createBlockFromItem(page: Page, item: Locator, command: BlockCommand): Promise<Locator> {
    await expect(item).toBeVisible({ timeout: 10000 });
    const kindSelector = `.outliner-item[data-node-kind="${NODE_KIND[command]}"]`;
    // Which blocks of this kind the page already had, so the one created below
    // can be told apart from them — a spec may build several.
    const existing = new Set(await blockIds(page, kindSelector));

    await item.locator(".item-text").click();
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.keyboard.type(`/${command}`);

    const option = page.locator(`[data-testid="command-item-${COMPONENT_TYPE[command]}"]`);
    await expect(option).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Enter");

    let createdId: string | undefined;
    await expect.poll(async () => {
        createdId = (await blockIds(page, kindSelector)).find(id => !existing.has(id));
        return createdId ?? "";
    }, { timeout: 15000 }).not.toBe("");

    const block = page.locator(`.outliner-item[data-item-id="${createdId}"]`);
    await expect(block).toBeVisible({ timeout: 15000 });
    return block;
}

/** The `data-item-id`s of every rendered row matching `selector`. */
async function blockIds(page: Page, selector: string): Promise<string[]> {
    return page.locator(selector).evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id") ?? "")
    );
}

/**
 * Create a Calendar block from the outline row at `itemIndex` (index 0 is the
 * page's own row). Returns the new Calendar row.
 */
export async function createCalendarBlockAt(page: Page, itemIndex = 1): Promise<Locator> {
    return createBlockFromItem(page, page.locator(".outliner-item").nth(itemIndex), "Calendar");
}

/** Create a Calendar block from the outline row addressed by its tree key. */
export async function createCalendarBlockOn(page: Page, itemKey: string): Promise<Locator> {
    return createBlockFromItem(page, page.locator(`.outliner-item[data-item-id="${itemKey}"]`), "Calendar");
}
