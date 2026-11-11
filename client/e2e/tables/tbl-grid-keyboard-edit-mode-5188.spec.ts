import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow as taskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard edit mode (#5188)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
    });

    test("F2 opens the active cell for editing without a mouse", async ({ page }) => {
        const titleCell = taskRow(page, firstRowId).locator(
            "td[data-col='title']",
        );
        await selectAndFocusCell(titleCell);
        await page.keyboard.press("F2");
        await expect(titleCell.locator("textarea")).toBeVisible();
        await expect(titleCell.locator("textarea")).toBeFocused();
    });

    test("typing a printable character replaces the cell content and starts editing", async ({ page }) => {
        const titleCell = taskRow(page, firstRowId).locator(
            "td[data-col='title']",
        );
        await selectAndFocusCell(titleCell);
        await page.keyboard.press("X");
        await expect(titleCell.locator("textarea")).toHaveValue("X");
    });

    test("Enter commits the edit and moves the active cell down", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const titleCell = firstRow.locator("td[data-col='title']");
        // A click on the display button already opens the editor (see TextCell).
        await titleCell.locator("button").click();
        await expect(titleCell.locator("textarea")).toBeFocused();
        await titleCell.locator("textarea").fill("Renamed via keyboard");
        await page.keyboard.press("Enter");

        await expect(titleCell.locator("textarea")).not.toBeVisible();
        await expect(titleCell.locator("button")).toHaveText("Renamed via keyboard", { timeout: 30000 });
        const secondRow = taskRow(page, secondRowId);
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
    });

    test("Escape cancels an in-progress edit and Tab commits + moves right instead", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const titleCell = firstRow.locator("td[data-col='title']");
        const originalTitle = (await titleCell.locator("button").textContent())?.trim() ?? "";

        await titleCell.locator("button").click();
        await expect(titleCell.locator("textarea")).toBeFocused();
        await titleCell.locator("textarea").fill("Discarded edit");
        await page.keyboard.press("Escape");
        await expect(titleCell.locator("textarea")).not.toBeVisible();
        await expect(titleCell.locator("button")).toHaveText(originalTitle, { timeout: 30000 });

        await expect(titleCell.locator("button")).toBeFocused();
        await titleCell.locator("button").click();

        await expect(titleCell.locator("textarea")).toBeFocused();
        await titleCell.locator("textarea").fill("Committed via Tab");
        await page.keyboard.press("Tab");
        await expect(titleCell.locator("textarea")).not.toBeVisible({ timeout: 10000 });
        await expect(titleCell.locator("button")).toHaveText("Committed via Tab", { timeout: 30000 });
        await expect(firstRow.locator("td[data-col='status']")).toHaveClass(/grid-active/);
    });

    test("Table text accepts hard breaks and the editor follows content within the viewport cap", async ({ page }) => {
        const titleCell = taskRow(page, firstRowId).locator("td[data-col='title']");
        await titleCell.locator("button").click();
        const editor = titleCell.locator("textarea.cell-input");
        await expect(editor).toBeFocused();

        const initial = await editor.evaluate(node => ({
            height: node.clientHeight,
            line: Number.parseFloat(getComputedStyle(node).lineHeight),
        }));
        expect(initial.height).toBeGreaterThanOrEqual(initial.line * 3 - 2);
        await editor.fill(Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n"));
        const grown = await editor.evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight }));
        expect(grown.height).toBeGreaterThan(initial.height);
        expect(grown.height).toBeLessThanOrEqual(
            (await page.evaluate(() => visualViewport?.height ?? innerHeight)) * 0.4 + 1,
        );
        expect(grown.scroll).toBeGreaterThanOrEqual(grown.height);

        await editor.press("Control+End");
        await editor.type(" tail");
        await expect(editor).toHaveValue(/line 11 tail$/);
        await editor.fill("short again");
        const shrunk = await editor.evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight }));
        expect(shrunk.height).toBe(initial.height);
        expect(shrunk.scroll).toBeLessThanOrEqual(shrunk.height + 1);

        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.evaluate(() => navigator.clipboard.writeText("first\nsecond"));
        await editor.fill("");
        await editor.press("Control+V");
        await expect(editor).toHaveValue("first\nsecond");
        await page.evaluate(() => navigator.clipboard.writeText("CRLF\r\nclipboard"));
        await editor.fill("");
        await editor.press("Control+V");
        await expect(editor).toHaveValue("CRLF\nclipboard");
        await editor.fill("first");
        await editor.press("Alt+Enter");
        await editor.type("second");
        await expect(editor).toHaveValue("first\nsecond");
        await editor.press("Enter");
        await expect(titleCell.locator("button.cell-value")).toHaveText("first\nsecond", { timeout: 30000 });

        await titleCell.locator("button.cell-value").click();
        await expect(titleCell.locator("textarea.cell-input")).toHaveValue("first\nsecond");
    });

    test("Chromium IME confirmation keeps the native multiline editor open until the next ordinary Enter",
        async ({ page, browserName }) => {
            const titleCell = taskRow(page, firstRowId).locator("td[data-col='title']");
            const before = await readGridProjectState(page);
            const beforeItems = await page.locator(".outliner-item[data-item-id]").count();
            await titleCell.locator("button.cell-value").click();
            const editor = titleCell.locator("textarea.cell-input");
            await editor.fill("");
            await expect(editor).toBeFocused();
            if (browserName === "chromium") {
                const cdp = await page.context().newCDPSession(page);
                try {
                    // Browser-generated composition events and an actual IME
                    // confirmation key, rather than manually dispatched DOM events.
                    await cdp.send("Input.imeSetComposition", {
                        text: "日本語",
                        selectionStart: 3,
                        selectionEnd: 3,
                    });
                    await expect(editor).toHaveValue("日本語");
                    await page.keyboard.press("Enter");
                    await expect(editor).toHaveValue("日本語");
                    await expect(editor).toBeFocused();
                    // The browser's IME commit completes composition without
                    // inserting a second copy or an extra hard break.
                    await cdp.send("Input.insertText", { text: "日本語" });
                    await expect(editor).toHaveValue("日本語");
                } finally {
                    await cdp.detach();
                }
            } else {
                // Keep the ordinary native text-input assertion on other engines.
                await page.keyboard.insertText("日本語");
                await expect(editor).toHaveValue("日本語");
            }
            expect(await readGridProjectState(page)).toEqual(before);
            expect(await page.locator(".outliner-item[data-item-id]").count()).toBe(beforeItems);
            await editor.press("Enter");
            await expect(titleCell.locator("textarea.cell-input")).toHaveCount(0);
            await expect(titleCell.locator("button.cell-value")).toHaveText("日本語", { timeout: 30000 });
            await expect.poll(async () => (await readGridProjectState(page)).tables[0].data[firstRowId]?.title)
                .toBe("日本語");
        });

    test("a focused select cell keeps native arrow-key behavior instead of navigating the grid", async ({ page }) => {
        const statusCell = taskRow(page, firstRowId).locator("td[data-col='status']");
        const select = statusCell.locator("select");
        await select.click();
        await expect(statusCell).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowDown");
        // Grid must not steal arrow keys from a focused native select, or move
        // the active cell away while the select still owns the keystroke.
        await expect(select).toBeFocused();
        await expect(statusCell).toHaveClass(/grid-active/);
    });
});
