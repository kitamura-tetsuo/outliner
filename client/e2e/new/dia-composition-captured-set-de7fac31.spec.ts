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
    dragSource,
    imeSession,
    insertDiagram,
    insertTransclusion,
    readSource,
    seedSource,
    setDemoResetting,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function setup(page: Page, source: string) {
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, diagramId, source);
    const d2 = await insertTransclusion(page, page.locator(".outliner-item").last());
    await page.waitForTimeout(700);
    return { diagramId, d1, d2 };
}

test.describe("FTR-5311a0cd: a composition commits to its whole captured set once", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "tail", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("overlapping multi-cursor ranges are normalized: one replacement, one undo step", async ({ page }) => {
        const { diagramId, d1, d2 } = await setup(page, "abcdef");
        await dragSource(page, d1, 1, 4);
        await dragSource(page, d2, 3, 5, { alt: true });
        const depth = await undoDepth(page);
        const ime = await imeSession(page);
        await ime.compose("日");
        await ime.compose("日本");
        expect(await readSource(page, diagramId)).toBe("abcdef");
        await ime.commit("日本");
        await expect.poll(() => readSource(page, diagramId)).toBe("a日本f");
        expect(await undoDepth(page)).toBe(depth + 1);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("abcdef");
    });

    test("a mixed Text/Diagram cursor set receives the candidate once per target, as one undo step", async ({ page }) => {
        const { diagramId, d1 } = await setup(page, "ab");
        const tail = page.locator(".outliner-item", { hasText: "tail" });
        await tail.locator(".item-content").click({ force: true });
        await page.keyboard.press("End");
        await page.keyboard.down("Alt");
        await page.locator(`[data-item-id="${d1}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.up("Alt");

        const ime = await imeSession(page);
        await ime.compose("日本");
        // Preedit writes nothing canonical, to Text or to the Diagram.
        await expect(tail.locator(".item-text")).toHaveText("tail");
        expect(await readSource(page, diagramId)).toBe("ab");
        await ime.commit("日本");
        await expect.poll(() => readSource(page, diagramId)).toBe("日本ab");
        await expect(tail.locator(".item-text")).toHaveText("tail日本");

        await page.keyboard.press("Control+z");
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");
        await expect(tail.locator(".item-text")).toHaveText("tail");
    });

    test("losing write access cancels the composition; restoring access does not revive it", async ({ page }) => {
        const { diagramId, d1 } = await setup(page, "ab");
        await clickSourceAt(page, d1, 1);
        const depth = await undoDepth(page);
        const ime = await imeSession(page);
        await ime.compose("日");
        await setDemoResetting(page, true);
        expect(await compositionOutcome(page)).toBe("unavailable");
        await setDemoResetting(page, false);

        await ime.commit("日本");
        expect(await readSource(page, diagramId)).toBe("ab");
        expect(await undoDepth(page)).toBe(depth);

        // A fresh composition succeeds once every condition holds again.
        await ime.compose("本");
        await ime.commit("本");
        await expect.poll(() => readSource(page, diagramId)).toBe("a本b");
    });
});
