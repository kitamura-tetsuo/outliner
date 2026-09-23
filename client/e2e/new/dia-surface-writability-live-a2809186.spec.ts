import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { insertDiagram, localCursors, readSource, seedSource, sourceView } from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Put the page into (or out of) the demo-reset state exactly as the server's
 * demo reset does: through the project document's `metadata` flags, which
 * OutlinerBase observes and turns into a read-only presentation of the mounted
 * outline. Nothing is remounted.
 */
async function setResetting(page: Page, resetting: boolean) {
    await page.evaluate(on => {
        const meta = (globalThis as any).generalStore.project.ydoc.getMap("metadata");
        meta.set("resetStartedAt", Date.now());
        meta.set("isResetting", on);
    }, resetting);
    const banner = page.getByText("Demo content is being reset");
    if (resetting) await expect(banner).toBeVisible();
    else await expect(banner).toHaveCount(0);
}

const undoDepth = (page: Page) => page.evaluate(() => (globalThis as any).globalUndoRouter?.undoDepth ?? -1);

test.describe("FTR-5311a0cd: surface writability is checked at the Diagram mutation boundary", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "tail"]);
        await expect(page.locator(".outliner-item")).toHaveCount(3, { timeout: 10000 });
        await page.evaluate(() => {
            (globalThis as any).__diagramRefusals = [];
            globalThis.addEventListener("diagram-edit-refused", event => {
                (globalThis as any).__diagramRefusals.push((event as CustomEvent).detail);
            });
        });
    });

    test("a source session refuses writes once its surface turns read-only, and accepts them again after", async ({ page }) => {
        const { diagramId, occurrenceId } = await insertDiagram(page, page.locator(".outliner-item").nth(1));
        await seedSource(page, diagramId, "ab");
        await expect(sourceView(page, occurrenceId)).toHaveText("ab");

        // 1. Writable surface: a native keystroke edits the source.
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
        const depthBefore = await undoDepth(page);

        // 2-3. Same mounted occurrence and cursor; the invoking surface turns read-only.
        await setResetting(page, true);
        await expect(sourceView(page, occurrenceId)).toHaveText("Xab");
        expect(await localCursors(page)).toEqual([{ itemId: occurrenceId, offset: 1 }]);
        // Changing presentation writability writes no source and creates no undo step.
        expect(await readSource(page, diagramId)).toBe("Xab");
        expect(await undoDepth(page)).toBe(depthBefore);

        // 4-5. Native input is refused explicitly, with the canonical source byte-identical.
        await page.keyboard.type("Y");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Enter");
        await expect.poll(() => page.evaluate(() => (globalThis as any).__diagramRefusals.length))
            .toBeGreaterThanOrEqual(3);
        const refusals = await page.evaluate(() => (globalThis as any).__diagramRefusals);
        expect(refusals.every((r: { reason: string; }) => r.reason === "unauthorized")).toBe(true);
        expect(await readSource(page, diagramId)).toBe("Xab");
        expect(await undoDepth(page)).toBe(depthBefore);

        // 6-7. The surface becomes writable again: a fresh mutation succeeds.
        await setResetting(page, false);
        expect(await undoDepth(page)).toBe(depthBefore);
        await page.keyboard.type("Z");
        await expect.poll(() => readSource(page, diagramId)).toBe("XZab");
        await expect(sourceView(page, occurrenceId)).toHaveText("XZab");
    });
});
