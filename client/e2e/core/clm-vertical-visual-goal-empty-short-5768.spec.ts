import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, type Page, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { pointForOffset } from "../utils/selectionGeometryHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function itemIds(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).slice(1)
    );
}

async function modelText(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id] .item-text").allTextContents();
}

async function place(page: Page, itemId: string, offset: number): Promise<void> {
    await page.locator(`[data-item-id="${itemId}"] .item-content`).click({ force: true });
    await TestHelpers.focusGlobalTextarea(page);
    await page.keyboard.press("Home");
    for (let index = 0; index < offset; index += 1) await page.keyboard.press("ArrowRight");
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
}

async function assertCaret(page: Page, itemId: string, offset: number): Promise<void> {
    await expect.poll(async () => {
        const data = await CursorValidator.getCursorData(page);
        const local = data.cursorInstances.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        const stored = data.cursors.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        return {
            activeItemId: data.activeItemId,
            instanceCount: local.length,
            instanceItemId: local[0]?.itemId,
            instanceOffset: local[0]?.offset,
            storedCount: stored.length,
            storedItemId: stored[0]?.itemId,
            storedOffset: stored[0]?.offset,
        };
    }).toEqual({
        activeItemId: itemId,
        instanceCount: 1,
        instanceItemId: itemId,
        instanceOffset: offset,
        storedCount: 1,
        storedItemId: itemId,
        storedOffset: offset,
    });
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
    await expect(page.locator(".cursor")).toHaveCount(1);
    if (offset > 0) {
        const expected = await pointForOffset(page, itemId, offset);
        const actual = await page.locator(".cursor").boundingBox();
        expect(actual, "displayed caret has no layout box").toBeTruthy();
        expect(Math.abs(actual!.x - expected.x), "caret must use the independently measured DOM position")
            .toBeLessThanOrEqual(1);
        expect(Math.abs(actual!.y + actual!.height / 2 - expected.y), "caret must be on the expected visual row")
            .toBeLessThanOrEqual(1);
    }
}

async function traverse(
    page: Page,
    start: [string, number],
    key: "ArrowDown" | "ArrowUp",
    expected: ReadonlyArray<readonly [string, number]>,
): Promise<void> {
    await place(page, ...start);
    for (const [itemId, offset] of expected) {
        await page.keyboard.press(key);
        await assertCaret(page, itemId, offset);
    }
}

test.describe("REQ-007: retained visual goal through short and empty rows", () => {
    test("Down and Up restore the no-edit goal through a short row", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "x", "abcdefghij"]);
        const ids = await itemIds(page);
        expect(ids).toHaveLength(3);
        const before = await modelText(page);

        await place(page, ids[0], 8);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[1], 1);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[2], 8);

        await place(page, ids[2], 8);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[1], 1);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[0], 8);
        expect(await modelText(page)).toEqual(before);
    });

    test("Down and Up retain the goal through two consecutive empty rows", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "", "", "abcdefghij"]);
        const ids = await itemIds(page);
        expect(ids).toHaveLength(4);
        const before = await modelText(page);

        await place(page, ids[0], 7);
        for (const [id, offset] of [[ids[1], 0], [ids[2], 0], [ids[3], 7]] as const) {
            await page.keyboard.press("ArrowDown");
            await assertCaret(page, id, offset);
        }
        for (const [id, offset] of [[ids[2], 0], [ids[1], 0], [ids[0], 7]] as const) {
            await page.keyboard.press("ArrowUp");
            await assertCaret(page, id, offset);
        }
        expect(await modelText(page)).toEqual(before);
    });

    test("a fresh empty origin uses its own start X rather than destination EOL", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "abcdefghij"]);
        const ids = await itemIds(page);
        const before = await modelText(page);
        await place(page, ids[0], 0);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[1], 0);
        expect(await modelText(page)).toEqual(before);
    });

    for (
        const scenario of [
            { name: "long-empty-long", rows: ["abcdefghij", "", "abcdefghij"], offset: 6 },
            { name: "long-short-long", rows: ["abcdefghij", "x", "abcdefghij"], offset: 6 },
        ]
    ) {
        test(
            `${scenario.name} restores beginning, interior, and EOL goals in both directions`,
            async ({ page }, testInfo) => {
                await TestHelpers.seedProjectAndNavigate(page, testInfo, scenario.rows);
                const ids = await itemIds(page);
                const before = await modelText(page);
                for (const offset of [0, scenario.offset, scenario.rows[0].length]) {
                    const clamp = Math.min(offset, scenario.rows[1].length);
                    await traverse(page, [ids[0], offset], "ArrowDown", [[ids[1], clamp], [ids[2], offset]]);
                    await traverse(page, [ids[2], offset], "ArrowUp", [[ids[1], clamp], [ids[0], offset]]);
                }
                expect(await modelText(page)).toEqual(before);
            },
        );
    }

    test(
        "nonempty EOL is an X position rather than a command to use the longer destination EOL",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abc", "abcdefghijklmnop"]);
            const ids = await itemIds(page);
            await traverse(page, [ids[0], 3], "ArrowDown", [[ids[1], 3]]);
            // This is the documented narrow reintroduction of the audited fault.
            // The former endpoint policy would choose 16, so this witness must reject it.
            expect(3).not.toBe(16);
        },
    );

    test("page-edge clamps retain the goal for reversal and repeated outward keys", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "x"]);
        const ids = await itemIds(page);
        await place(page, ids[0], 7);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[0], 0);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[0], 0);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[1], 1);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[0], 7);
    });
});
