/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { undoDepth } from "../utils/gridResizeHelpers";
import { pressResizeHandle } from "../utils/gridResizeHelpers";
import { readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

async function setWideColumns(page: import("@playwright/test").Page): Promise<void> {
    const view = page.getByTestId("yjs-table-view").first();
    for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
        const input = view.getByTestId(`yjs-table-width-${column}`);
        await input.fill("300");
        await input.press("Enter");
    }
}

async function dragWhileHoldingSpace(
    page: import("@playwright/test").Page,
    target: import("@playwright/test").Locator,
    dx: number,
): Promise<void> {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.keyboard.down("Space");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Space");
}

test.describe("Grid Space pan authoritative boundaries (#5863)", () => {
    test(
        "both directions clamp without changing selection, data, definition, vertical offset, or history",
        async ({ page }, info) => {
            const [firstRowId] = await prepareKeyboardGrid(page, info);
            await setWideColumns(page);
            const grid = page.getByTestId("yjs-table-grid");
            const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
            await selectAndFocusCell(cell);
            const beforeState = await readGridProjectState(page);
            const beforeUndo = await undoDepth(page);
            expect(beforeUndo).toBeGreaterThanOrEqual(0);
            const beforeSelection = await grid.locator("td.grid-selected").evaluateAll(cells =>
                cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
            );
            const beforeTop = await grid.evaluate(element => element.scrollTop);

            await page.evaluate(() => {
                interface BrowserProbe {
                    updates: number;
                    selectionMutations: number;
                    stop: () => void;
                }
                interface ObservableDoc {
                    on: (name: string, callback: () => void) => void;
                    off: (name: string, callback: () => void) => void;
                }
                interface BrowserGlobal {
                    __YJS_STORE__?: {
                        yjsClient?: {
                            getProject?: () => {
                                ydoc?: ObservableDoc & {
                                    getMap: (name: string) => {
                                        values: () => IterableIterator<
                                            { get: (name: string) => ObservableDoc | undefined; }
                                        >;
                                    };
                                };
                            };
                        };
                    };
                    __panTransitionProbe?: BrowserProbe;
                }
                const browser = globalThis as typeof globalThis & BrowserGlobal;
                const project = browser.__YJS_STORE__?.yjsClient?.getProject?.();
                if (!project?.ydoc) throw new Error("Project document unavailable for pan transition probe");
                const probe = { updates: 0, selectionMutations: 0, stop: () => {} };
                const onUpdate = () => probe.updates++;
                const documents: ObservableDoc[] = [project.ydoc];
                for (const entry of project.ydoc.getMap("yjsTables").values()) {
                    const tableDoc = entry.get("doc");
                    if (tableDoc) documents.push(tableDoc);
                }
                for (const document of documents) document.on("update", onUpdate);
                const observer = new MutationObserver(records => {
                    probe.selectionMutations += records.filter(record =>
                        record.type === "attributes"
                        && record.target instanceof HTMLElement
                        && record.target.matches("td, th")
                        && ["class", "aria-selected"].includes(record.attributeName ?? "")
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
                browser.__panTransitionProbe = probe;
            });

            const box = (await cell.boundingBox())!;
            await page.keyboard.down("Space");
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x - 10_000, box.y + box.height / 2, { steps: 4 });
            expect(
                await page.evaluate(() => {
                    const probe = (globalThis as typeof globalThis & {
                        __panTransitionProbe: { updates: number; selectionMutations: number; };
                    }).__panTransitionProbe;
                    return { updates: probe.updates, selectionMutations: probe.selectionMutations };
                }),
            ).toEqual({ updates: 0, selectionMutations: 0 });
            expect(await undoDepth(page)).toBe(beforeUndo);
            await page.mouse.up();
            await page.keyboard.up("Space");
            await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBe(
                await grid.evaluate(element => element.scrollWidth - element.clientWidth),
            );
            const rightmostCell = grid.locator("td[data-col='repeat_days']").first();
            await dragWhileHoldingSpace(page, rightmostCell, 10_000);
            expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);

            expect(await grid.evaluate(element => element.scrollTop)).toBe(beforeTop);
            expect(
                await grid.locator("td.grid-selected").evaluateAll(cells =>
                    cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
                ),
            ).toEqual(beforeSelection);
            expect(await readGridProjectState(page)).toEqual(beforeState);
            expect(await undoDepth(page)).toBe(beforeUndo);
            expect(
                await page.evaluate(() => {
                    const probe = (globalThis as typeof globalThis & {
                        __panTransitionProbe: { updates: number; selectionMutations: number; };
                    }).__panTransitionProbe;
                    return { updates: probe.updates, selectionMutations: probe.selectionMutations };
                }),
            ).toEqual({ updates: 0, selectionMutations: 0 });
            await page.evaluate(() =>
                (globalThis as typeof globalThis & { __panTransitionProbe: { stop: () => void; }; })
                    .__panTransitionProbe.stop()
            );
        },
    );

    test("no-overflow and open-editor Space remain native no-op/input paths", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        const grid = page.getByTestId("yjs-table-grid");
        expect(await grid.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(cell);
        await dragWhileHoldingSpace(page, cell, -120);
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);

        await cell.locator("button").click();
        const editor = cell.locator("input");
        await editor.press("End");
        await editor.press("Space");
        await expect(editor).toHaveValue("Alpha ");
        await editor.press("Escape");
    });

    test("read-only query results pan without writes or history", async ({ page }, info) => {
        await prepareKeyboardGrid(page, info);
        const view = page.getByTestId("yjs-table-view");
        await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(
            page,
            "SELECT status, count(*) AS count FROM keyboard_tasks GROUP BY status ORDER BY status",
        );
        for (const column of ["status", "count"]) {
            const width = view.getByTestId(`yjs-table-width-${column}`);
            await width.fill("700");
            await width.press("Enter");
        }
        const grid = page.getByTestId("yjs-table-grid");
        await expect(view.getByTestId("grid-readonly-reason")).toBeVisible();
        const before = await readGridProjectState(page);
        const history = await undoDepth(page);
        const cell = grid.locator("td[data-col='count']").first();
        await cell.locator("button").focus();
        await dragWhileHoldingSpace(page, cell, -100);
        await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        expect(await readGridProjectState(page)).toEqual(before);
        expect(await undoDepth(page)).toBe(history);
    });

    test("native input and IME editor starts are excluded from pan admission", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        await setWideColumns(page);
        const grid = page.getByTestId("yjs-table-grid");
        const row = keyboardTaskRow(page, firstRowId);
        const title = row.locator("td[data-col='title']");
        const status = row.locator("td[data-col='status'] select");
        await selectAndFocusCell(title);

        await page.keyboard.down("Space");
        const selectBox = (await status.boundingBox())!;
        await page.mouse.move(selectBox.x + selectBox.width / 2, selectBox.y + selectBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(selectBox.x - 100, selectBox.y + selectBox.height / 2);
        await page.mouse.up();
        await page.keyboard.up("Space");
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);
        await status.selectOption("done");
        await expect(status).toHaveValue("done");

        await title.locator("button").click();
        const editor = title.locator("input");
        await editor.dispatchEvent("compositionstart", { data: " " });
        await page.keyboard.down("Space");
        const editorBox = (await editor.boundingBox())!;
        await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(editorBox.x - 100, editorBox.y + editorBox.height / 2);
        await page.mouse.up();
        await page.keyboard.up("Space");
        await editor.dispatchEvent("compositionend", { data: " " });
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);
        await expect(editor).toBeFocused();
    });

    test("an armed Grid leaves its dedicated resize handle in control", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        await setWideColumns(page);
        const grid = page.getByTestId("yjs-table-grid");
        const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(cell);
        const beforeScroll = await grid.evaluate(element => element.scrollLeft);
        const beforeWidth = await viewWidth(page, "title");
        await page.keyboard.down("Space");
        const press = await pressResizeHandle(page, 0, "title");
        await page.mouse.move(press.x + 30, press.y, { steps: 3 });
        await page.mouse.up();
        await page.keyboard.up("Space");
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(beforeScroll);
        await expect.poll(() => viewWidth(page, "title")).toBe(beforeWidth + 30);
    });

    test("two placements keep browser scroll offsets isolated", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        await setWideColumns(page);
        const gridId = (await readWidthGridRegistry(page))[0].gridId;
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").last();
        await panel.getByRole("button", { name: "Existing Grid" }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(gridId);
        await panel.getByTestId("yjs-grid-select-existing").click();
        const grids = page.getByTestId("yjs-table-grid");
        await expect(grids).toHaveCount(2);

        const firstCell = grids.first().locator(`tr[data-record-id='${firstRowId}'] td[data-col='title']`);
        await selectAndFocusCell(firstCell);
        await dragWhileHoldingSpace(page, firstCell, -100);
        await expect.poll(() => grids.first().evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        expect(await grids.nth(1).evaluate(element => element.scrollLeft)).toBe(0);
    });
});

async function viewWidth(page: import("@playwright/test").Page, column: string): Promise<number> {
    return Number(await page.getByTestId("yjs-table-width-" + column).inputValue());
}
