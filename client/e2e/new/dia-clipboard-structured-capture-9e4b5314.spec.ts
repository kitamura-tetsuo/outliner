import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9e4b5314
 *  Title   : Diagram clipboard duplicates on Copy and moves on Cut
 *  Source  : docs/client-features/dia-diagram-clipboard-duplicate-and-move-9e4b5314.yaml
 */
import { expect, test } from "@playwright/test";
import {
    clipboardResults,
    copySelection,
    projectDiagrams,
    recordClipboardResults,
    rowByText,
    selectWholeRows,
} from "../utils/diagramClipboardHelpers";
import { insertDiagram, seedSource } from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Regression coverage for the #5735 failure mechanism: the three Diagram
// clipboard specs failed their first attempts with zero diagram-clipboard
// results because a Copy that degrades to plain text (wrong keyboard target
// or a selection the store has not reached yet) is invisible to the
// paste-time result wait — a structural Copy reports no result event on
// success. These oracles therefore never read diagram-clipboard-result: they
// assert the structured capture itself through independent observable state
// (the E2E clipboard bridge, the real system clipboard, project objects), so
// a fabricated success event or a helper that merely returned success cannot
// satisfy them.
test.describe("FTR-9e4b5314: structural Copy captures the Diagram payload", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "anchor"]);
        await expect(page.locator(".outliner-item")).toHaveCount(3, { timeout: 15000 });
        await recordClipboardResults(page);
    });

    test("real keyboard Copy exposes this Diagram's identity and snapshot source", async ({ page }) => {
        // Guard against a late dependency optimization restarting mounted pages
        // during the first Diagram operation. Keep this oracle independent of the
        // application's clipboard result/capture bridges.
        const navigations: string[] = [];
        page.on("framenavigated", frame => {
            if (frame === page.mainFrame()) navigations.push(frame.url());
        });
        const documentSession = await page.evaluate(() => performance.timeOrigin);
        const { diagramId: d, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await seedSource(page, d, "graph TD");

        await selectWholeRows(page, occurrenceId, occurrenceId);
        await copySelection(page);

        // The real system clipboard carries the source for external destinations.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("graph TD");
        const clipboardPayload = await page.evaluate(async () => {
            const items = await navigator.clipboard.read();
            const item = items.find(entry => entry.types.includes("text/html"));
            if (!item) throw new Error("Diagram Copy did not write the system clipboard HTML flavor");
            const html = await (await item.getType("text/html")).text();
            const document = new DOMParser().parseFromString(html, "text/html");
            const encoded = document.querySelector("[data-outliner-items]")?.getAttribute("data-outliner-items");
            if (!encoded) throw new Error("Diagram Copy did not write the structured clipboard payload");
            const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        });
        expect(clipboardPayload).toMatchObject({ diagrams: { [d]: { source: "graph TD" } } });
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentSession);
        expect(navigations).toEqual([]);
        // The structured payload carries this Diagram's identity and snapshot,
        // independent of any result event (a Copy reports none on success, and
        // none is read here).
        const captured = await page.evaluate(() => (globalThis as any).lastCopiedStructuredItems as unknown);
        expect(typeof captured).toBe("string");
        expect(captured as string).toContain(d);
        expect(captured as string).toContain("graph TD");
        // Copying allocates and writes nothing.
        expect(await projectDiagrams(page)).toEqual({ [d]: "graph TD" });
        expect(await clipboardResults(page)).toHaveLength(0);
    });

    test("caret-only Copy plants no structured payload", async ({ page }) => {
        // Narrowly controlled equivalent of the degraded pre-fix Copy: the
        // keypress reaches the editor, but there is no structural selection
        // for it to capture. The oracle above must stay able to tell the two
        // states apart, or it could not have caught the degradation.
        await (await rowByText(page, "anchor")).locator(".item-content").first().click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.evaluate(() => (globalThis as any).editorOverlayStore.clearSelections());
        await page.locator("textarea.global-textarea").focus();
        await page.keyboard.press("Control+c");
        // Negative control: absence needs a bounded settle window (the
        // production fallback path runs on a zero-delay timer), not a
        // snapshot. Nothing observable is planted here by design.
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => (globalThis as any).lastCopiedStructuredItems ?? null)).toBeNull();
        expect(await clipboardResults(page)).toHaveLength(0);
    });
});
