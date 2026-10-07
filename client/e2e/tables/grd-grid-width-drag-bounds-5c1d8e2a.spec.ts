/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import { addSourceRecord, configureGrid, createBlankGrid } from "../utils/crossProjectGridHelpers";
import {
    expectColumnGeometry,
    headerWidth,
    installWriteProbe,
    pressResizeHandle,
    readWriteProbe,
} from "../utils/gridResizeHelpers";
import { expectAutoColumn, readWidthGridRegistry, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing (issue #5459 AS-002): zero-effect gestures on an auto
 * final column (with and without rows), an effective drag from the measured
 * auto width, clamping at 32 and 4096, Undo back to auto, and displacement in
 * Grid content coordinates while horizontally scrolled and while the scroll
 * offset changes during the active drag.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function savedWidth(page: Page, column: string): Promise<unknown> {
    const gridId = await singleGridId(page);
    return (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components[column]?.["widthPx"];
}

async function setNumericWidth(page: Page, column: string, px: string): Promise<void> {
    const view = page.getByTestId("yjs-table-view").first();
    if (!await view.getByTestId(`yjs-table-width-${column}`).isVisible().catch(() => false)) {
        await view.getByTestId("yjs-table-toggle-ui").click();
    }
    const input = view.getByTestId(`yjs-table-width-${column}`);
    await input.fill(px);
    await input.press("Enter");
    await expect.poll(() => savedWidth(page, column)).toBe(px === "" ? undefined : Number(px));
}

test.describe("Grid header drag resize bounds and zero-effect gestures", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await expect(page.getByTestId("yjs-table-grid").first().locator('th[data-col="quantity"]')).toBeVisible();
    });

    test("auto final column: no-op gestures, effective drag, clamping and Undo to auto", async ({ page }) => {
        for (const rows of [0, 1]) {
            if (rows === 1) await addSourceRecord(page);
            await installWriteProbe(page);
            const probe = await readWriteProbe(page);
            // Press/release without horizontal change.
            const press = await pressResizeHandle(page, 0, "quantity");
            await page.mouse.move(press.x, press.y + 40);
            await page.mouse.up();
            // Away (a visible preview) and back to the start.
            const autoWidth = await headerWidth(page, 0, "quantity");
            await pressResizeHandle(page, 0, "quantity");
            await page.mouse.move(press.x + 70, press.y, { steps: 3 });
            await expectColumnGeometry(page, 0, "quantity", Math.round(autoWidth + 70));
            await page.mouse.move(press.x, press.y, { steps: 3 });
            await page.mouse.up();
            expect(await savedWidth(page, "quantity")).toBeUndefined();
            await expectAutoColumn(page, 0, "quantity");
            const after = await readWriteProbe(page);
            expect(after.registry).toBe(0);
            expect(after.undoDepth).toBe(probe.undoDepth);
        }

        // Effective drag from the measured (auto) starting width.
        const start = await headerWidth(page, 0, "quantity");
        const depth = (await readWriteProbe(page)).undoDepth;
        let press = await pressResizeHandle(page, 0, "quantity");
        await page.mouse.move(press.x + 45, press.y, { steps: 5 });
        await page.mouse.up();
        const effective = Math.round(start + 45);
        await expect.poll(() => savedWidth(page, "quantity")).toBe(effective);
        await expectColumnGeometry(page, 0, "quantity", effective);

        // Clamp at 32.
        press = await pressResizeHandle(page, 0, "quantity");
        await page.mouse.move(press.x - effective - 40, press.y, { steps: 5 });
        await expectColumnGeometry(page, 0, "quantity", 32);
        await page.mouse.up();
        await expect.poll(() => savedWidth(page, "quantity")).toBe(32);

        // A fixed target whose rounded candidate equals its value: no update.
        await installWriteProbe(page);
        press = await pressResizeHandle(page, 0, "quantity");
        await page.mouse.move(press.x - 30, press.y, { steps: 3 });
        await page.mouse.up();
        expect((await readWriteProbe(page)).registry).toBe(0);

        // Undo restores the prior widths step by step, ending at auto.
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(() => savedWidth(page, "quantity")).toBe(effective);
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(() => savedWidth(page, "quantity")).toBeUndefined();
        await expectAutoColumn(page, 0, "quantity");
        expect((await readWriteProbe(page)).undoDepth).toBe(depth);

        // Clamp at 4096 on a fixed column scrolled into view.
        await setNumericWidth(page, "quantity", "4080");
        press = await pressResizeHandle(page, 0, "quantity");
        await page.mouse.move(press.x + 30, press.y, { steps: 3 });
        await page.mouse.up();
        await expect.poll(() => savedWidth(page, "quantity")).toBe(4096);
    });

    test("displacement uses content coordinates while scrolled and while scrolling", async ({ page }) => {
        await addSourceRecord(page);
        await setNumericWidth(page, "id", "120");
        await setNumericWidth(page, "title", "1600");
        const scroller = page.getByTestId("yjs-table-grid").first();
        await scroller.evaluate((el) => {
            el.scrollLeft = 12;
        });
        await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(12);

        const start = await headerWidth(page, 0, "id");
        const press = await pressResizeHandle(page, 0, "id");
        expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(12);
        await page.mouse.move(press.x + 30, press.y, { steps: 3 });
        await expectColumnGeometry(page, 0, "id", Math.round(start + 30));

        // A real wheel scroll under the stationary pointer moves the header
        // left by the scroll delta, which grows the candidate by the same.
        const before = await scroller.evaluate((el) => el.scrollLeft);
        await page.mouse.wheel(40, 0);
        await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
        const delta = (await scroller.evaluate((el) => el.scrollLeft)) - before;
        const expected = Math.round(start + 30 + delta);
        await expectColumnGeometry(page, 0, "id", expected);
        expect(await savedWidth(page, "id")).toBe(120);
        await page.mouse.up();
        await expect.poll(() => savedWidth(page, "id")).toBe(expected);
        await expectColumnGeometry(page, 0, "id", expected);
    });
});
