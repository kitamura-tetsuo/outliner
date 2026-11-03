/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { undoDepth } from "../utils/gridResizeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid Space pan terminal click ownership (#5863)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
        const view = page.getByTestId("yjs-table-view");
        for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
            await view.getByTestId(`yjs-table-width-${column}`).fill("300");
            await view.getByTestId(`yjs-table-width-${column}`).press("Enter");
        }
    });

    test("zero-distance pan is inert and leaves the next click usable", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const selectionBefore = await selectedCellIdentity(grid);
        const stateBefore = await readGridProjectState(page);
        const undoBefore = await undoDepth(page);
        expect(undoBefore).toBeGreaterThanOrEqual(0);
        const box = (await origin.boundingBox())!;
        await installTransitionProbe(page);

        await page.keyboard.down("Space");
        await expect(origin.locator("input")).toHaveCount(0);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        expect(await readTransitionProbe(page)).toEqual({ updates: 0, selectionMutations: 0 });
        expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
        expect(await readGridProjectState(page)).toEqual(stateBefore);
        expect(await undoDepth(page)).toBe(undoBefore);
        await page.mouse.up();
        await page.keyboard.up("Space");

        expect(await readTransitionProbe(page)).toEqual({ updates: 0, selectionMutations: 0 });
        await expect(origin.locator("input")).toHaveCount(0);
        expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
        expect(await readGridProjectState(page)).toEqual(stateBefore);
        expect(await undoDepth(page)).toBe(undoBefore);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
        await page.evaluate(() => {
            (globalThis as typeof globalThis & { __zeroPanProbe: { stop: () => void; }; }).__zeroPanProbe.stop();
        });
    });

    test("secondary button transition cannot discard a Space-first release guard", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const selectionBefore = await selectedCellIdentity(grid);
        const stateBefore = await readGridProjectState(page);
        const undoBefore = await undoDepth(page);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down({ button: "left" });
        await page.keyboard.up("Space");
        await page.mouse.down({ button: "right" });
        await page.mouse.up({ button: "right" });
        await expect(page.locator(".context-menu-overlay")).toHaveCount(0);
        await page.mouse.up({ button: "left" });

        await expect(origin.locator("input")).toHaveCount(0);
        expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
        expect(await readGridProjectState(page)).toEqual(stateBefore);
        expect(await undoDepth(page)).toBe(undoBefore);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
    });
});

function selectedCellIdentity(grid: import("@playwright/test").Locator): Promise<(string | null)[][]> {
    return grid.locator("td.grid-selected").evaluateAll(cells =>
        cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
    );
}

async function installTransitionProbe(page: import("@playwright/test").Page): Promise<void> {
    await page.evaluate(() => {
        type Doc = {
            on: (name: string, callback: () => void) => void;
            off: (name: string, callback: () => void) => void;
        };
        type Probe = { updates: number; selectionMutations: number; stop: () => void; };
        const browser = globalThis as typeof globalThis & {
            __YJS_STORE__?: {
                yjsClient?: {
                    getProject?: () => {
                        ydoc?: Doc & {
                            getMap: (
                                name: string,
                            ) => { values: () => IterableIterator<{ get: (name: string) => Doc | undefined; }>; };
                        };
                    };
                };
            };
            __zeroPanProbe?: Probe;
        };
        const project = browser.__YJS_STORE__?.yjsClient?.getProject?.();
        if (!project?.ydoc) throw new Error("Project document unavailable for zero-distance pan probe");
        const probe: Probe = { updates: 0, selectionMutations: 0, stop: () => {} };
        const onUpdate = () => probe.updates++;
        const documents: Doc[] = [project.ydoc];
        for (const entry of project.ydoc.getMap("yjsTables").values()) {
            const tableDoc = entry.get("doc");
            if (tableDoc) documents.push(tableDoc);
        }
        for (const document of documents) document.on("update", onUpdate);
        const observer = new MutationObserver(records => {
            probe.selectionMutations += records.filter(record =>
                record.type === "attributes" && record.target instanceof HTMLElement
                && record.target.matches("td, th") && ["class", "aria-selected"].includes(record.attributeName ?? "")
            ).length;
        });
        observer.observe(document.querySelector("[data-testid='yjs-table-grid']")!, {
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "aria-selected"],
        });
        probe.stop = () => {
            for (const document of documents) document.off("update", onUpdate);
            observer.disconnect();
        };
        browser.__zeroPanProbe = probe;
    });
}

function readTransitionProbe(
    page: import("@playwright/test").Page,
): Promise<{ updates: number; selectionMutations: number; }> {
    return page.evaluate(() => {
        const probe = (globalThis as typeof globalThis & {
            __zeroPanProbe: { updates: number; selectionMutations: number; };
        }).__zeroPanProbe;
        return { updates: probe.updates, selectionMutations: probe.selectionMutations };
    });
}
