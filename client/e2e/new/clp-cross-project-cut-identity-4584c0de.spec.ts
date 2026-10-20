/** @feature FTR-4584c0de */
import { expect, type Page, test } from "@playwright/test";
import {
    addSourceRecord,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { chooseInsertTarget } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { selectVisualNode } from "../utils/visualNodeSelectionHelpers";
registerCoverageHooks();

async function readPayload(page: Page) {
    return page.evaluate(async () => {
        const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"));
        if (!item) return undefined;
        const html = await (await item.getType("text/html")).text();
        const encoded = new DOMParser().parseFromString(html, "text/html").querySelector("[data-outliner-items]")
            ?.getAttribute("data-outliner-items");
        if (!encoded) return undefined;
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0))));
    }).catch(error => {
        // A completed Cut may replace the clipboard between read and getType.
        if (String(error).includes("Clipboard data has changed")) return undefined;
        throw error;
    });
}

test(
    "cross-Project Cut preserves IDs, retains the last source Grid and supports guarded history",
    async ({ page }, info) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedCrossProjectFixture(page, info);
        await createBlankGrid(page, "Cut Grid", "cut_records");
        await addSourceRecord(page);
        const initial = await readGridProjectState(page);
        const gridId = initial.grids[0].id;
        const placementId = initial.placements[0].id;
        const sourceTableId = initial.tables[0].id;
        const sourceView = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await chooseInsertTarget(sourceView, sourceTableId);
        const before = await readGridProjectState(page);
        await selectVisualNode(page, placementId);
        await page.keyboard.press("Control+x");
        expect(await readGridProjectState(page)).toEqual(before);
        let payload: any;
        await expect.poll(async () => {
            const next = await readPayload(page);
            if (next?.operation !== "cut" || next.items?.[0]?.yjsGridId !== gridId) return false;
            payload = next;
            return true;
        }, { timeout: 10000 }).toBe(true);
        expect(payload.operation).toBe("cut");
        expect(payload.items[0].yjsGridId).toBe(gridId);
        expect(payload.items[0]).not.toHaveProperty("yjsTableId");
        expect(payload.grids[gridId].insertTargetTableId).toBe(sourceTableId);

        await openProjectPage(page, fixture, "destination");
        await pasteAtAnchor(page, 1);
        const moved = await readGridProjectState(page);
        expect(moved.placements).toEqual([{ id: placementId, gridId, hasPrimaryMetadata: false }]);
        expect(moved.grids[0].id).toBe(gridId);
        expect(moved.grids[0].insertTargetTableId).toBe(moved.tables[0].id);
        expect(moved.tables[0].id).not.toBe(sourceTableId);
        expect(moved.tables[0].data).toEqual(before.tables[0].data);
        await openProjectPage(page, fixture, "source");
        const retained = await readGridProjectState(page);
        expect(retained.placements).toEqual([]);
        expect(retained.grids).toEqual(before.grids);
        // A controlled peer setting edit is independent of the moved placement.
        await page.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.transact(
                () => project.ydoc.getMap("yjsGrids").get(id).set("name", "Peer source name"),
                "peer",
            );
        }, gridId);
        await openProjectPage(page, fixture, "destination");
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(async () => (await readGridProjectState(page).catch(() => undefined))?.placements, {
            timeout: 20000,
        }).toEqual([]);
        expect((await readGridProjectState(page)).tables).toEqual([]);
        await openProjectPage(page, fixture, "source");
        const undone = await readGridProjectState(page);
        expect(undone.placements).toEqual(before.placements);
        expect(undone.grids[0].name).toBe("Peer source name");
        await expect(page.getByTestId("yjs-table-view").getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(
            1,
        );
        expect((await readGridProjectState(page)).tables).toEqual(before.tables);
        await openProjectPage(page, fixture, "destination");
        await page.getByTestId("toolbar-redo").click();
        await expect.poll(async () => (await readGridProjectState(page).catch(() => undefined))?.placements, {
            timeout: 20000,
        }).toEqual(moved.placements);
        await expect(page.getByTestId("yjs-table-view").getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(
            1,
        );
        expect((await readGridProjectState(page)).tables).toEqual(moved.tables);

        // A fresh Cut back is not Undo: the retained original Grid is a collision.
        await selectVisualNode(page, placementId);
        await page.keyboard.press("Control+x");
        await expect.poll(async () => {
            const next = await readPayload(page);
            return typeof next?.transferId === "string" && next.transferId !== payload.transferId;
        }, { timeout: 10000 }).toBe(true);
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        await openProjectPage(page, fixture, "source");
        const beforeRefusal = await readGridProjectState(page);
        await page.evaluate(() => {
            (globalThis as any).__cutPasteResult = undefined;
            window.addEventListener(
                "diagram-clipboard-result",
                event => (globalThis as any).__cutPasteResult = (event as CustomEvent).detail,
                { once: true },
            );
        });
        await page.locator(".outliner-item[data-node-kind='text']").last().click();
        await page.locator("textarea.global-textarea").focus();
        await page.keyboard.press("Control+v");
        await expect.poll(() => page.evaluate(() => (globalThis as any).__cutPasteResult), { timeout: 10000 })
            .toMatchObject({
                ok: false,
                reason: "identity-collision",
            });
        expect(await readGridProjectState(page)).toEqual(beforeRefusal);
        expect(
            await page.evaluate(() => navigator.clipboard.readText()),
        ).toBe(clipboard);
    },
);
