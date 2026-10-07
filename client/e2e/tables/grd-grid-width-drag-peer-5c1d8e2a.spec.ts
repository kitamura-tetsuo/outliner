/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import {
    expectColumnGeometry,
    installWriteProbe,
    openSyncedPeer,
    pressResizeHandle,
    readWriteProbe,
} from "../utils/gridResizeHelpers";
import { commitWidthsProduction, readWidthGridRegistry, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { dragColumnHeader, gridHeaderOrder } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing against observed peer updates (issue #5459 AS-004).
 * While a preview is held, a second normal client commits the same column's
 * width; the first client observes it before releasing, the gesture is
 * cancelled and release writes nothing — including A -> B -> A. Disjoint peer
 * changes (another column's width, a label, a reorder of the still-rendered
 * target) keep the gesture bound to its exact column and are preserved by the
 * eventual commit. Hiding the target invalidates the gesture.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function saved(page: Page, column: string, key = "widthPx"): Promise<unknown> {
    const gridId = await singleGridId(page);
    return (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components[column]?.[key];
}

test.describe("Grid header drag resize observes peer updates", () => {
    test(
        "same-column peer width cancels for good; disjoint changes survive the commit",
        async ({ page, browser }, testInfo) => {
            test.setTimeout(300000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
            await createBlankGrid(page, "Widths", "width_orders");
            await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
            await addSourceRecord(page);
            const view = page.getByTestId("yjs-table-view").first();
            const input = view.getByTestId("yjs-table-width-title");
            await input.fill("150");
            await input.press("Enter");
            await expect.poll(() => saved(page, "title")).toBe(150);
            const gridId = await singleGridId(page);
            const baselineData = (await readGridProjectState(page)).tables[0].data;

            const { context, peer } = await openSyncedPeer(browser, page, TestHelpers.createTestStorageState());
            try {
                // Peer A -> B while the gesture is pending: observed, cancelled.
                await installWriteProbe(page);
                let press = await pressResizeHandle(page, 0, "title");
                await page.mouse.move(press.x + 80, press.y, { steps: 4 });
                await expectColumnGeometry(page, 0, "title", 230);
                await commitWidthsProduction(peer, gridId, { title: 190 });
                await expect.poll(() => saved(page, "title"), { timeout: 60000 }).toBe(190);
                await expectColumnGeometry(page, 0, "title", 190);
                await expect(input).toHaveValue("190");
                await expect(input).not.toHaveAttribute("data-width-preview", "unsaved");
                // B -> A: the old number returning does not revive the gesture.
                await commitWidthsProduction(peer, gridId, { title: 150 });
                await expect.poll(() => saved(page, "title"), { timeout: 60000 }).toBe(150);
                await page.mouse.move(press.x + 120, press.y, { steps: 3 });
                await expectColumnGeometry(page, 0, "title", 150);
                const beforeRelease = (await readWriteProbe(page)).registry;
                await page.mouse.up();
                await page.waitForTimeout(500);
                expect((await readWriteProbe(page)).registry).toBe(beforeRelease);
                expect(await saved(page, "title")).toBe(150);
                await expect.poll(() => saved(peer, "title"), { timeout: 60000 }).toBe(150);

                // Disjoint peer changes: another column's width, a label of the
                // target, and a reorder that keeps the target rendered.
                press = await pressResizeHandle(page, 0, "title");
                await page.mouse.move(press.x + 67, press.y, { steps: 4 });
                await expectColumnGeometry(page, 0, "title", 217);
                await commitWidthsProduction(peer, gridId, { id: 64 });
                const peerView = peer.getByTestId("yjs-table-view").first();
                if (!await peerView.getByTestId("yjs-table-label-title").isVisible().catch(() => false)) {
                    await peerView.getByTestId("yjs-table-toggle-ui").click();
                }
                await peerView.getByTestId("yjs-table-label-title").fill("Name");
                await peerView.getByTestId("yjs-table-label-title").press("Tab");
                await dragColumnHeader(peer, "quantity", "id", "left");
                await expect.poll(() => saved(page, "id"), { timeout: 60000 }).toBe(64);
                await expect.poll(() => saved(page, "title", "label"), { timeout: 60000 }).toBe("Name");
                await expect.poll(() => gridHeaderOrder(page), { timeout: 60000 }).toEqual(["quantity", "id", "title"]);
                // Still previewing the exact column after the reorder.
                await expectColumnGeometry(page, 0, "title", 217);
                await page.mouse.move(press.x + 67, press.y + 200, { steps: 2 });
                await page.mouse.up();
                await expect.poll(() => saved(page, "title")).toBe(217);
                await expect.poll(() => saved(peer, "title"), { timeout: 60000 }).toBe(217);
                expect(await saved(page, "id")).toBe(64);
                expect(await saved(page, "title", "label")).toBe("Name");
                expect(await gridHeaderOrder(page)).toEqual(["quantity", "id", "title"]);
                expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);

                // Hiding the target on the peer invalidates without recreation.
                press = await pressResizeHandle(page, 0, "title");
                await page.mouse.move(press.x + 40, press.y, { steps: 3 });
                await peerView.getByTestId("yjs-table-hidden-title").uncheck();
                await expect(page.getByTestId("yjs-table-grid").first().locator('th[data-col="title"]')).toHaveCount(
                    0,
                    {
                        timeout: 60000,
                    },
                );
                await peerView.getByTestId("yjs-table-hidden-title").check();
                await expect(page.getByTestId("yjs-table-grid").first().locator('th[data-col="title"]')).toBeVisible({
                    timeout: 60000,
                });
                await page.mouse.up();
                await page.waitForTimeout(500);
                expect(await saved(page, "title")).toBe(217);
                await expectColumnGeometry(page, 0, "title", 217);
            } finally {
                await context.close();
            }
        },
    );
});
