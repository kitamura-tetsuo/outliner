import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    clickSourceAt,
    dragSource,
    insertDiagram,
    insertTransclusion,
    localCursors,
    readSource,
    seedSource,
    sourceView,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Real local cursors are created with the native Alt+click / Alt+drag cursor-add
// gesture; nothing seeds the cursor store directly.
async function setup(page: Page, source: string) {
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, diagramId, source);
    const d2 = await insertTransclusion(page, page.locator(".outliner-item").last());
    await page.locator(`[data-item-id="${d1}"] [data-testid="diagram-source"]`).waitFor();
    return { diagramId, d1, d2 };
}

test.describe("FTR-5311a0cd: genuine multi-cursors versus reflected cursors", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "tail", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("cursors at distinct offsets each insert once, as one undo step", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page, "ab");
        await clickSourceAt(page, d1, 0);
        await clickSourceAt(page, d1, 2, { alt: true });
        expect(await localCursors(page)).toHaveLength(2);
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("XabX");
        await expect(sourceView(page, d2)).toHaveText("XabX");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");
    });

    test("coincident cursors placed through two occurrences insert once", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page, "ab");
        await clickSourceAt(page, d1, 1);
        await clickSourceAt(page, d2, 1, { alt: true });
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 1 }, { itemId: d2, offset: 1 }]);
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("aXb");
    });

    test("overlapping ranges [1,4) and [3,5) are unioned for deletion and replacement", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page, "abcdef");
        const selectBoth = async () => {
            await dragSource(page, d1, 1, 4);
            await dragSource(page, d2, 3, 5, { alt: true });
            expect(await localCursors(page)).toHaveLength(2);
            const ranges = await page.evaluate(() =>
                Object.values((globalThis as any).editorOverlayStore.selections)
                    .filter((s: any) => s.cursorId)
                    .map((s: any) => [s.itemId ?? s.startItemId, s.startOffset, s.endOffset])
            );
            expect(ranges).toEqual([[d1, 1, 4], [d2, 3, 5]]);
        };
        await selectBoth();
        await page.keyboard.press("Backspace");
        await expect.poll(() => readSource(page, diagramId)).toBe("af");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("abcdef");

        await selectBoth();
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("aXf");
    });

    test("one command edits independent Text and Diagram cursors once each", async ({ page }) => {
        const { diagramId, d1 } = await setup(page, "ab");
        const tail = page.locator(".outliner-item", { hasText: "tail" });
        await tail.locator(".item-content").click({ force: true });
        await page.keyboard.press("End");
        await expect(page.getByTestId("diagram-source")).toHaveCount(0);
        await page.keyboard.down("Alt");
        await page.locator(`[data-item-id="${d1}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.up("Alt");
        expect(await localCursors(page)).toHaveLength(2);

        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
        await expect(tail.locator(".item-text")).toHaveText("tailX");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");
        await expect(tail.locator(".item-text")).toHaveText("tail");
    });

    test("an ordinary click on the other occurrence retargets instead of adding a cursor", async ({ page }) => {
        const { d1, d2 } = await setup(page, "ab");
        await clickSourceAt(page, d1, 1);
        await clickSourceAt(page, d2, 2);
        expect(await localCursors(page)).toEqual([{ itemId: d2, offset: 2 }]);
    });
});
