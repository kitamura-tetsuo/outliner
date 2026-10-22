import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "../fixtures/grid-render-trace";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { readKanbanEntry } from "../utils/kanbanTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

const definitions = (state: Awaited<ReturnType<typeof readSlashState>>) => ({
    tables: state.tables,
    grids: state.grids,
    boards: state.boards,
});
const history = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const router = (globalThis as any).globalUndoRouter;
        return { undo: router.undoDepth as number, redo: router.redoDepth as number };
    });

test(
    "a received peer binding retires the slash draft and preserves the shared board",
    async ({ page, browser }, info) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, info, ["", ""]);
        const targets = (await readSlashState(page)).placements.filter(item => item.text === "");
        const first = await openKanbanSetup(page, targets[0].id);
        await first.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("kanban-empty")).toBeVisible();
        const created = await readSlashState(page);
        expect(created.tables).toHaveLength(1);
        expect(created.grids).toEqual([]);
        expect(created.boards).toHaveLength(1);
        const boardId = created.boards[0].id;
        const original = created.placements.find(item => item.kanbanId === boardId)!;

        await openKanbanSetup(page, targets[1].id);
        const pending = (await readSlashState(page)).placements.find(item => item.kind === "kanban" && !item.kanbanId)!;
        expect(pending.id).not.toBe(targets[1].id);
        expect(pending.kanbanId).toBeUndefined();
        expect(
            await page.evaluate(id => {
                const host = [...(globalThis as any).generalStore.currentPage.items].find((item: any) =>
                    item.id === id
                );
                return { id: host.id, children: host.items.length };
            }, pending.id),
        ).toEqual({ id: pending.id, children: 0 });
        const host = page.locator(`.outliner-item[data-item-id="${pending.id}"]`);
        const panel = host.getByTestId("kanban-create-panel");
        await panel.getByTestId("yjs-table-sql-name-input").fill("stale_draft");
        const baseline = await readSlashState(page);
        expect(definitions(baseline)).toEqual(definitions(created));
        const beforeHistory = await history(page);
        expect(Number.isInteger(beforeHistory.undo) && Number.isInteger(beforeHistory.redo)).toBe(true);
        const beforeEntry = await readKanbanEntry(page, boardId);
        expect(beforeEntry.hasSourceTableId).toBe(false);
        expect(beforeEntry.hasInsertTargetTableId).toBe(false);
        const expectedPlacements = baseline.placements.map(item =>
            item.id === pending.id ? { ...item, kanbanId: boardId } : item
        );

        const context = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
        try {
            const peer = await context.newPage();
            await peer.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
                (globalThis as any).__E2E__ = true;
            });
            await peer.goto(page.url());
            await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
            await peer.evaluate(async () =>
                (globalThis as any).__USER_MANAGER__.loginWithEmailPassword("test@example.com", "password")
            );
            await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.());
            await expect(peer.getByTestId("kanban-empty")).toBeVisible({ timeout: 60000 });
            await expect.poll(async () =>
                (await readSlashState(peer)).placements.some(item =>
                    item.id === pending.id && item.kind === "kanban" && !item.kanbanId
                )
            ).toBe(true);
            const peerPanel = peer.locator(`.outliner-item[data-item-id="${pending.id}"]`).getByTestId(
                "kanban-create-panel",
            );
            await expect(peerPanel).toBeVisible();
            await peerPanel.getByRole("button", { name: "Existing Kanban", exact: true }).click();
            const choices = peerPanel.getByLabel("Existing Kanban", { exact: true });
            await expect(choices.locator(`option[value="${boardId}"]`)).toHaveCount(1);
            await choices.selectOption(boardId);
            await peerPanel.getByRole("button", { name: "Use Kanban", exact: true }).click();

            // Establish receipt in A's actual Page model before inspecting its UI.
            await expect.poll(async () =>
                (await readSlashState(page)).placements.find(item => item.id === pending.id)?.kanbanId
            ).toBe(boardId);
            await expect(panel).toHaveCount(0);
            await expect(host.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", boardId);
            await expect(host.getByTestId("kanban-empty")).toBeVisible();
            const received = await readSlashState(page);
            expect(received.placements).toEqual(expectedPlacements);
            expect(received.placements.find(item => item.id === original.id)?.kanbanId).toBe(boardId);
            expect(definitions(received)).toEqual(definitions(baseline));
            expect(await readKanbanEntry(page, boardId)).toEqual(beforeEntry);
            expect(await history(page)).toEqual(beforeHistory);
            await info.attach("peer-rebound-state", {
                body: JSON.stringify({
                    pendingId: pending.id,
                    boardId,
                    beforeHistory,
                    afterHistory: await history(page),
                    baseline: definitions(baseline),
                    received: definitions(received),
                }),
                contentType: "application/json",
            });

            await page.reload();
            await expect(host.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", boardId);
            await expect(page.getByTestId("kanban-empty")).toHaveCount(2);
            await expect(panel).toHaveCount(0);
            await expect.poll(async () => definitions(await readSlashState(page))).toEqual(definitions(baseline));
            expect((await readSlashState(page)).placements).toEqual(expectedPlacements);
            expect(await readKanbanEntry(page, boardId)).toEqual(beforeEntry);
        } finally {
            await context.close();
        }
    },
);
