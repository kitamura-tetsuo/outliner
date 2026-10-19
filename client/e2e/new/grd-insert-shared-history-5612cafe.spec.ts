/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import { chooseInsertTarget, prepareInsertPreference, readInsertState } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "exact Grid preference shares placements and peers; local Undo preserves a peer label",
    async ({ page, browser }, info) => {
        test.setTimeout(240000);
        const { gridId, ids, state } = await prepareInsertPreference(page, info);
        const view = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`).first();
        const otherDefinitions = await page.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            return [...project.ydoc.getMap("yjsGrids")].filter(([key]: [string]) => key !== id).map((
                [key, entry]: [string, any],
            ) => [key, entry.toJSON()]);
        }, gridId);
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").last();
        await panel.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(gridId);
        await panel.getByTestId("yjs-grid-select-existing").click();
        const placements = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await expect(placements).toHaveCount(2);
        const context = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as never });
        try {
            const peer = await context.newPage();
            await peer.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                (globalThis as any).__E2E__ = true;
            });
            await peer.goto(page.url(), { waitUntil: "domcontentloaded" });
            await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
            await peer.evaluate(async () =>
                await (globalThis as any).__USER_MANAGER__.loginWithEmailPassword("test@example.com", "password")
            );
            const peerView = peer.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`).first();
            await expect(peerView.getByTestId("grid-insert-resolution")).toContainText("Choose", { timeout: 60000 });
            await chooseInsertTarget(view, ids.insert_b);
            await expect(placements.getByTestId("grid-insert-resolution")).toHaveText([
                "configured: insert_b",
                "configured: insert_b",
            ]);
            await expect.poll(async () => (await readInsertState(peer, gridId)).definition.insertTargetTableId).toBe(
                ids.insert_b,
            );
            await peerView.getByTestId("yjs-table-toggle-ui").click();
            await peerView.getByTestId("yjs-table-label-title").fill("Peer label");
            await peerView.getByTestId("yjs-table-label-title").press("Tab");
            await expect.poll(async () => (await state()).definition.components.title.label).toBe("Peer label");
            await page.getByTestId("toolbar-undo").click();
            await expect.poll(async () => (await state()).definition.insertTargetTableId).toBeUndefined();
            expect((await state()).definition.components.title.label).toBe("Peer label");
            await page.getByTestId("toolbar-redo").click();
            await expect.poll(async () => (await state()).definition.insertTargetTableId).toBe(ids.insert_b);
            expect((await state()).definition.components.title.label).toBe("Peer label");
            for (const [id, definition] of otherDefinitions) {
                expect((await readInsertState(page, id)).definition).toEqual(definition);
            }
            await page.reload();
            await expect(placements.getByTestId("grid-insert-resolution")).toHaveText([
                "configured: insert_b",
                "configured: insert_b",
            ]);
            expect((await state()).definition.components.title.label).toBe("Peer label");
            expect(Object.values((await state()).tables).every(rows => Object.keys(rows).length === 0)).toBe(true);
        } finally {
            await context.close();
        }
    },
);
