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
    gridHeader,
    headerWidth,
    installWriteProbe,
    openSyncedPeer,
    pressResizeHandle,
    readWriteProbe,
    resizeHandle,
} from "../utils/gridResizeHelpers";
import { expectAutoColumn, readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing lifecycle edges (issue #5459 REQ-003/004/005/006):
 * - a cancelled gesture whose original release never reaches the page must
 *   not swallow the next, unrelated pointer sequence (also after unmount);
 * - a subpixel pen move that keeps the rounded measured width of an auto
 *   column is a zero-effect no-op;
 * - an observed in-place source-Table rebinding on the standalone Grid page
 *   (which does not remount on rebinding) cancels for good, A -> B -> A.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function gridEntry(page: Page, gridId: string) {
    return (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)!;
}

/** A fresh primary press at (x, y) without a release: the earlier one was lost outside the window. */
async function freshMousePress(page: Page, x: number, y: number): Promise<void> {
    await page.mouse.move(x, y);
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    } finally {
        await cdp.detach();
    }
}

test.describe("Grid header drag resize lifecycle edges", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
    });

    test("a cancelled gesture never consumes the next pointer sequence, also after unmount", async ({ page }) => {
        const view = page.getByTestId("yjs-table-view").first();
        const header = gridHeader(page, 0, "title");
        await installWriteProbe(page);
        const probe = await readWriteProbe(page);

        // Blur cancels a real preview; the original release is lost outside
        // the window, so the next thing the page sees is a fresh press.
        let press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 60, press.y, { steps: 3 });
        await expect(header).toHaveClass(/col-fixed/);
        await page.evaluate(() => {
            globalThis.dispatchEvent(new Event("blur"));
        });
        await expect(header).not.toHaveClass(/col-fixed/);
        const label = (await header.locator(".th-label").boundingBox())!;
        await freshMousePress(page, label.x + 5, label.y + label.height / 2);
        await page.mouse.up();
        await expect(header).toHaveClass(/header-selected/);

        // Unmount (Grid toggled off) between the cancel and the release: the
        // Grid's residual release guard must be gone, so the release travels
        // the page normally, and the next click on the Grid toggle works.
        press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 60, press.y, { steps: 3 });
        await page.evaluate(() => {
            globalThis.dispatchEvent(new Event("blur"));
        });
        const toggle = view.getByTestId("yjs-table-toggle-grid");
        await toggle.dispatchEvent("click");
        await expect(view.getByTestId("yjs-table-grid")).toHaveCount(0);
        await page.evaluate(() => {
            const g = globalThis as unknown as { __releaseSeen?: number; };
            g.__releaseSeen = 0;
            globalThis.addEventListener("pointerup", () => {
                g.__releaseSeen = (g.__releaseSeen ?? 0) + 1;
            });
        });
        await page.mouse.up();
        await expect.poll(() =>
            page.evaluate(() => (globalThis as unknown as { __releaseSeen?: number; }).__releaseSeen)
        ).toBe(1);
        await toggle.click();
        await expect(view.getByTestId("yjs-table-grid")).toHaveCount(1);
        await expectAutoColumn(page, 0, "title");

        const after = await readWriteProbe(page);
        expect(after.registry).toBe(0);
        expect(after.undoDepth).toBe(probe.undoDepth);
    });

    test("a subpixel pen move keeping the rounded auto width writes nothing", async ({ page }) => {
        const gridId = (await readWidthGridRegistry(page))[0].gridId;
        const start = await headerWidth(page, 0, "title");
        const fraction = start - Math.floor(start);
        // A nonzero displacement of at least half a pixel whose rounded
        // result equals the rounded measured width.
        const dx = fraction >= 0.5 ? 0.5 : fraction >= 0.1 ? -0.6 : 0.4;
        expect(Math.round(start + dx)).toBe(Math.round(start));
        await installWriteProbe(page);
        const probe = await readWriteProbe(page);

        const handle = (await resizeHandle(page, 0, "title").boundingBox())!;
        const x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        const cdp = await page.context().newCDPSession(page);
        try {
            const base = { pointerType: "pen" as const, button: "left" as const, clickCount: 1 };
            await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, ...base });
            await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx, y, ...base });
            await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y, ...base });
        } finally {
            await cdp.detach();
        }
        await page.waitForTimeout(500);
        const after = await readWriteProbe(page);
        expect(after.registry).toBe(0);
        expect(after.undoDepth).toBe(probe.undoDepth);
        expect((await gridEntry(page, gridId)).components["title"]?.["widthPx"]).toBeUndefined();
        await expectAutoColumn(page, 0, "title");
    });

    test("an observed source-Table rebinding on the standalone Grid page cancels for good", async ({ page, browser }) => {
        await createBlankGrid(page, "Other", "other_orders");
        const state = await readGridProjectState(page);
        const tableA = state.tables.find((t) => t.name === "Widths")!.id;
        const tableB = state.tables.find((t) => t.name === "Other")!.id;
        const gridId = (await readWidthGridRegistry(page)).find((g) => g.sourceTableId === tableA)!.gridId;
        const outlineUrl = page.url();
        const projectSegment = new URL(outlineUrl).pathname.split("/")[1];
        const { context, peer } = await openSyncedPeer(browser, page, TestHelpers.createTestStorageState());
        try {
            await page.goto(`/${projectSegment}/-/grids/${gridId}?isTest=true`);
            await expect(gridHeader(page, 0, "title")).toBeVisible({ timeout: 60000 });
            await installWriteProbe(page);
            const probe = await readWriteProbe(page);

            const press = await pressResizeHandle(page, 0, "title");
            await page.mouse.move(press.x + 70, press.y, { steps: 4 });
            await expect(gridHeader(page, 0, "title")).toHaveClass(/col-fixed/);
            // A second normal client rebinds the Grid in place (B), then back (A).
            const rebind = (target: string) =>
                peer.evaluate(({ id, source }) => {
                    const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
                    project.ydoc.getMap("yjsGrids").get(id).set("sourceTableId", source);
                }, { id: gridId, source: target });
            await rebind(tableB);
            await expect.poll(async () => (await gridEntry(page, gridId)).sourceTableId, { timeout: 60000 })
                .toBe(tableB);
            await expect(gridHeader(page, 0, "title")).not.toHaveClass(/col-fixed/);
            await rebind(tableA);
            await expect.poll(async () => (await gridEntry(page, gridId)).sourceTableId, { timeout: 60000 })
                .toBe(tableA);
            const beforeRelease = (await readWriteProbe(page)).registry;
            await page.mouse.move(press.x + 90, press.y, { steps: 2 });
            await expect(gridHeader(page, 0, "title")).not.toHaveClass(/col-fixed/);
            await page.mouse.up();
            await page.waitForTimeout(500);
            const after = await readWriteProbe(page);
            expect(after.registry).toBe(beforeRelease);
            expect(after.undoDepth).toBe(probe.undoDepth);
            expect((await gridEntry(page, gridId)).components["title"]?.["widthPx"]).toBeUndefined();
            await expectAutoColumn(page, 0, "title");
            // The view stayed mounted throughout (no incidental remount).
            await expect(page.getByTestId("yjs-table-view")).toHaveCount(1);
        } finally {
            await context.close();
        }
    });
});
