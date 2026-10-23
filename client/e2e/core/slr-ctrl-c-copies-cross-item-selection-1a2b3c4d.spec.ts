import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const BODY_LINES = ["Line 1", "Line 2", "Line 3"];
const EXPECTED_CLIPBOARD = BODY_LINES.join("\n");

async function seededItemId(page: Page, text: string, title = false) {
    const matches = await page.locator(".outliner-item[data-item-id]").evaluateAll(
        (rows, expected) =>
            rows.filter(row => {
                const itemText = row.querySelector(".item-text");
                return itemText?.textContent === expected.text
                    && itemText.classList.contains("title-text") === expected.title;
            }).map(row => row.getAttribute("data-item-id")),
        { text, title },
    );
    expect(matches, `one seeded ${title ? "title" : "body item"} named ${text}`).toHaveLength(1);
    expect(matches[0]).toBeTruthy();
    return matches[0]!;
}

async function localEditorState(page: Page) {
    return page.evaluate(() => {
        const store = globalThis.editorOverlayStore! as unknown as {
            cursors: Record<string, { userId?: string; itemId: string; offset: number; isActive: boolean; }>;
            selections: Record<string, {
                userId?: string;
                startItemId: string;
                startOffset?: number;
                endItemId: string;
                endOffset?: number;
                isReversed?: boolean;
            }>;
            activeItemId: string | undefined;
            getSelectedText: (userId: string) => string;
        };
        return {
            cursors: Object.values(store.cursors).filter(cursor => (cursor.userId ?? "local") === "local").map(
                cursor => ({
                    itemId: cursor.itemId,
                    offset: cursor.offset,
                    isActive: cursor.isActive,
                }),
            ),
            selections: Object.values(store.selections).filter(selection => (selection.userId ?? "local") === "local")
                .map(selection => ({
                    startItemId: selection.startItemId,
                    startOffset: selection.startOffset,
                    endItemId: selection.endItemId,
                    endOffset: selection.endOffset,
                    isReversed: Boolean(selection.isReversed),
                })),
            activeItemId: store.activeItemId,
            editorFocused: document.activeElement === document.querySelector(".global-textarea"),
            selectedText: store.getSelectedText("local"),
        };
    });
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
    await testInfo.attach(`${name}.json`, {
        body: Buffer.from(JSON.stringify(value, undefined, 2)),
        contentType: "application/json",
    });
}

async function expectTitleEndCaret(
    page: Page,
    titleId: string,
    titleLength: number,
    testInfo: TestInfo,
    evidenceName: string,
    timeout = 10_000,
) {
    let observation: Awaited<ReturnType<typeof localEditorState>> | undefined;
    try {
        await expect.poll(async () => observation = await localEditorState(page), { timeout })
            .toEqual(titleEndCaretState(titleId, titleLength));
    } finally {
        await attachJson(testInfo, evidenceName, observation);
    }
}

function titleEndCaretState(titleId: string, titleLength: number) {
    return {
        cursors: [{ itemId: titleId, offset: titleLength, isActive: true }],
        selections: [],
        activeItemId: titleId,
        editorFocused: true,
        selectedText: "",
    };
}

async function selectThreeBodyLines(
    page: Page,
    titleId: string,
    titleLength: number,
    thirdBodyId: string,
    testInfo: TestInfo,
) {
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowDown");
    let observation: Awaited<ReturnType<typeof localEditorState>> | undefined;
    try {
        await expect.poll(async () => observation = await localEditorState(page), { timeout: 10_000 }).toMatchObject({
            selections: [{
                startItemId: titleId,
                startOffset: titleLength,
                endItemId: thirdBodyId,
                endOffset: BODY_LINES[2].length,
                isReversed: false,
            }],
            editorFocused: true,
            selectedText: EXPECTED_CLIPBOARD,
        });
    } finally {
        await attachJson(testInfo, "final-selection", observation);
    }
}

async function expectActualClipboard(
    page: Page,
    testInfo: TestInfo,
    evidenceName: string,
) {
    const actualClipboard = await page.evaluate(() => navigator.clipboard.readText());
    await attachJson(testInfo, evidenceName, { actualClipboard });
    expect(actualClipboard).toBe(EXPECTED_CLIPBOARD);
}

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

test.describe("Ctrl+C copies cross-item selection", () => {
    test("copies exact selected text via mouse drag", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);

        const item1 = page.locator(".item-text").nth(0);
        const item3 = page.locator(".item-text").nth(3);
        await item1.hover();
        await page.mouse.down();
        await item3.hover();
        await page.mouse.up();

        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe(EXPECTED_CLIPBOARD);
    });

    test("copies exact selected text via Shift+ArrowDown", async ({ page }) => {
        const testInfo = test.info();
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const bodyIds = await Promise.all(BODY_LINES.map(line => seededItemId(page, line)));
        const title = page.locator(`[data-item-id="${titleId}"] .item-text.title-text`);

        await title.click();
        await page.keyboard.press("End");
        await expectTitleEndCaret(page, titleId, pageName.length, testInfo, "initial-caret");
        await selectThreeBodyLines(page, titleId, pageName.length, bodyIds[2], testInfo);

        const sentinel = `uncopied-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(sentinel);
        await page.keyboard.press("Control+c");
        await expectActualClipboard(page, testInfo, "actual-clipboard");
    });

    test("rejects a title-start origin before copy", async ({ page }) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const sentinel = `wrong-origin-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);

        await page.locator(`[data-item-id="${titleId}"] .item-text.title-text`).click();
        await page.keyboard.press("Home");
        await expect.poll(() => localEditorState(page), { timeout: 10_000 })
            .toEqual(titleEndCaretState(titleId, 0));
        await expect(
            expectTitleEndCaret(page, titleId, pageName.length, test.info(), "rejected-wrong-origin", 1_000),
        ).rejects.toThrow();
        const actualClipboard = await page.evaluate(() => navigator.clipboard.readText());
        await attachJson(test.info(), "wrong-origin-clipboard", { actualClipboard });
        expect(actualClipboard).toBe(sentinel);
    });

    test("does not accept a stale clipboard when copy is a no-op", async ({ page }) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const thirdBodyId = await seededItemId(page, BODY_LINES[2]);
        await page.locator(`[data-item-id="${titleId}"] .item-text.title-text`).click();
        await page.keyboard.press("End");
        await expectTitleEndCaret(page, titleId, pageName.length, test.info(), "initial-caret");
        await selectThreeBodyLines(page, titleId, pageName.length, thirdBodyId, test.info());

        const sentinel = `no-op-copy-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sentinel);
        await expect(expectActualClipboard(page, test.info(), "rejected-no-op-clipboard")).rejects.toThrow();
    });
});
