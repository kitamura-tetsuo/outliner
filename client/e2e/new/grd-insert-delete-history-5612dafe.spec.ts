/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import { chooseInsertTarget, prepareInsertPreference } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const configured of [true, false]) {
    test(`Object Manager history restores Grid preference configured=${configured}`, async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, gridId, ids } = await prepareInsertPreference(page, info);
        // Fixture presentation metadata only; the preference and all history actions use controls.
        const placementKey = await page.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const entry = project.ydoc.getMap("yjsGrids").get(id);
            entry.set("name", "Restored destination");
            entry.set("columnOrder", ["title", "id"]);
            const title = new (entry.get("components").constructor)();
            title.set("type", "text");
            title.set("label", "Saved title");
            title.set("widthPx", 220);
            entry.get("components").set("title", title);
            function find(item: any): string | undefined {
                if (item.tree.getNodeValueFromKey(item.key)?.get("yjsGridId") === id) return item.key;
                for (const child of item.items) {
                    const key = find(child);
                    if (key) return key;
                }
            }
            for (const page of project.items) {
                const key = find(page);
                if (key) return key;
            }
            throw new Error("Expected an actual Grid placement");
        }, gridId);
        if (configured) await chooseInsertTarget(grid, ids.insert_b);
        const read = () =>
            page.evaluate(({ gridId, placementKey }) => {
                const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
                const entry = project.ydoc.getMap("yjsGrids").get(gridId);
                const placement = project.tree.getNodeValueFromKey(placementKey);
                const tables: Record<string, unknown> = {};
                project.ydoc.getMap("yjsTables").forEach((entry: any, id: string) =>
                    tables[id] = entry.get("doc").getMap("data").toJSON()
                );
                return {
                    definition: entry?.toJSON(),
                    preferencePresent: entry?.has("insertTargetTableId") ?? false,
                    placement: { componentType: placement.get("componentType"), gridId: placement.get("yjsGridId") },
                    tables,
                };
            }, { gridId, placementKey });
        const before = await read();
        expect(before.definition).not.toHaveProperty("sourceTableId");
        expect(before.preferencePresent).toBe(configured);
        if (configured) expect(before.definition.insertTargetTableId).toBe(ids.insert_b);
        await page.evaluate(() => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            (globalThis as any).__historyRecordMutations = 0;
            project.ydoc.getMap("yjsTables").forEach((entry: any) =>
                entry.get("doc").getMap("data").observeDeep(() => (globalThis as any).__historyRecordMutations++)
            );
        });
        const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
        if (await showSidebar.isVisible()) await showSidebar.click();
        await page.locator('aside.sidebar[aria-label="Main Sidebar"]').getByRole("link", {
            name: "Object Manager",
            exact: true,
        }).click();
        await expect(page).toHaveURL(/\/objects$/);
        const row = page.getByTestId(`object-row-${gridId}`);
        await row.getByTestId(`object-delete-${gridId}`).click();
        const dialog = page.getByRole("alertdialog", { name: 'Delete Grid "Restored destination"?' });
        await dialog.getByRole("button", { name: "Delete", exact: true }).click();
        await expect(row).toHaveCount(0);
        const assertDeleted = async () => {
            const current = await read();
            expect(current.definition).toBeUndefined();
            expect(current.placement.componentType).toBeUndefined();
            expect(current.placement.gridId).toBeUndefined();
            expect(current.tables).toEqual(before.tables);
        };
        await assertDeleted();
        await page.goBack();
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(read).toEqual(before);
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText(
            configured ? "configured: insert_b" : "Choose an INSERT destination",
        );
        await page.getByTestId("toolbar-redo").click();
        await expect(grid).toHaveCount(0);
        await assertDeleted();
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(read).toEqual(before);
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText(
            configured ? "configured: insert_b" : "Choose an INSERT destination",
        );
        expect(await page.evaluate(() => (globalThis as any).__historyRecordMutations)).toBe(0);
    });
}
