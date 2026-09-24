import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9e4b5314
 *  Title   : Diagram clipboard duplicates on Copy and moves on Cut
 *  Source  : docs/client-features/dia-diagram-clipboard-duplicate-and-move-9e4b5314.yaml
 */
import { expect, test } from "@playwright/test";
import {
    copySelection,
    lastClipboardResult,
    pageOutline,
    pasteAfterRow,
    projectDiagrams,
    recordClipboardResults,
    rowByText,
    selectWholeRows,
} from "../utils/diagramClipboardHelpers";
import { insertDiagram, readSource, undoDepth } from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-9e4b5314: normal Copy/Paste duplicates a Diagram", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "anchor"]);
        await expect(page.locator(".outliner-item")).toHaveCount(3, { timeout: 15000 });
        await recordClipboardResults(page);
    });

    test("pastes an independent Diagram that survives reload and history", async ({ page }) => {
        const { diagramId: d, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        // Edit D through its native source editor.
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.type("graph TD");
        await expect.poll(() => readSource(page, d)).toBe("graph TD");

        await selectWholeRows(page, occurrenceId, occurrenceId);
        await copySelection(page);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("graph TD");
        const depthBefore = await undoDepth(page);

        await pasteAfterRow(page, await rowByText(page, "anchor"));
        const pasted = await lastClipboardResult(page, 1);
        expect(pasted).toMatchObject({ ok: true, operation: "paste" });
        const e = pasted.diagramIdMap[d] as string;
        expect(e).toBeTruthy();
        expect(e).not.toBe(d);
        expect(await projectDiagrams(page)).toEqual({ [d]: "graph TD", [e]: "graph TD" });
        const outline = await pageOutline(page);
        expect(outline.map(n => [n.kind, n.diagramId ?? n.text])).toEqual([
            ["diagram", d],
            ["text", "anchor"],
            ["diagram", e],
        ]);
        const pastedOccurrence = outline[2].id;
        expect(pastedOccurrence).not.toBe(occurrenceId);
        expect(await undoDepth(page)).toBe(depthBefore + 1);

        // Edit E through its own native source editor: D stays as it was.
        await page.locator(`[data-item-id="${pastedOccurrence}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.press("End");
        await page.keyboard.type(" E");
        await expect.poll(() => readSource(page, e)).toBe("graph TD E");
        expect(await readSource(page, d)).toBe("graph TD");

        // Independent ids and sources persist.
        await page.waitForTimeout(1500);
        await page.reload();
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(2, { timeout: 20000 });
        expect(await projectDiagrams(page)).toEqual({ [d]: "graph TD", [e]: "graph TD E" });
        const reloaded = await pageOutline(page);
        expect(reloaded.map(n => n.diagramId ?? n.text)).toEqual([d, "anchor", e]);
    });

    test("Undo removes the pasted placement but keeps its Diagram; Redo restores the same one", async ({ page }) => {
        const { diagramId: d, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await selectWholeRows(page, occurrenceId, occurrenceId);
        await copySelection(page);
        await page.waitForTimeout(300);
        await pasteAfterRow(page, await rowByText(page, "anchor"));
        const e = (await lastClipboardResult(page, 1)).diagramIdMap[d] as string;
        const pastedId = (await pageOutline(page))[2].id;

        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(async () => (await pageOutline(page)).length).toBe(2);
        // E and its source remain available (e.g. to the existing-Diagram chooser).
        expect(Object.keys(await projectDiagrams(page)).sort()).toEqual([d, e].sort());

        await page.getByRole("button", { name: "Redo" }).click();
        await expect.poll(async () => (await pageOutline(page)).length).toBe(3);
        const redone = (await pageOutline(page))[2];
        expect(redone.id).toBe(pastedId);
        expect(redone.diagramId).toBe(e);
        expect(Object.keys(await projectDiagrams(page))).toHaveLength(2);
    });
});
