/** @feature GRD-2f86c1a9 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow, prepareKeyboardGrid } from "../utils/gridKeyboardFixture";
import { commitWidthsProduction, expectAutoColumn, expectFixedWidth, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("live multiline drafts survive real column and viewport reflow without source writes",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const [firstId, secondId] = await prepareKeyboardGrid(page, testInfo);
        const gridId = await singleGridId(page);
        await commitWidthsProduction(page, gridId, { title: 180 });
        await expectFixedWidth(page, 0, "title", 180);

        const firstCell = keyboardTaskRow(page, firstId).locator('td[data-col="title"]');
        const secondRow = keyboardTaskRow(page, secondId);
        const originalSource = (await readGridProjectState(page)).tables[0].data;
        await firstCell.locator("button.cell-value").click();
        const editor = firstCell.locator("textarea.cell-input");
        await expect(editor).toBeFocused();

        const draft = "日本語の長いテキスト".repeat(24);
        await editor.fill(draft);
        await editor.press("Control+End");
        const initial = await editor.evaluate(node => ({
            height: node.getBoundingClientRect().height,
            scroll: node.scrollHeight,
            client: node.clientHeight,
            start: (node as HTMLTextAreaElement).selectionStart,
        }));
        expect(initial.height).toBeGreaterThan(0);
        expect(initial.scroll).toBeGreaterThanOrEqual(initial.client);
        expect(initial.start).toBe(draft.length);

        // When the viewport is shorter than three lines, the 40% cap wins.
        await page.setViewportSize({ width: 1280, height: 140 });
        await expect.poll(() => editor.evaluate(node => node.getBoundingClientRect().height))
            .toBeLessThanOrEqual(140 * 0.4 + 1);
        await expect(editor).toHaveValue(draft);
        await expect(editor).toBeFocused();
        expect(await editor.evaluate(node => (node as HTMLTextAreaElement).selectionStart)).toBe(draft.length);

        await page.setViewportSize({ width: 1280, height: 900 });
        await commitWidthsProduction(page, gridId, { title: 260 });
        await expectFixedWidth(page, 0, "title", 260);
        await expect(editor).toHaveValue(draft);
        await expect(editor).toBeFocused();
        expect(await editor.evaluate(node => (node as HTMLTextAreaElement).selectionStart)).toBe(draft.length);

        const bounds = await editor.evaluate(node => {
            const textarea = node.getBoundingClientRect();
            const cell = node.closest("td")!.getBoundingClientRect();
            const row = node.closest("tr")!.getBoundingClientRect();
            return {
                textarea: { left: textarea.left, right: textarea.right, bottom: textarea.bottom },
                cell: { left: cell.left, right: cell.right },
                rowBottom: row.bottom,
            };
        });
        expect(bounds.textarea.left).toBeGreaterThanOrEqual(bounds.cell.left - 1);
        expect(bounds.textarea.right).toBeLessThanOrEqual(bounds.cell.right + 1);
        expect(bounds.textarea.bottom).toBeLessThanOrEqual(bounds.rowBottom + 1);
        const nextRowBox = await secondRow.boundingBox();
        expect(nextRowBox).not.toBeNull();
        expect(nextRowBox!.y).toBeGreaterThanOrEqual(bounds.rowBottom - 1);

        // Clearing the width is an authorized Grid config change, not a text edit.
        await commitWidthsProduction(page, gridId, { title: undefined });
        await expectAutoColumn(page, 0, "title");
        await expect(editor).toHaveValue(draft);
        const afterWidthChanges = await readGridProjectState(page);
        expect(afterWidthChanges.tables[0].data).toEqual(originalSource);

        await editor.press("Control+End");
        await editor.type(" tail");
        await expect(editor).toHaveValue(`${draft} tail`);
        for (
            const softWrapped of [
                "A long English paragraph with spaces. ".repeat(25),
                "unbrokenlongword".repeat(80),
            ]
        ) {
            await editor.fill(softWrapped);
            await expect(editor).toHaveValue(softWrapped);
            expect(await editor.evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(
                await editor.evaluate(node => node.clientWidth + 1),
            );
        }
        await editor.press("Escape");
        await expect(firstCell.locator("textarea.cell-input")).toHaveCount(0);
        await expect(firstCell.locator("button.cell-value")).toHaveText("Alpha");
        expect(await readGridProjectState(page)).toEqual(afterWidthChanges);
    });
