/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    configureGrid,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { selectVisualNode } from "../utils/visualNodeSelectionHelpers";
registerCoverageHooks();

for (const timing of ["before chooser", "during chooser"] as const) {
    test(`Values only retains captured TSV when the Grid is deleted ${timing}`, async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Paste anchor", "Source tail"]);
        await createBlankGrid(page, "Captured", "captured");
        await configureGrid(
            page,
            0,
            "CREATE TABLE captured (id TEXT PRIMARY KEY, title TEXT)",
            "SELECT * FROM captured",
            "Captured title",
        );
        const source = await readGridProjectState(page);
        await selectVisualNode(page, source.placements[0].id);
        await page.evaluate(() => navigator.clipboard.writeText(""));
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Captured title");
        const text = await page.evaluate(() => navigator.clipboard.readText());
        expect(text).toContain("Captured title");
        if (timing === "during chooser") await openPasteSpecialAtAnchor(page);
        // Invoke the supported deletion boundary, not a fake availability verdict.
        await page.evaluate(async id => {
            const path = "/src/services/yjstable/gridDocs.ts";
            const { removeGridWithPlacements } = await import(/* @vite-ignore */ path);
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            if (!removeGridWithPlacements(project, id)) throw new Error("Grid deletion failed");
        }, source.grids[0].id);
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(0);
        if (timing === "before chooser") await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-values-only").click();
        await expect(page.getByTestId("grid-paste-status")).toContainText("Pasted values only");
        await expect.poll(() => page.locator(".outliner-item .item-text").allTextContents()).toEqual(
            expect.arrayContaining([expect.stringContaining(text)]),
        );
        await expect(page.locator(".outliner-item .item-text").filter({ hasText: "Captured title" })).not.toHaveCount(
            0,
        );
        const after = await readGridProjectState(page);
        expect(after.grids).toEqual([]);
        expect(after.tables).toEqual(source.tables);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    });
}

test("Another view rejects a query change made while the chooser is open", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Paste anchor", "Source tail"]);
    await createBlankGrid(page, "Captured", "captured");
    await configureGrid(
        page,
        0,
        "CREATE TABLE captured (id TEXT PRIMARY KEY, title TEXT)",
        "SELECT * FROM captured",
        "Captured title",
    );
    const source = await readGridProjectState(page);
    await selectVisualNode(page, source.placements[0].id);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("");
    await openPasteSpecialAtAnchor(page);
    await page.evaluate(id => {
        const globals = globalThis as any;
        globals.__stalePasteRefused = false;
        globalThis.addEventListener("clipboard-read-error", () => {
            globals.__stalePasteRefused = true;
        }, { once: true });
        globals.generalStore.project.ydoc.getMap("yjsGrids").get(id).set("query", "SELECT 7 AS changed");
    }, source.grids[0].id);
    const before = await readGridProjectState(page);
    await page.getByTestId("paste-special-another-view").click();
    await expect.poll(() => page.evaluate(() => (globalThis as any).__stalePasteRefused)).toBe(true);
    expect(await readGridProjectState(page)).toEqual(before);
    await expect(page.getByTestId("yjs-table-view")).toHaveCount(1);
    await expect(page.getByTestId("grid-paste-status")).toHaveCount(0);
});
