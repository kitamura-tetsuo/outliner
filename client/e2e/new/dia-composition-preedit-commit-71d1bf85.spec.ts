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
    compositionOutcome,
    imeSession,
    insertDiagram,
    insertTransclusion,
    readSource,
    seedSource,
    sourceView,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function setup(page: Page) {
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, diagramId, "abcdef");
    const d2 = await insertTransclusion(page, page.locator(".outliner-item").last());
    await page.waitForTimeout(700);
    // Select "bc" in D1 with the native keyboard.
    await clickSourceAt(page, d1, 1);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    return { diagramId, d1, d2 };
}

const preedit = (page: Page, occurrenceId: string) =>
    page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-preedit"]`);
const selectedText = (page: Page, occurrenceId: string) =>
    page.locator(`[data-item-id="${occurrenceId}"] .diagram-source-selected`).allTextContents()
        .then(parts => parts.join(""));

test.describe("FTR-5311a0cd: Diagram composition keeps preedit ephemeral and commits once", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "between", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("preedit is shown in both occurrences; completion replaces the range once, as one undo step", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page);
        const depth = await undoDepth(page);
        const ime = await imeSession(page);

        await ime.compose("日");
        await ime.compose("日本");
        await expect(preedit(page, d1)).toHaveText("日本");
        await expect(preedit(page, d2)).toHaveText("日本");
        expect(await readSource(page, diagramId)).toBe("abcdef");
        expect(await undoDepth(page)).toBe(depth);
        expect(await compositionOutcome(page)).toBe("composing");

        await ime.commit("日本");
        await expect.poll(() => readSource(page, diagramId)).toBe("a日本def");
        await expect(sourceView(page, d1)).toHaveText("a日本def");
        await expect(sourceView(page, d2)).toHaveText("a日本def");
        await expect(preedit(page, d1)).toHaveCount(0);
        expect(await compositionOutcome(page)).toBe("committed");
        expect(await undoDepth(page)).toBe(depth + 1);

        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("abcdef");
        await page.keyboard.press("Control+y");
        await expect.poll(() => readSource(page, diagramId)).toBe("a日本def");
    });

    test("cancelling a composition keeps the original selection and adds no history", async ({ page }) => {
        const { diagramId, d1 } = await setup(page);
        const depth = await undoDepth(page);
        const ime = await imeSession(page);
        await ime.compose("日");
        await expect(preedit(page, d1)).toHaveText("日");
        // An empty composition update is the native cancellation: it ends the composition.
        await ime.compose("");
        await expect(preedit(page, d1)).toHaveCount(0);
        expect(await compositionOutcome(page)).toBe("cancelled");
        expect(await readSource(page, diagramId)).toBe("abcdef");
        await expect.poll(() => selectedText(page, d1)).toBe("bc");
        expect(await undoDepth(page)).toBe(depth);
    });
});
