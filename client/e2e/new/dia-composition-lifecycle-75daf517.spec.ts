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
    localCursors,
    readSource,
    seedSource,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

/** D1 and D2 of D ("abcdef"), with "bc" selected in D1 and a composition pending over it. */
async function pendingOverBc(page: Page) {
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, diagramId, "abcdef");
    const d2 = await insertTransclusion(page, page.locator(".outliner-item").last());
    await page.waitForTimeout(700);
    await clickSourceAt(page, d1, 1);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    const ime = await imeSession(page);
    await ime.compose("日");
    expect(await compositionOutcome(page)).toBe("composing");
    return { diagramId, d1, d2, ime, depth: await undoDepth(page) };
}

test.describe("FTR-5311a0cd: captured composition targets, rebasing and stale-event rejection", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "between", ""]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("clicking another occurrence cancels; the old completion writes neither target", async ({ page }) => {
        const { diagramId, d2, ime, depth } = await pendingOverBc(page);
        await clickSourceAt(page, d2, 4);
        expect(await compositionOutcome(page)).toBe("cancelled");
        expect(await localCursors(page)).toEqual([{ itemId: d2, offset: 4 }]);

        await ime.commit("日本");
        expect(await readSource(page, diagramId)).toBe("abcdef");
        expect(await undoDepth(page)).toBe(depth);

        // A fresh composition at the new target still works.
        await ime.compose("本");
        await ime.commit("本");
        await expect.poll(() => readSource(page, diagramId)).toBe("abcd本ef");
    });

    test("an independent insertion before the range rebases the captured anchors", async ({ page }) => {
        const { diagramId, ime } = await pendingOverBc(page);
        // Delivered through the Diagram domain write path, not by the local cursor.
        await seedSource(page, diagramId, "Xabcdef");
        expect(await compositionOutcome(page)).toBe("composing");
        await ime.compose("日本");
        await ime.commit("日本");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xa日本def");
    });

    test("unmounting the active occurrence invalidates the session; remounting does not revive it", async ({ page }) => {
        const { diagramId, d1, ime } = await pendingOverBc(page);
        await page.evaluate(id => {
            for (const item of (globalThis as any).generalStore.currentPage.items) if (item.id === id) item.delete();
        }, d1);
        await expect(page.locator(`[data-item-id="${d1}"]`)).toHaveCount(0);
        expect(await compositionOutcome(page)).toBe("unavailable");
        // Undo remounts the occurrence with the same logical ids.
        await page.getByRole("button", { name: "Undo" }).click();
        await expect(page.locator(`[data-item-id="${d1}"]`)).toHaveCount(1);
        await ime.commit("日本");
        expect(await readSource(page, diagramId)).toBe("abcdef");
    });

    test("Undo while a composition is pending cancels it first; cancellation is no history step", async ({ page }) => {
        const { diagramId, ime } = await pendingOverBc(page);
        const before = await undoDepth(page);
        await page.getByRole("button", { name: "Undo" }).click();
        expect(await compositionOutcome(page)).toBe("cancelled");
        // The Undo itself reverted the most recent step (the transclusion insertion).
        expect(await undoDepth(page)).toBe(before - 1);
        await ime.commit("日本");
        expect(await readSource(page, diagramId)).toBe("abcdef");
    });
});
