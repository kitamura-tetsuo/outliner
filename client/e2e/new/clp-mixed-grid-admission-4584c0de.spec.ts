/** @feature FTR-4584c0de */
import { expect, test } from "@playwright/test";
import { addSourceRecord, createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import {
    copySelection,
    lastClipboardResult,
    pasteAfterRow,
    projectDiagrams,
    recordClipboardResults,
    selectWholeRows,
} from "../utils/diagramClipboardHelpers";
import { insertDiagram } from "../utils/diagramTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test("mixed Diagram/Grid Copy preserves live bindings and refuses a deleted Grid", async ({ page }, info) => {
    test.setTimeout(120000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await TestHelpers.seedProjectAndNavigate(page, info, ["Diagram here", "Anchor", "Neighbour"]);
    const diagram = await insertDiagram(
        page,
        page.locator(".outliner-item:not(.page-title)").filter({ hasText: "Diagram here" }).last(),
    );
    await createBlankGrid(page, "Live Grid", "tasks");
    await addSourceRecord(page);
    const initial = await readGridProjectState(page);
    const grid = initial.grids[0];
    const placement = initial.placements[0];
    await recordClipboardResults(page);
    await selectWholeRows(page, diagram.occurrenceId, placement.id);
    await copySelection(page);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.length).toBeGreaterThan(0);
    const beforeDiagrams = await projectDiagrams(page);
    await pasteAfterRow(page, page.locator(".outliner-item:not(.page-title)").filter({ hasText: "Anchor" }).last());
    expect(await lastClipboardResult(page, 1)).toMatchObject({ ok: true });
    const copied = await readGridProjectState(page);
    expect(copied.grids).toEqual(initial.grids);
    expect(copied.placements).toHaveLength(initial.placements.length + 1);
    expect(copied.placements.every(item => item.gridId === grid.id && !item.hasPrimaryMetadata)).toBe(true);
    expect(Object.keys(await projectDiagrams(page))).toHaveLength(Object.keys(beforeDiagrams).length + 1);
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible()) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await page.getByTestId(`object-delete-${grid.id}`).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(async () => (await readGridProjectState(page)).grids.length).toBe(0);
    await page.locator("aside [data-page-id]").first().click();
    const baseline = await readGridProjectState(page);
    const diagrams = await projectDiagrams(page);
    await expect(page.locator(".outliner-item").filter({ hasText: "Anchor" }).last()).toBeVisible();
    const readOutline = () =>
        page.evaluate(() => (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON());
    const outline = await readOutline();
    const history = await page.evaluate(() => {
        const router = (globalThis as any).globalUndoRouter;
        return [router.undoDepth, router.redoDepth];
    });
    await pasteAfterRow(page, page.locator(".outliner-item:not(.page-title)").filter({ hasText: "Anchor" }).last());
    expect(await lastClipboardResult(page, 2)).toMatchObject({ ok: false, reason: "stale-transfer" });
    expect(await readGridProjectState(page)).toEqual(baseline);
    expect(await projectDiagrams(page)).toEqual(diagrams);
    expect(await readOutline()).toEqual(outline);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(clipboard);
    expect(
        await page.evaluate(() => {
            const router = (globalThis as any).globalUndoRouter;
            return [router.undoDepth, router.redoDepth];
        }),
    ).toEqual(history);
});
