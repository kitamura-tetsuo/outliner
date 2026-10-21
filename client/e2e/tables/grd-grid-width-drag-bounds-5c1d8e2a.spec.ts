/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Locator, type Page, test } from "@playwright/test";
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

interface WheelBoundaryEvidence {
    hitInsideGrid: boolean;
    hitTag?: string;
    hitTestId?: string;
    hitColumn?: string;
    clientWidth: number;
    scrollWidth: number;
    scrollLeft: number;
    resizing?: string;
}

async function wheelBoundaryEvidence(
    scroller: Locator,
    point: { x: number; y: number; },
): Promise<WheelBoundaryEvidence> {
    return scroller.evaluate((el, hitPoint) => {
        const target = document.elementFromPoint(hitPoint.x, hitPoint.y);
        const targetElement = target instanceof HTMLElement ? target : undefined;
        return {
            hitInsideGrid: target !== null && el.contains(target),
            hitTag: targetElement?.tagName,
            hitTestId: targetElement?.dataset.testid,
            hitColumn: targetElement?.dataset.col,
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            scrollLeft: el.scrollLeft,
            resizing: el.dataset.columnResizing,
        };
    }, point);
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

    test("displacement uses content coordinates while scrolled and while scrolling", async ({ page }, testInfo) => {
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

        const originalPoint = { x: press.x + 30, y: press.y };
        const originalBoundary = await wheelBoundaryEvidence(scroller, originalPoint);
        await testInfo.attach("wheel-boundary-original-target.json", {
            body: JSON.stringify({ point: originalPoint, ...originalBoundary }, undefined, 2),
            contentType: "application/json",
        });
        expect(originalBoundary.resizing).toBe("true");
        expect(originalBoundary.scrollWidth).toBeGreaterThan(originalBoundary.clientWidth);

        // Exercise the historical sequence before applying the verified-target
        // repair. Whether it scrolls or reproduces the intermittent unchanged
        // offset, retain the post-wheel browser boundary rather than inferring
        // delivery from the later repaired action.
        await page.mouse.wheel(40, 0);
        await scroller.evaluate(() =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })
        );
        const originalAfter = await wheelBoundaryEvidence(scroller, originalPoint);
        await testInfo.attach("wheel-boundary-original-wheel.json", {
            body: JSON.stringify(
                { point: originalPoint, before: originalBoundary, after: originalAfter },
                undefined,
                2,
            ),
            contentType: "application/json",
        });
        expect(originalAfter.resizing).toBe("true");

        // If the intermittent original action succeeds, restore the starting
        // offset with real input so the negative and repaired comparisons use
        // the same active gesture and measured starting state.
        if (originalAfter.scrollLeft !== originalBoundary.scrollLeft) {
            await page.mouse.wheel(originalBoundary.scrollLeft - originalAfter.scrollLeft, 0);
            await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(originalBoundary.scrollLeft);
            await expectColumnGeometry(page, 0, "id", Math.round(start + 30));
        }

        // Negative boundary control with the same unchanged-scroll symptom:
        // pointer capture keeps the resize active when the physical pointer is
        // over a non-Grid target, but wheel hit-testing does not follow that
        // capture. This proves why the repaired sequence verifies its target;
        // it does not claim that this condition caused every historical flake.
        const toolbarBox = await page.getByTestId("toolbar-undo").boundingBox();
        expect(toolbarBox, "the toolbar supplies a visible non-Grid wheel target").not.toBeNull();
        const controlPoint = { x: originalPoint.x, y: Math.round(toolbarBox!.y + toolbarBox!.height / 2) };
        await page.mouse.move(controlPoint.x, controlPoint.y);
        const controlBefore = await wheelBoundaryEvidence(scroller, controlPoint);
        expect(controlBefore, `controlled boundary evidence: ${JSON.stringify(controlBefore)}`).toMatchObject({
            hitInsideGrid: false,
            resizing: "true",
            scrollLeft: 12,
        });
        await page.mouse.wheel(40, 0);
        await scroller.evaluate(() =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })
        );
        const controlAfter = await wheelBoundaryEvidence(scroller, controlPoint);
        expect(controlAfter.scrollLeft).toBe(controlBefore.scrollLeft);
        expect(controlAfter.resizing).toBe("true");
        await testInfo.attach("wheel-boundary-negative-control.json", {
            body: JSON.stringify({ point: controlPoint, before: controlBefore, after: controlAfter }, undefined, 2),
            contentType: "application/json",
        });

        // Keep the captured resize pointer at the same content x, but move it
        // over a body row so the real wheel is hit-tested inside the Grid.
        const bodyCell = scroller.locator("td[data-col]").first();
        const bodyBox = await bodyCell.boundingBox();
        expect(bodyBox, "the real Grid needs a rendered body row for wheel hit testing").not.toBeNull();
        const wheelPoint = { x: press.x + 30, y: Math.round(bodyBox!.y + bodyBox!.height / 2) };
        await page.mouse.move(wheelPoint.x, wheelPoint.y);

        // Retain boundary evidence immediately before the real wheel input:
        // the pointer is over this overflowing Grid and the resize preview is
        // still active. This distinguishes input delivery from resize math.
        const boundary = await wheelBoundaryEvidence(scroller, wheelPoint);
        expect(boundary, `wheel boundary evidence: ${JSON.stringify(boundary)}`).toMatchObject({
            hitInsideGrid: true,
            resizing: "true",
            scrollLeft: 12,
        });
        expect(boundary.scrollWidth).toBeGreaterThan(boundary.clientWidth);

        // A real wheel scroll over the verified Grid moves the header left by
        // the observed scroll delta, which grows the candidate by the same.
        const before = boundary.scrollLeft;
        await page.mouse.wheel(40, 0);
        await expect.poll(() => scroller.evaluate((el) => el.scrollLeft), { timeout: 10000 }).toBeGreaterThan(before);
        const delta = (await scroller.evaluate((el) => el.scrollLeft)) - before;
        const expected = Math.round(start + 30 + delta);
        await testInfo.attach("wheel-boundary-repaired-scroll.json", {
            body: JSON.stringify({ point: wheelPoint, before: boundary, delta }, undefined, 2),
            contentType: "application/json",
        });

        // Negative control: exercise the same measured header/body oracle with
        // the deliberately incorrect pointer-only result. It must reject that
        // result before the correct pointer-plus-scroll expectation is checked.
        const pointerOnly = Math.round(start + 30);
        await expect(
            expectColumnGeometry(page, 0, "id", pointerOnly, 500),
            "the geometry oracle must reject a resize result that omits scroll delta",
        ).rejects.toThrow(`column id should measure ${pointerOnly}px`);
        await expectColumnGeometry(page, 0, "id", expected);
        expect(await savedWidth(page, "id")).toBe(120);
        await page.mouse.up();
        await expect.poll(() => savedWidth(page, "id")).toBe(expected);
        await expectColumnGeometry(page, 0, "id", expected);
    });
});
