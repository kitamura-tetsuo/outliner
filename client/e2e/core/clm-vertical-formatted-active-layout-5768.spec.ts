import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, type Page, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

async function bodyIds(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).slice(1)
    );
}

async function place(page: Page, itemId: string, offset: number): Promise<void> {
    await TestHelpers.setCursor(page, itemId, offset);
    await page.locator("textarea.global-textarea").focus();
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
}

async function assertExactLocalCaret(page: Page, itemId: string, offset: number): Promise<void> {
    await expect.poll(async () => {
        const state = await CursorValidator.getCursorData(page);
        const instances = state.cursorInstances.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        const overlays = state.cursors.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        return [
            state.activeItemId,
            instances.length,
            instances[0]?.itemId,
            instances[0]?.offset,
            overlays.length,
            overlays[0]?.itemId,
            overlays[0]?.offset,
        ];
    }).toEqual([itemId, 1, itemId, offset, 1, itemId, offset]);
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
    await expect(page.locator(".cursor")).toHaveCount(1);
}

test.describe("REQ-006: formatted destinations use their active editing layout", () => {
    for (
        const scenario of [
            { name: "Down", lines: ["abcdefghijklmnopqrst", "[[abc]]"], source: 0, target: 1, key: "ArrowDown" },
            { name: "Up", lines: ["[[abc]]", "abcdefghijklmnopqrst"], source: 1, target: 0, key: "ArrowUp" },
        ] as const
    ) {
        test(`${scenario.name} resolves the active formatted model endpoint`, async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, [...scenario.lines]);
            const ids = await bodyIds(page);
            const target = page.locator(`[data-item-id="${ids[scenario.target]}"] .item-text`);
            await expect(target).toHaveText("abc");

            await place(page, ids[scenario.source], scenario.lines[scenario.source].length);
            await page.keyboard.press(scenario.key);

            await assertExactLocalCaret(page, ids[scenario.target], 7);
            await expect(target).toHaveText("[[abc]]");
            await expect(page.locator(`[data-item-id="${ids[scenario.source]}"] .item-text`))
                .toHaveText(scenario.lines[scenario.source]);
        });
    }

    test("Down chooses the nearest caret on the active target's first visual row", async ({ page }, testInfo) => {
        const formatted = `[[${"mixed日本語Wi".repeat(8)}]]`;
        await page.setViewportSize({ width: 360, height: 720 });
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["WWWWWWWWWWWW", formatted]);
        const ids = await bodyIds(page);
        const target = page.locator(`[data-item-id="${ids[1]}"] .item-text`);
        await expect(target).not.toHaveText(formatted);

        await place(page, ids[0], 6);
        const sourceX = await page.evaluate(itemId => {
            const node = document.querySelector(`[data-item-id="${CSS.escape(itemId)}"] .item-text`)!.firstChild!;
            const range = document.createRange();
            range.setStart(node, 6);
            range.collapse(true);
            return range.getBoundingClientRect().left;
        }, ids[0]);
        await page.keyboard.press("ArrowDown");

        const oracle = await target.evaluate((element, goalX) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodes: Text[] = [];
            for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
            const candidates: Array<{ offset: number; x: number; y: number; }> = [];
            let modelOffset = 0;
            for (const node of nodes) {
                for (let offset = 0; offset <= node.data.length; offset += 1) {
                    const range = document.createRange();
                    range.setStart(node, offset);
                    range.collapse(true);
                    const rect = range.getBoundingClientRect();
                    candidates.push({ offset: modelOffset + offset, x: rect.left, y: rect.top });
                }
                modelOffset += node.data.length;
            }
            const firstY = Math.min(...candidates.map(candidate => candidate.y));
            const firstRow = candidates.filter(candidate => Math.abs(candidate.y - firstY) <= 2);
            const nearest = firstRow.reduce((best, candidate) => {
                const distance = Math.abs(candidate.x - goalX);
                const bestDistance = Math.abs(best.x - goalX);
                return distance < bestDistance || (distance === bestDistance && candidate.offset < best.offset)
                    ? candidate
                    : best;
            });
            return { nearest, rows: new Set(candidates.map(candidate => Math.round(candidate.y))).size };
        }, sourceX);
        expect(oracle.rows).toBeGreaterThan(1);
        await assertExactLocalCaret(page, ids[1], oracle.nearest.offset);
        await expect(target).toHaveText(formatted);
    });
});
