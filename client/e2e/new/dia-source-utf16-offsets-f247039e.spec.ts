import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    caretX,
    insertDiagram,
    insertTransclusion,
    localCursors,
    offsetPoint,
    paintedCarets,
    readSource,
    seedSource,
    sourceView,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

// "😀" is one supplementary-plane character but two UTF-16 code units, so the
// canonical Y.Text offsets of "😀a" are 0 (before 😀), 2 (after 😀) and 3 (end).

async function setup(page: Page) {
    const first = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, first.diagramId, "😀a");
    const second = await insertTransclusion(page, page.locator(".outliner-item").last());
    // Leave the Diagram, then enter it through the first occurrence's preview.
    await page.locator(".outliner-item", { hasText: "between" }).locator(".item-content").click({ force: true });
    await expect(page.getByTestId("diagram-source")).toHaveCount(0);
    await page.locator(`[data-item-id="${first.occurrenceId}"] [data-testid="diagram-block"]`).click();
    return { diagramId: first.diagramId, d1: first.occurrenceId, d2: second };
}

/** Both occurrences paint exactly one caret, at `offset`, drawn at that canonical boundary. */
async function expectCaretAt(page: Page, occurrences: string[], offset: number) {
    for (const occurrence of occurrences) {
        await expect.poll(() => paintedCarets(page, occurrence)).toEqual([offset]);
        const boundary = await offsetPoint(page, occurrence, offset);
        expect(Math.abs((await caretX(page, occurrence)) - boundary.x)).toBeLessThanOrEqual(2);
    }
}

test.describe("FTR-5311a0cd: Diagram source uses canonical UTF-16 offsets", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "between", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("carets before, after and at the end of a supplementary character in every occurrence", async ({ page }) => {
        const { d1, d2 } = await setup(page);
        await expect(sourceView(page, d1)).toHaveText("😀a");
        await expect(sourceView(page, d2)).toHaveText("😀a");
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 0 }]);
        await expectCaretAt(page, [d1, d2], 0);

        // Hit-testing the reflected occurrence between 😀 and "a" resolves canonical
        // offset 2 and retargets the one logical cursor; both occurrences paint it there.
        const afterEmoji = await offsetPoint(page, d2, 2);
        await page.mouse.click(afterEmoji.x + 2, afterEmoji.y);
        expect(await localCursors(page)).toEqual([{ itemId: d2, offset: 2 }]);
        await expectCaretAt(page, [d1, d2], 2);

        // The canonical end offset is 3, and its caret stays visible there.
        const end = await offsetPoint(page, d1, 3);
        await page.mouse.click(end.x + 20, end.y);
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 3 }]);
        await expectCaretAt(page, [d1, d2], 3);

        // Keyboard steps move over the whole character: 0 → 2 → 3.
        const start = await offsetPoint(page, d1, 0);
        await page.mouse.click(start.x + 1, start.y);
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 0 }]);
        await page.keyboard.press("ArrowRight");
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 2 }]);
        await expectCaretAt(page, [d1, d2], 2);
        await page.keyboard.press("ArrowRight");
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 3 }]);
        await expectCaretAt(page, [d1, d2], 3);
    });

    test("insertion and deletion around a supplementary character edit its canonical position once", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page);
        await page.keyboard.press("ArrowRight");
        await page.keyboard.type("Z");
        await expect.poll(() => readSource(page, diagramId)).toBe("😀Za");
        await expect(sourceView(page, d1)).toHaveText("😀Za");
        await expect(sourceView(page, d2)).toHaveText("😀Za");
        await expectCaretAt(page, [d1, d2], 3);

        // Backspace right after the character removes both of its code units.
        await page.keyboard.press("ArrowLeft");
        await expectCaretAt(page, [d1, d2], 2);
        await page.keyboard.press("Backspace");
        await expect.poll(() => readSource(page, diagramId)).toBe("Za");
        await expectCaretAt(page, [d1, d2], 0);

        // Typing a supplementary character inserts it once; Delete removes it whole.
        await page.keyboard.type("😀");
        await expect.poll(() => readSource(page, diagramId)).toBe("😀Za");
        await expectCaretAt(page, [d1, d2], 2);
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Delete");
        await expect.poll(() => readSource(page, diagramId)).toBe("Za");
        await expect(sourceView(page, d2)).toHaveText("Za");
    });
});
