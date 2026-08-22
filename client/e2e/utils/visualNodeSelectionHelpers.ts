import { expect, type Page } from "@playwright/test";
import { pointForOffset } from "./selectionGeometryHelpers";

/**
 * Seeding and assertions for selections that run across visual nodes (#5024).
 *
 * A Grid, Calendar or Layout owns no outline text (#5015), so these specs address the
 * blocks through the same root element the selection overlay measures rather than through
 * `.item-text` or any block's internal markup.
 */

export type VisualKind = "yjstable" | "calendar" | "layout";

export interface VisualSeed {
    type: VisualKind;
    /** Visual leaves to place inside a Layout. */
    children?: VisualKind[];
}

/**
 * Insert visual nodes after the first seeded outline item, so a text-to-text drag from
 * the first item to the last crosses them.
 *
 * Nodes are created as their kind, exactly as the slash commands do: kinds are immutable,
 * so a block is never an ex-Text node (#5015). Returns the created ids in order.
 */
export async function seedVisualNodesAfterFirstItem(page: Page, seeds: VisualSeed[]): Promise<string[]> {
    const ids = await page.evaluate((definitions: VisualSeed[]) => {
        const items = (globalThis as unknown as {
            generalStore: {
                currentPage: {
                    items: {
                        addNode: (author: string, index?: number) => {
                            id: string;
                            componentType: string | undefined;
                            items: { addNode: (author: string) => { componentType: string | undefined; }; };
                        };
                    };
                };
            };
        }).generalStore.currentPage.items;

        return definitions.map((definition, offset) => {
            const node = items.addNode("e2e", 1 + offset);
            node.componentType = definition.type;
            for (const child of definition.children ?? []) {
                node.items.addNode("e2e").componentType = child;
            }
            return node.id;
        });
    }, seeds);

    for (const id of ids) {
        await expect(page.locator(`[data-visual-node-root="${id}"]`)).toBeVisible({ timeout: 20000 });
    }
    await waitForStableGeometry(page);
    return ids;
}

/**
 * Wait until the rendered page stops growing.
 *
 * A block's view mounts before it has laid out its own content, so a drag point measured
 * too early can end up over a different item once the block finishes expanding.
 */
export async function waitForStableGeometry(page: Page): Promise<void> {
    let previous = "";
    await expect.poll(async () => {
        // Every row's and every block's bottom edge: the page's own scroll
        // height stays put while a block below the fold is still growing.
        const signature = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".outliner-item, [data-visual-node-root]"))
                .map(element => Math.round(element.getBoundingClientRect().bottom))
                .join(",")
        );
        const stable = signature === previous;
        previous = signature;
        return stable;
    }, { timeout: 20000, intervals: [250, 250, 250, 500] }).toBe(true);
}

/**
 * Drag from a character offset in one Text item to one in another, across whatever lies
 * between them, and assert the selection really ends where the gesture was aimed.
 *
 * The target is measured again once the gesture is under way: a block between the two
 * endpoints can still be settling, and a stale target point would release the button over
 * the block instead of over the item below it — a different selection entirely.
 */
export async function dragBetweenTextOffsets(
    page: Page,
    from: { itemId: string; offset: number; },
    to: { itemId: string; offset: number; },
): Promise<void> {
    const start = await pointForOffset(page, from.itemId, from.offset);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();

    const target = await pointForOffset(page, to.itemId, to.offset);
    await page.mouse.move(target.x, target.y, { steps: 12 });
    const settled = await pointForOffset(page, to.itemId, to.offset);
    await page.mouse.move(settled.x, settled.y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect.poll(async () =>
        await page.evaluate(() => {
            const selections = (globalThis as unknown as {
                editorOverlayStore: { selections: Record<string, { startItemId: string; endItemId: string; }>; };
            }).editorOverlayStore.selections;
            const selection = Object.values(selections)[0];
            return selection ? [selection.startItemId, selection.endItemId].sort().join("|") : "";
        }), { timeout: 10000 }).toBe([from.itemId, to.itemId].sort().join("|"));
}

/** The selection fragments the overlay renders for one item, as viewport boxes. */
export async function fragmentsForItem(page: Page, itemId: string) {
    return await page.locator(`.editor-overlay .selection[data-selection-item-id="${itemId}"]`)
        .evaluateAll(elements =>
            elements.map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    kind: element.getAttribute("data-selection-kind"),
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                };
            })
        );
}

/**
 * Assert that the single fragment rendered for `itemId` covers its whole block.
 *
 * The tolerance absorbs the highlight's own edge, which is drawn on the block's boundary.
 */
export async function expectNodeFragmentCoversBlock(page: Page, itemId: string): Promise<void> {
    const block = (await page.locator(`[data-visual-node-root="${itemId}"]`).boundingBox())!;
    const fragments = await fragmentsForItem(page, itemId);

    expect(fragments).toHaveLength(1);
    expect(fragments[0].kind).toBe("node");
    expect(Math.abs(fragments[0].left - block.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragments[0].top - block.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragments[0].width - block.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragments[0].height - block.height)).toBeLessThanOrEqual(3);
}
