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
    await expect.poll(async () => {
        const block = await page.locator(`[data-visual-node-root="${itemId}"]`).boundingBox();
        const fragments = await fragmentsForItem(page, itemId);
        return !!block
            && fragments.length === 1
            && fragments[0].kind === "node"
            && Math.abs(fragments[0].left - block.x) <= 3
            && Math.abs(fragments[0].top - block.y) <= 3
            && Math.abs(fragments[0].width - block.width) <= 3
            && Math.abs(fragments[0].height - block.height) <= 3;
    }, { timeout: 20000 }).toBe(true);

    const block = (await page.locator(`[data-visual-node-root="${itemId}"]`).boundingBox())!;
    const [fragment] = await fragmentsForItem(page, itemId);
    expect(fragment.kind).toBe("node");
    expect(Math.abs(fragment.left - block.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragment.top - block.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragment.width - block.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(fragment.height - block.height)).toBeLessThanOrEqual(3);
}

/**
 * A selection endpoint as the store models it (#5025).
 *
 * Text endpoints are character boundaries; a visual node is atomic and offers only the
 * two boundaries around it, so a spec never has to name an offset inside a block.
 */
export type SelectionEndpointInput =
    | { kind: "text"; itemId: string; offset: number; }
    | { kind: "node-boundary"; itemId: string; side: "before" | "after"; };

/** The position just before an atomic visual node. */
export function beforeNode(itemId: string): SelectionEndpointInput {
    return { kind: "node-boundary", itemId, side: "before" };
}

/** The position just after an atomic visual node. */
export function afterNode(itemId: string): SelectionEndpointInput {
    return { kind: "node-boundary", itemId, side: "after" };
}

/** A character boundary inside a Text item. */
export function atOffset(itemId: string, offset: number): SelectionEndpointInput {
    return { kind: "text", itemId, offset };
}

/**
 * Set the local selection from two endpoints, the way the model expresses them.
 *
 * The shortcut for specs about what a range *contains*: they state the endpoints instead
 * of miming a gesture. Specs about the gestures themselves drive the mouse and the
 * keyboard (#5026) and read the endpoints back with `localSelectionEndpoints`.
 */
export async function selectBetweenEndpoints(
    page: Page,
    start: SelectionEndpointInput,
    end: SelectionEndpointInput,
): Promise<void> {
    await page.evaluate(([startEndpoint, endEndpoint]) => {
        const store = (globalThis as unknown as {
            editorOverlayStore: {
                clearSelectionForUser: (userId: string) => void;
                setSelection: (selection: unknown) => string | undefined;
            };
        }).editorOverlayStore;
        store.clearSelectionForUser("local");
        store.setSelection({ start: startEndpoint, end: endEndpoint, userId: "local" });
    }, [start, end]);
    await page.waitForTimeout(300);
}

/** The plain text the store reports for the local selection. */
export async function selectedPlainText(page: Page): Promise<string> {
    return await page.evaluate(() =>
        (globalThis as unknown as { editorOverlayStore: { getSelectedText: (userId: string) => string; }; })
            .editorOverlayStore.getSelectedText("local")
    );
}

/**
 * The outline layer's own selection surface for a visual node (#5026).
 *
 * A block owns every gesture on its content, so the outline gets a gutter of its own down
 * the block's outer edge; direct node selection starts there and nowhere else.
 */
export function visualNodeSelectionSurface(page: Page, itemId: string) {
    return page.locator(`[data-visual-node-selection-surface="${itemId}"]`);
}

/** Viewport point on a visual node's outline-level selection surface. */
export async function pointOnSelectionSurface(page: Page, itemId: string): Promise<{ x: number; y: number; }> {
    const surface = visualNodeSelectionSurface(page, itemId);
    await expect(surface).toBeVisible({ timeout: 20000 });
    const box = (await surface.boundingBox())!;
    expect(box.width, `no selection surface for visual node ${itemId}`).toBeGreaterThan(0);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press the outline surface of a visual node, selecting it as one atomic outline item. */
export async function selectVisualNode(page: Page, itemId: string, modifiers: string[] = []): Promise<void> {
    const point = await pointOnSelectionSurface(page, itemId);
    for (const modifier of modifiers) await page.keyboard.down(modifier);
    await page.mouse.click(point.x, point.y);
    for (const modifier of modifiers.slice().reverse()) await page.keyboard.up(modifier);
    await page.waitForTimeout(400);
}

/** Press, drag and release between two viewport points, then let the overlay settle. */
export async function dragBetweenPoints(
    page: Page,
    from: { x: number; y: number; },
    to: { x: number; y: number; },
): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.move(to.x, to.y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(500);
}

/** A selection as the store holds it: two logical endpoints plus its direction (#5025). */
export interface StoredSelectionEndpoints {
    start: SelectionEndpointInput;
    end: SelectionEndpointInput;
    isReversed: boolean;
}

/** The local selection's logical endpoints, exactly as the store holds them (#5025). */
export async function localSelectionEndpoints(page: Page): Promise<StoredSelectionEndpoints | undefined> {
    return await page.evaluate(() => {
        const store = (globalThis as unknown as {
            editorOverlayStore: {
                selections: Record<string, {
                    start: SelectionEndpointInput;
                    end: SelectionEndpointInput;
                    userId?: string;
                    isReversed?: boolean;
                }>;
            };
        }).editorOverlayStore;
        const selection = Object.values(store.selections).find(s => (s.userId ?? "local") === "local");
        if (!selection) return undefined;
        return {
            start: selection.start,
            end: selection.end,
            isReversed: Boolean(selection.isReversed),
        };
    });
}

/** The items the local carets sit on. A block must never be among them (#5026). */
export async function localCursorItemIds(page: Page): Promise<string[]> {
    return await page.evaluate(() =>
        Object.values(
            (globalThis as unknown as {
                editorOverlayStore: { cursors: Record<string, { itemId: string; userId?: string; }>; };
            }).editorOverlayStore.cursors,
        )
            .filter(cursor => (cursor.userId ?? "local") === "local")
            .map(cursor => cursor.itemId)
    );
}
