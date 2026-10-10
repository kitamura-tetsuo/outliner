import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-8f29a6d0 — Visual endpoint ranges survive character-mirror notifications. */
import { expect, type Page, test } from "@playwright/test";
import { pointForOffset } from "../utils/selectionGeometryHelpers";
import {
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    localCursorItemIds,
    localSelectionEndpoints,
    seedVisualNodesAfterFirstItem,
    type VisualKind,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

async function model(page: Page) {
    return page.evaluate(() => {
        const items = (globalThis as unknown as {
            generalStore: {
                currentPage: {
                    items: {
                        iterateUnordered(): Iterable<{
                            id: string;
                            text: unknown;
                            componentType?: string;
                            calendarId?: string;
                            yjsTableId?: string;
                            yjsGridId?: string;
                        }>;
                    };
                };
            };
        }).generalStore.currentPage.items;
        return {
            items: Array.from(items.iterateUnordered(), item => ({
                id: item.id,
                text: String(item.text),
                kind: item.componentType,
                calendarId: item.calendarId,
                yjsTableId: item.yjsTableId,
                yjsGridId: item.yjsGridId,
            })),
            order: Array.from(
                document.querySelectorAll(".outliner-item[data-item-id]"),
                element => element.getAttribute("data-item-id"),
            ),
        };
    });
}

async function replaySelectionNotification(page: Page) {
    // The browser's production document listener and its scheduled readback receive
    // this replay. No store synchronization or selection setter is invoked by the test.
    await expect(page.locator(".global-textarea")).toBeFocused();
    await page.waitForTimeout(100);
    await page.evaluate(async () => {
        document.dispatchEvent(new Event("selectionchange"));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
}

for (const kind of ["yjstable", "calendar", "layout"] as VisualKind[]) {
    test(
        `${kind}: real Shift+Up range survives delayed mirror replay and yields to a Text click`,
        async ({ page }, info) => {
            test.setTimeout(120000);
            await page.setViewportSize({ width: 1280, height: 1800 });
            await seedSelectionPage(page, info);
            const alpha = await itemIdByText(page, "Alpha text");
            const omega = await itemIdByText(page, "Omega text");
            const [visual] = await seedVisualNodesAfterFirstItem(page, [{ type: kind }]);
            const before = await model(page);
            const point = await pointForOffset(page, alpha, 0);
            await page.mouse.click(point.x, point.y);
            await page.keyboard.press("Home");
            await expect(page.locator(".global-textarea")).toBeFocused();

            const anchor = { kind: "text", itemId: alpha, offset: 0 };
            for (
                const [key, endpoint] of [
                    ["Shift+ArrowDown", { kind: "node-boundary", itemId: visual, side: "after" }],
                    ["Shift+ArrowDown", { kind: "text", itemId: omega, offset: 0 }],
                    ["Shift+ArrowUp", { kind: "node-boundary", itemId: visual, side: "before" }],
                ] as const
            ) {
                await page.keyboard.press(key);
                // Inspect the settled result, not the transient fragment in the failing trace.
                await page.waitForTimeout(400);
                expect(await localSelectionEndpoints(page)).toEqual({
                    start: anchor,
                    end: endpoint,
                    isReversed: false,
                });
                expect(await localCursorItemIds(page)).not.toContain(visual);
                if (endpoint.kind === "node-boundary" && endpoint.side === "before") {
                    expect(await fragmentsForItem(page, visual)).toHaveLength(0);
                } else {
                    await expectNodeFragmentCoversBlock(page, visual);
                }
            }
            const accepted = await localSelectionEndpoints(page);
            expect((await fragmentsForItem(page, alpha)).length).toBeGreaterThan(0);
            await replaySelectionNotification(page);
            await replaySelectionNotification(page);
            expect(await localSelectionEndpoints(page)).toEqual(accepted);
            expect(await fragmentsForItem(page, visual)).toHaveLength(0);
            expect(await model(page)).toEqual(before);

            const click = await pointForOffset(page, omega, 2);
            await page.mouse.click(click.x, click.y);
            await page.waitForTimeout(400);
            await replaySelectionNotification(page);
            expect(await localSelectionEndpoints(page)).toBeUndefined();
            expect(await fragmentsForItem(page, alpha)).toHaveLength(0);
            const caret = await page.evaluate(() =>
                Object.values(
                    (globalThis as unknown as {
                        editorOverlayStore: {
                            cursors: Record<
                                string,
                                { userId?: string; itemId: string; offset: number; isActive: boolean; }
                            >;
                        };
                    }).editorOverlayStore.cursors,
                ).filter(c => (c.userId ?? "local") === "local" && c.isActive)
                    .map(c => ({ itemId: c.itemId, offset: c.offset }))
            );
            expect(caret).toEqual([{ itemId: omega, offset: 2 }]);
            expect(await model(page)).toEqual(before);
        },
    );
}
