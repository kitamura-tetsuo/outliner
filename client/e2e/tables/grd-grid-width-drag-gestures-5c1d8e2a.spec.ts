/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import {
    expectColumnGeometry,
    gridHeader,
    headerWidth,
    pressResizeHandle,
    resizeHandle,
    undoDepth,
} from "../utils/gridResizeHelpers";
import { readWidthGridRegistry, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { dragColumnHeader, gridHeaderOrder } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing next to existing gestures (issue #5459 AS-005): a
 * resize leaves the Grid selection, column order and outline host alone;
 * the reorder handle, header selection and cell editing keep working; touch
 * and pen resize through the same handle; rapid drags plus a numeric edit
 * are separate Undo steps; a read-only host offers no handle; reload shows
 * the latest committed width.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function saved(page: Page, column: string): Promise<unknown> {
    const gridId = await singleGridId(page);
    return (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components[column]?.["widthPx"];
}

/** Drag a handle with a non-mouse pointer through CDP input dispatch. */
async function dragWithPointer(page: Page, column: string, dx: number, kind: "touch" | "pen"): Promise<void> {
    const box = (await resizeHandle(page, 0, column).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    try {
        if (kind === "touch") {
            await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
            for (let i = 1; i <= 4; i++) {
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: x + (dx * i) / 4, y }],
                });
            }
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
            const base = { pointerType: "pen" as const, button: "left" as const, clickCount: 1 };
            await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, ...base });
            for (let i = 1; i <= 4; i++) {
                await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + (dx * i) / 4, y, ...base });
            }
            await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y, ...base });
        }
    } finally {
        await cdp.detach();
    }
}

test.describe("Grid header drag resize coexists with other gestures", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
    });

    test("selection, reorder, editing and the outline host are unaffected", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid").first();
        const outlineOrder = () =>
            page.locator(".outliner-item[data-item-id]").evaluateAll((items) =>
                items.map((item) => item.getAttribute("data-item-id"))
            );
        const outlineBefore = await outlineOrder();
        // A two-row range through the row headers (Shift-click extends).
        await grid.getByRole("rowheader").nth(0).click();
        await grid.getByRole("rowheader").nth(1).click({ modifiers: ["Shift"] });
        await expect(grid.locator("td.grid-selected")).toHaveCount(6);
        const order = await gridHeaderOrder(page);

        const press = await pressResizeHandle(page, 0, "quantity");
        await page.mouse.move(press.x + 50, press.y, { steps: 4 });
        await page.mouse.up();
        await expect.poll(() => saved(page, "quantity")).not.toBeUndefined();
        await expect(grid.locator("td.grid-selected")).toHaveCount(6);
        await expect(gridHeader(page, 0, "quantity")).not.toHaveClass(/header-selected/);
        expect(await gridHeaderOrder(page)).toEqual(order);
        // The outline host did not move.
        expect(await outlineOrder()).toEqual(outlineBefore);

        // The normal reorder handle (its native drag sequence; the real-mouse
        // path is covered by tbl-column-reorder-673b2241) and header
        // selection still work.
        await dragColumnHeader(page, "quantity", "title", "left");
        await expect.poll(() => gridHeaderOrder(page)).toEqual(["id", "quantity", "title"]);
        await gridHeader(page, 0, "title").locator(".th-label").click();
        await expect(gridHeader(page, 0, "title")).toHaveClass(/header-selected/);

        // Supported cell editing still writes the source record.
        const recordId = await grid.locator("tbody tr").first().getAttribute("data-record-id");
        await setCellValue(page, 0, recordId!, "title", "edited");
    });

    test("touch and pen resize; drags and a numeric edit are separate Undo steps", async ({ page }) => {
        const startTouch = await headerWidth(page, 0, "title");
        await dragWithPointer(page, "title", 60, "touch");
        await expect.poll(() => saved(page, "title")).toBe(Math.round(startTouch + 60));
        const afterTouch = Math.round(startTouch + 60);

        const depth = await undoDepth(page);
        await dragWithPointer(page, "title", 25, "pen");
        await expect.poll(() => saved(page, "title")).toBe(afterTouch + 25);
        let press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 15, press.y, { steps: 2 });
        await page.mouse.up();
        await expect.poll(() => saved(page, "title")).toBe(afterTouch + 40);
        const view = page.getByTestId("yjs-table-view").first();
        const input = view.getByTestId("yjs-table-width-title");
        await input.fill("300");
        await input.press("Enter");
        await expect.poll(() => saved(page, "title")).toBe(300);
        expect(await undoDepth(page)).toBe(depth + 3);

        const data = (await readGridProjectState(page)).tables[0].data;
        for (const expected of [afterTouch + 40, afterTouch + 25, afterTouch]) {
            await page.getByTestId("toolbar-undo").click();
            await expect.poll(() => saved(page, "title")).toBe(expected);
            await expect(input).toHaveValue(String(expected));
            await expectColumnGeometry(page, 0, "title", expected);
        }
        expect((await readGridProjectState(page)).tables[0].data).toEqual(data);

        // Production read-only host: no handle is offered.
        await page.evaluate(() => {
            const project = (globalThis as any).generalStore?.project;
            project.ydoc.getMap("metadata").set("isResetting", true);
            project.ydoc.getMap("metadata").set("resetStartedAt", Date.now());
        });
        await expect(resizeHandle(page, 0, "title")).toHaveCount(0, { timeout: 15000 });
        await page.evaluate(() => {
            (globalThis as any).generalStore?.project.ydoc.getMap("metadata").set("isResetting", false);
        });
        await expect(resizeHandle(page, 0, "title")).toHaveCount(1, { timeout: 15000 });

        press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 33, press.y, { steps: 2 });
        await page.mouse.up();
        await expect.poll(() => saved(page, "title")).toBe(afterTouch + 33);
        await page.reload();
        await expectColumnGeometry(page, 0, "title", afterTouch + 33);
    });
});
