import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { insertDiagram, readSource, seedSource } from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

const rowText = (page: Page, text: string) => page.locator(".outliner-item", { hasText: text }).locator(".item-text");

async function typeAtEnd(page: Page, rowLabel: string, text: string) {
    await page.locator(".outliner-item", { hasText: rowLabel }).locator(".item-content").click({ force: true });
    await page.keyboard.press("End");
    await page.keyboard.type(text);
}

test.describe("FTR-5311a0cd: Diagram source edits join the chronological history", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["first", "", "last"]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("Text → Diagram → Text undo in reverse order and redo forward", async ({ page }) => {
        const { diagramId, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(2));
        await seedSource(page, diagramId, "ab");
        // Keep the structural insertion in its own history step.
        await page.waitForTimeout(700);
        const depth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

        await typeAtEnd(page, "first", "1");
        await expect(rowText(page, "first")).toHaveText("first1");
        // Opening the source (and closing it again below) adds no history step.
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
        await typeAtEnd(page, "last", "2");
        await expect(rowText(page, "last")).toHaveText("last2");
        expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(depth + 3);

        await page.keyboard.press("Control+z");
        await expect(rowText(page, "last")).toHaveText("last");
        expect(await readSource(page, diagramId)).toBe("Xab");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");
        await expect(rowText(page, "first")).toHaveText("first1");
        await page.keyboard.press("Control+z");
        await expect(rowText(page, "first")).toHaveText("first");

        await page.keyboard.press("Control+y");
        await expect(rowText(page, "first")).toHaveText("first1");
        expect(await readSource(page, diagramId)).toBe("ab");
        await page.keyboard.press("Control+y");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
        await expect(rowText(page, "last")).toHaveText("last");
        await page.keyboard.press("Control+y");
        await expect(rowText(page, "last")).toHaveText("last2");
    });
});
