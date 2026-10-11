/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import { addSourceRecord, configureGrid, createBlankGrid } from "../utils/crossProjectGridHelpers";
import {
    expectColumnGeometry,
    gridHeader,
    installWriteProbe,
    pressResizeHandle,
    readWriteProbe,
    resizeHandle,
} from "../utils/gridResizeHelpers";
import { readWidthGridRegistry, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { gridHeaderOrder } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing (issue #5459 AS-003): with a visible nontrivial
 * preview, Escape, pointercancel, capture loss, window blur and unmount each
 * cancel without any saved-width update or history entry (not a write plus
 * compensation). A later release stays a no-op and selects nothing. Events a
 * mouse cannot originate (pointercancel, capture loss, blur) are delivered to
 * the actual registered handlers after a real gesture start. In the success
 * ordering pointerup -> lostpointercapture -> duplicate terminal, there is
 * one commit and no rollback.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function savedTitle(page: Page): Promise<unknown> {
    const gridId = await singleGridId(page);
    return (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components["title"]?.["widthPx"];
}

type Terminal = (page: Page, at: { x: number; y: number; }) => Promise<void>;

const terminals: Record<string, Terminal> = {
    escape: (page) => page.keyboard.press("Escape"),
    pointercancel: (page) =>
        resizeHandle(page, 0, "title").evaluate((el) => {
            el.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true, isPrimary: true }));
        }),
    captureLoss: async (page, at) => {
        await resizeHandle(page, 0, "title").evaluate((el) => {
            // The real capture taken at pointerdown is released, so the
            // browser itself fires lostpointercapture, which it delivers
            // when it processes the next pointer event.
            el.releasePointerCapture(1);
        });
        await page.mouse.move(at.x, at.y + 1);
    },
    blur: (page) =>
        page.evaluate(() => {
            globalThis.dispatchEvent(new Event("blur"));
        }),
};

test.describe("Grid header drag resize cancellation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        const view = page.getByTestId("yjs-table-view").first();
        const input = view.getByTestId("yjs-table-width-title");
        await input.fill("150");
        await input.press("Enter");
        await expect.poll(() => savedTitle(page)).toBe(150);
    });

    test("every cancellation path leaves saved width and history untouched", async ({ page }) => {
        const header = gridHeader(page, 0, "title");
        await installWriteProbe(page);
        const probe = await readWriteProbe(page);
        for (const [name, terminate] of Object.entries(terminals)) {
            const press = await pressResizeHandle(page, 0, "title");
            await page.mouse.move(press.x + 90, press.y, { steps: 4 });
            await expectColumnGeometry(page, 0, "title", 240);
            await terminate(page, { x: press.x + 90, y: press.y });
            await expectColumnGeometry(page, 0, "title", 150);
            // Cancel followed by pointerup is still a no-op that selects nothing.
            await page.mouse.move(press.x + 120, press.y, { steps: 2 });
            await page.mouse.up();
            await expectColumnGeometry(page, 0, "title", 150);
            await expect(header, name).not.toHaveClass(/header-selected/);
            const after = await readWriteProbe(page);
            expect(after.registry, name).toBe(0);
            expect(after.undoDepth, name).toBe(probe.undoDepth);
        }
        expect(await savedTitle(page)).toBe(150);

        // Unmount (hiding the Grid view) cancels the pending gesture.
        const press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 60, press.y, { steps: 3 });
        await expectColumnGeometry(page, 0, "title", 210);
        await page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-toggle-grid").dispatchEvent("click");
        await expect(page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid")).toHaveCount(0);
        await page.mouse.up();
        expect((await readWriteProbe(page)).registry).toBe(0);
        expect(await savedTitle(page)).toBe(150);
        await page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-toggle-grid").click();
        await expectColumnGeometry(page, 0, "title", 150);

        // Normal interaction is restored: header selection and scrolling.
        await header.locator(".th-label").click();
        await expect(header).toHaveClass(/header-selected/);
        const order = await gridHeaderOrder(page);
        expect(order).toContain("title");
    });

    test("pointerup then lostpointercapture then a duplicate terminal commits once without rollback", async ({ page }) => {
        await installWriteProbe(page);
        const probe = await readWriteProbe(page);
        const press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 67, press.y, { steps: 4 });
        await page.mouse.up();
        await expect.poll(() => savedTitle(page)).toBe(217);
        await resizeHandle(page, 0, "title").evaluate((el) => {
            el.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
            el.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true, isPrimary: true }));
            el.dispatchEvent(
                new PointerEvent("pointerup", { pointerId: 1, bubbles: true, isPrimary: true, clientX: 0 }),
            );
        });
        await page.keyboard.press("Escape");
        await expectColumnGeometry(page, 0, "title", 217);
        expect(await savedTitle(page)).toBe(217);
        const after = await readWriteProbe(page);
        expect(after.registry).toBe(1);
        expect(after.undoDepth).toBe(probe.undoDepth + 1);
    });
});
