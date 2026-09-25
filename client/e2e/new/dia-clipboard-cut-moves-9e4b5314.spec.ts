import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9e4b5314
 *  Title   : Diagram clipboard duplicates on Copy and moves on Cut
 *  Source  : docs/client-features/dia-diagram-clipboard-duplicate-and-move-9e4b5314.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    cutSelection,
    lastClipboardResult,
    pageOutline,
    pasteAfterRow,
    projectDiagrams,
    recordClipboardResults,
    rowByText,
    selectWholeRows,
} from "../utils/diagramClipboardHelpers";
import { insertDiagram, readSource, seedSource, undoDepth } from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

/** Title of the page the node `itemId` currently sits on, read from the tree. */
function pageOf(page: Page, itemId: string): Promise<string | undefined> {
    return page.evaluate(id => {
        const tree = (globalThis as any).generalStore.project.tree;
        let key: string | undefined = id;
        while (key) {
            const parent = tree.getNodeParentFromKey(key);
            if (parent === "root") return String(tree.getNodeValueFromKey(key).get("text") ?? "");
            key = parent;
        }
        return undefined;
    }, itemId);
}

test.describe("FTR-9e4b5314: Cut stages a move that Paste commits once", () => {
    let otherPage: string;
    let sourcePage: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        otherPage = `landing-page-${Date.now()}`;
        sourcePage = `cut-source-${Date.now()}`;
        const { SeedClient } = await import("../utils/seedClient.js");
        const projectName = `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        await new SeedClient(projectName, await TestHelpers.getTestAuthToken()).seed([
            { name: otherPage, lines: ["landing"] },
            { name: sourcePage, lines: ["", `go [${otherPage}]`] },
        ]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, {
            projectName,
            pageName: sourcePage,
            doNotSeed: true,
        });
        await expect(page.locator(".outliner-item")).toHaveCount(3, { timeout: 15000 });
        await recordClipboardResults(page);
    });

    test("keeps the occurrence in place until Paste on another page moves the live node", async ({ page }) => {
        const { diagramId: d, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await seedSource(page, d, "v1");
        const depth = await undoDepth(page);

        await selectWholeRows(page, occurrenceId, occurrenceId);
        await cutSelection(page);
        expect(await lastClipboardResult(page, 1)).toMatchObject({ ok: true, operation: "cut" });
        // Pending: still here, same identity, nothing changed, no history entry.
        expect(await pageOf(page, occurrenceId)).toBe(sourcePage);
        expect(await projectDiagrams(page)).toEqual({ [d]: "v1" });
        expect(await undoDepth(page)).toBe(depth);

        // A structural paste into Diagram source is refused and consumes nothing.
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.press("Control+v");
        expect(await lastClipboardResult(page, 2)).toMatchObject({ ok: false, reason: "source-editing-target" });
        expect(await readSource(page, d)).toBe("v1");

        // A content edit accepted while pending travels with the move.
        await seedSource(page, d, "v2 merged");

        // Navigate within the project, then Paste without another Cut.
        await page.locator("a.internal-link").first().click();
        await expect(page.locator(".outliner-item", { hasText: "landing" })).toBeVisible({ timeout: 15000 });
        await pasteAfterRow(page, await rowByText(page, "landing"));
        expect(await lastClipboardResult(page, 3)).toMatchObject({ ok: true, itemIds: [occurrenceId] });
        expect(await pageOf(page, occurrenceId)).toBe(otherPage);
        const outline = await pageOutline(page);
        expect(outline.map(n => [n.id, n.diagramId ?? n.text])).toEqual([
            [outline[0].id, "landing"],
            [occurrenceId, d],
        ]);
        expect(await projectDiagrams(page)).toEqual({ [d]: "v2 merged" });
        await expect(page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`)).toBeVisible();

        // The consumed payload moves nothing again.
        await pasteAfterRow(page, await rowByText(page, "landing"));
        expect(await lastClipboardResult(page, 4)).toMatchObject({ ok: false, reason: "already-consumed" });
        expect((await pageOutline(page)).length).toBe(2);

        // One command: Undo returns it to the source page, Redo moves it back.
        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(() => pageOf(page, occurrenceId)).toBe(sourcePage);
        await page.getByRole("button", { name: "Redo" }).click();
        await expect.poll(() => pageOf(page, occurrenceId)).toBe(otherPage);
        expect(await projectDiagrams(page)).toEqual({ [d]: "v2 merged" });

        // History never reactivates the consumed transfer.
        await pasteAfterRow(page, await rowByText(page, "landing"));
        expect(await lastClipboardResult(page, 5)).toMatchObject({ ok: false, reason: "already-consumed" });
    });
});
