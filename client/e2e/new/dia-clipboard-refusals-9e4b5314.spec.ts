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
    cutSelection,
    lastClipboardResult,
    pageOutline,
    pasteAfterRow,
    pasteAtCaret,
    projectDiagrams,
    recordClipboardResults,
    rowByText,
    selectWholeRows,
} from "../utils/diagramClipboardHelpers";
import {
    insertDiagram,
    insertTransclusion,
    seedSource,
    setDemoResetting,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-9e4b5314: snapshot sharing and refusals", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "", "anchor"]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 15000 });
        await recordClipboardResults(page);
    });

    test("each Paste shares one fresh Diagram per original, from the copy-time snapshot", async ({ page }) => {
        const { diagramId: d, occurrenceId: first } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await seedSource(page, d, "copy time");
        const second = await insertTransclusion(page, page.locator(".outliner-item").nth(2));

        await selectWholeRows(page, first, second);
        await copySelection(page);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("copy time\ncopy time");
        await seedSource(page, d, "changed after copy");

        const anchor = await rowByText(page, "anchor");
        await pasteAfterRow(page, anchor);
        const e = (await lastClipboardResult(page, 1)).diagramIdMap[d] as string;
        await pasteAfterRow(page, anchor);
        const f = (await lastClipboardResult(page, 2)).diagramIdMap[d] as string;

        expect(new Set([d, e, f]).size).toBe(3);
        expect(await projectDiagrams(page)).toEqual({ [d]: "changed after copy", [e]: "copy time", [f]: "copy time" });
        // The later Paste lands right after the caret row, ahead of the earlier one.
        expect((await pageOutline(page)).map(n => n.diagramId ?? n.text)).toEqual([d, d, "anchor", f, f, e, e]);
    });

    test("a read-only surface permits Copy but refuses Cut staging and Paste before any write", async ({ page }) => {
        const { diagramId: d, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await seedSource(page, d, "ro");
        // The caret rests on a Text row; a read-only surface cannot move it.
        await (await rowByText(page, "anchor")).locator(".item-content").first().click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        const depth = await undoDepth(page);
        await setDemoResetting(page, true);

        await selectWholeRows(page, occurrenceId, occurrenceId);
        await cutSelection(page);
        expect(await lastClipboardResult(page, 1)).toMatchObject({
            ok: false,
            operation: "cut",
            reason: "capability-denied",
        });
        expect((await pageOutline(page)).map(n => n.id)).toContain(occurrenceId);

        await selectWholeRows(page, occurrenceId, occurrenceId);
        await copySelection(page);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("ro");

        const before = await pageOutline(page);
        await pasteAtCaret(page);
        expect(await lastClipboardResult(page, 2)).toMatchObject({ ok: false, reason: "capability-denied" });
        expect(await pageOutline(page)).toEqual(before);
        expect(Object.keys(await projectDiagrams(page))).toEqual([d]);
        expect(await undoDepth(page)).toBe(depth);

        // Authority restored: the same clipboard now pastes.
        await setDemoResetting(page, false);
        await pasteAtCaret(page);
        expect(await lastClipboardResult(page, 3)).toMatchObject({ ok: true, operation: "paste" });
        expect(Object.keys(await projectDiagrams(page))).toHaveLength(2);
    });
});
