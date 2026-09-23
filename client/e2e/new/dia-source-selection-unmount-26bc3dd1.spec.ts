import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    insertDiagram,
    insertTransclusion,
    localCursors,
    readSource,
    seedSource,
    sourceView,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function setup(page: Page) {
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, diagramId, "abcdef");
    const d2 = await insertTransclusion(page, page.locator(".outliner-item").last());
    await page.locator(".outliner-item", { hasText: "between" }).locator(".item-content").click({ force: true });
    await expect(page.getByTestId("diagram-source")).toHaveCount(0);
    return { diagramId, d1, d2 };
}

/** Delete one occurrence row through the outline item API. */
async function removeOccurrence(page: Page, occurrenceId: string) {
    await page.evaluate(id => {
        for (const item of (globalThis as any).generalStore.currentPage.items) {
            if (item.id === id) return item.delete();
        }
        throw new Error("occurrence not found");
    }, occurrenceId);
    await expect(page.locator(`[data-item-id="${occurrenceId}"]`)).toHaveCount(0);
}

const selectedText = (page: Page, occurrenceId: string) =>
    page.locator(`[data-item-id="${occurrenceId}"] .diagram-source-selected`).allTextContents()
        .then(parts => parts.join(""));

test.describe("FTR-5311a0cd: one logical cursor, painted in every occurrence", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "between", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("a source-internal selection is painted in both occurrences", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page);
        await page.locator(`[data-item-id="${d2}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        expect(await localCursors(page)).toEqual([{ itemId: d2, offset: 3 }]);
        await expect.poll(() => selectedText(page, d2)).toBe("bc");
        await expect.poll(() => selectedText(page, d1)).toBe("bc");
        // A selection is presentation, not content.
        expect(await readSource(page, diagramId)).toBe("abcdef");

        // Moving the cursor out of the source (up, to "between") hides it everywhere.
        await page.keyboard.press("ArrowUp");
        await expect(page.getByTestId("diagram-source")).toHaveCount(0);
    });

    test("unmounting the active occurrence clears its editing target without writing source", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page);
        await page.locator(`[data-item-id="${d2}"] [data-testid="diagram-block"]`).click();
        expect(await localCursors(page)).toEqual([{ itemId: d2, offset: 0 }]);
        await removeOccurrence(page, d2);
        expect(await localCursors(page)).toEqual([]);
        await expect(sourceView(page, d1)).toHaveCount(0);
        expect(await readSource(page, diagramId)).toBe("abcdef");
    });

    test("removing a non-active reflection keeps the cursor and the source history", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page);
        await page.locator(`[data-item-id="${d1}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xabcdef");
        await removeOccurrence(page, d2);
        expect(await localCursors(page)).toEqual([{ itemId: d1, offset: 1 }]);
        await expect(sourceView(page, d1)).toHaveText("Xabcdef");

        // History: the row removal, then the Diagram edit.
        await page.keyboard.press("Control+z");
        await expect(page.locator(`[data-item-id="${d2}"]`)).toHaveCount(1);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("abcdef");
    });
});
