/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

interface MouseTrace {
    type: string;
    button: number;
    buttons: number;
    pointerId?: number;
    pointerType?: string;
}

test.describe("Grid pan chorded-button ordering (#5863)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
        const view = page.getByTestId("yjs-table-view");
        for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
            await view.getByTestId(`yjs-table-width-${column}`).fill("300");
            await view.getByTestId(`yjs-table-width-${column}`).press("Enter");
        }
        await page.evaluate(() => {
            const trace: MouseTrace[] = [];
            for (
                const type of [
                    "pointerdown",
                    "pointermove",
                    "pointerup",
                    "mousedown",
                    "mouseup",
                    "click",
                    "auxclick",
                    "contextmenu",
                ]
            ) {
                addEventListener(type, (event) => {
                    const mouse = event as MouseEvent;
                    const pointer = event instanceof PointerEvent ? event : undefined;
                    trace.push({
                        type,
                        button: mouse.button,
                        buttons: mouse.buttons,
                        pointerId: pointer?.pointerId,
                        pointerType: pointer?.pointerType,
                    });
                }, true);
            }
            (globalThis as typeof globalThis & { __gridPanMouseTrace: MouseTrace[]; }).__gridPanMouseTrace = trace;
        });
    });

    for (
        const { secondary, button } of [
            { secondary: "right" as const, button: 2 },
            { secondary: "middle" as const, button: 1 },
        ]
    ) {
        test(`active pan survives ${secondary} press and release before primary`, async ({ page }) => {
            const grid = page.getByTestId("yjs-table-grid");
            const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
            await selectAndFocusCell(origin);
            const box = (await origin.boundingBox())!;
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;

            await page.keyboard.down("Space");
            await page.mouse.move(x, y);
            await page.mouse.down({ button: "left" });
            await page.mouse.down({ button: secondary });
            await page.mouse.move(x - 60, y, { steps: 2 });
            await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
            await page.mouse.up({ button: secondary });
            await expect(page.locator(".context-menu-overlay")).toHaveCount(0);
            await expect(grid).toHaveClass(/pan-active/);
            const trace = await readTrace(page);
            expect(trace.some(event => event.type === "pointermove" && event.button === button && event.buttons === 1))
                .toBe(true);
            await page.mouse.up({ button: "left" });
            await page.keyboard.up("Space");
            await expect(origin.locator("input")).toHaveCount(0);
        });
    }

    test("primary release before right release remains owned through the real browser event order", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;

        await page.keyboard.down("Space");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down({ button: "left" });
        await page.mouse.down({ button: "right" });
        await page.mouse.up({ button: "left" });
        await page.mouse.up({ button: "right" });
        await page.keyboard.up("Space");

        await expect(origin.locator("input")).toHaveCount(0);
        await expect(page.locator(".context-menu-overlay")).toHaveCount(0);
        const trace = await readTrace(page);
        expect(trace.some(event => event.type === "pointermove" && event.button === 0 && event.buttons === 2)).toBe(
            true,
        );
        expect(trace.some(event => event.type === "pointerup" && event.button === 2 && event.buttons === 0)).toBe(true);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
        await expect(grid).not.toHaveClass(/pan-active|pan-armed/);
    });

    test("Space-first ownership survives primary release before the last chorded button", async ({ page }) => {
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;

        await page.keyboard.down("Space");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down({ button: "left" });
        await page.mouse.down({ button: "middle" });
        await page.keyboard.up("Space");
        await page.mouse.up({ button: "left" });
        await page.mouse.up({ button: "middle" });

        await expect(origin.locator("input")).toHaveCount(0);
        const trace = await readTrace(page);
        expect(trace.some(event => event.type === "pointermove" && event.button === 0 && event.buttons === 4)).toBe(
            true,
        );
        expect(trace.some(event => event.type === "pointerup" && event.button === 1 && event.buttons === 0)).toBe(true);
        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
    });
});

function readTrace(page: import("@playwright/test").Page): Promise<MouseTrace[]> {
    return page.evaluate(() =>
        (globalThis as typeof globalThis & { __gridPanMouseTrace: MouseTrace[]; }).__gridPanMouseTrace
    );
}
