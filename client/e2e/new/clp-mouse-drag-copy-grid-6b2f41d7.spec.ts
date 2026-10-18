/** @feature CLP-4584c0de */
import { type Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("mouse drag clipboard with component blocks", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha item", "Block host", "Omega"]);
    });

    /** Resolve a seeded item's id from its text so every later step can address it by data-item-id. */
    async function itemIdByText(page: Page, text: string): Promise<string> {
        const item = page.locator(".outliner-item[data-item-id]").filter({ hasText: text }).first();
        await expect(item).toBeVisible();
        const id = await item.getAttribute("data-item-id");
        expect(id).toBeTruthy();
        return id!;
    }

    test("a mouse drag across a Grid host copies the block, not just its title", async ({ page }) => {
        const sourceId = await itemIdByText(page, "Alpha item");
        const seededHostId = await itemIdByText(page, "Block host");
        const endId = await itemIdByText(page, "Omega");
        const host = await createBlockFromItem(
            page,
            page.locator(`.outliner-item[data-item-id="${seededHostId}"]`),
            "Grid",
        );
        const hostId = await host.getAttribute("data-item-id");
        expect(hostId).toBeTruthy();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });
        // The view shell mounts before the async query result is available.
        // Wait for a rendered header so the outward clipboard flavor is the
        // Grid result rather than its temporary display-name fallback.
        await expect(page.getByTestId("yjs-table-grid").first().locator("thead th").first())
            .toBeVisible({ timeout: 30000 });

        const gridId = await host.getByTestId("yjs-table-view").getAttribute("data-grid-id");
        const before = await page.evaluate(({ hostId, sourceId, endId }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const items = (globalThis as any).generalStore.activeViewModel.getVisibleItems().map((entry: any) =>
                entry.model.original
            );
            const item = items.find((item: any) => item.id === hostId);
            const value = item.tree.getNodeValueFromKey(item.key);
            return {
                binding: {
                    componentType: value.get("componentType"),
                    gridId: value.get("yjsGridId"),
                    hasTable: value.has("yjsTableId"),
                },
                order: items.map((item: any) => item.id).filter((id: string) => [sourceId, hostId, endId].includes(id)),
                grids: project.ydoc.getMap("yjsGrids").toJSON(),
                tables: Array.from(project.ydoc.getMap("yjsTables"), ([id, entry]: any) => {
                    const doc = entry.get("doc");
                    return {
                        id,
                        guid: doc.guid,
                        schema: doc.getText("schema").toString(),
                        data: doc.getMap("data").toJSON(),
                    };
                }),
            };
        }, { hostId, sourceId, endId });
        expect(before.binding).toEqual({ componentType: "yjstable", gridId, hasTable: false });
        expect(before.order).toEqual([sourceId, hostId, endId]);

        const source = page.locator(`.outliner-item[data-item-id="${sourceId}"] .item-text`);
        // A Grid is an atomic visual node with no outline text (#5015). Drag
        // across the host to the following text row so the outline selection
        // unambiguously spans the atomic block instead of ending on a child
        // control that consumes pointer events.
        const target = page.locator(`.outliner-item[data-item-id="${endId}"] .item-text`);
        const sourceBox = await source.boundingBox();
        const targetBox = await target.boundingBox();
        expect(sourceBox).not.toBeNull();
        expect(targetBox).not.toBeNull();

        // Drag from inside Alpha's text into the visible body of the Grid. Both
        // coordinates are interior points, matching a real cross-node mouse
        // selection rather than relying on item boundaries.
        await page.mouse.move(sourceBox!.x + 25, sourceBox!.y + sourceBox!.height / 2);
        await page.mouse.down();
        await page.mouse.move(sourceBox!.x + 45, sourceBox!.y + sourceBox!.height / 2, { steps: 5 });
        await page.mouse.move(targetBox!.x + targetBox!.width / 3, targetBox!.y + targetBox!.height / 2, {
            steps: 10,
        });
        await page.mouse.up();

        const selected = await page.evaluate(() => {
            const selection = (Object.values((globalThis as any).editorOverlayStore.selections) as any[]).find(
                selection => !selection.isBoxSelection,
            );
            return selection && { start: selection.startItemId, end: selection.endItemId };
        });
        expect(selected).toEqual({ start: sourceId, end: endId });
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
            "title\tstatus\tpriority",
        );
        const payload = await page.evaluate(() => JSON.parse((globalThis as any).lastCopiedStructuredItems));
        expect(payload.items.filter((item: any) => item.componentType === "yjstable"))
            .toEqual([expect.objectContaining({ text: "", depth: 0, componentType: "yjstable", yjsGridId: gridId })]);

        // Paste into a fresh item so no existing text merges with the payload.
        await page.locator(`.outliner-item[data-item-id="${sourceId}"] .item-content`).click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        const items = page.locator(".outliner-item[data-item-id]");
        const itemCountBeforePaste = await items.count();
        await page.keyboard.press("Enter");
        await expect(items).toHaveCount(itemCountBeforePaste + 1);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        expect(
            await page.getByTestId("yjs-table-view").evaluateAll(nodes =>
                nodes.map(node => node.getAttribute("data-grid-id"))
            ),
        )
            .toEqual([gridId, gridId]);
        const after = await page.evaluate(() => {
            const doc = (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc;
            return {
                grids: doc.getMap("yjsGrids").toJSON(),
                tables: Array.from(doc.getMap("yjsTables"), ([id, entry]: any) => {
                    const table = entry.get("doc");
                    return {
                        id,
                        guid: table.guid,
                        schema: table.getText("schema").toString(),
                        data: table.getMap("data").toJSON(),
                    };
                }),
            };
        });
        expect(after).toEqual({ grids: before.grids, tables: before.tables });
    });
});
