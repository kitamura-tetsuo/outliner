import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { readKanbanEntry } from "../utils/kanbanTestHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

test("existing Table seeds an independent board and existing Kanban shares the exact ID", async ({ page }, info) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, info, ["", "", ""]);
    const targets = (await readSlashState(page)).placements.filter(item => item.text === "");
    const first = await openKanbanSetup(page, targets[0].id);
    await first.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("kanban-board")).toHaveCount(1);
    const original = await readSlashState(page);
    const tableId = original.tables[0].id;
    const second = await openKanbanSetup(page, targets[1].id);
    await second.getByTestId("yjs-table-sql-name-input").fill("tasks");
    await second.getByTestId("yjs-table-create").click();
    await expect(second.getByTestId("yjs-table-create-error")).toContainText("already used");
    expect((await readSlashState(page)).tables).toEqual(original.tables);
    await second.getByRole("button", { name: "New Kanban over Existing Table" }).click();
    await second.getByLabel("Existing Table", { exact: true }).selectOption(tableId);
    await second.getByRole("button", { name: "Create Kanban", exact: true }).click();
    await expect(page.getByTestId("kanban-board")).toHaveCount(2);
    const after = await readSlashState(page);
    const added = after.boards.find(board => board.id !== original.boards[0].id)!;
    expect(added.value.query).toBe('SELECT * FROM "tasks"');
    expect(added.value.groupField).toBeUndefined();
    expect(added.value.titleField).toBeUndefined();
    expect(after.tables).toEqual(original.tables);
    expect(after.grids).toEqual([]);
    const third = await openKanbanSetup(page, targets[2].id, true);
    await third.getByRole("button", { name: "Existing Kanban", exact: true }).click();
    await third.getByLabel("Existing Kanban", { exact: true }).selectOption(added.id);
    await third.getByRole("button", { name: "Use Kanban" }).click();
    await expect(page.getByTestId("kanban-board")).toHaveCount(3);
    const sharedBoards = page.locator(`[data-testid="kanban-board"][data-kanban-id="${added.id}"]`);
    await sharedBoards.first().getByRole("button", { name: "Configure", exact: true }).click();
    const config = sharedBoards.first().getByTestId("kanban-config");
    const editor = new SqlEditorHelper(config.getByTestId("kanban-query-editor"));
    await editor.waitForReady();
    await editor.setValue(page, "SELECT id, title, status FROM tasks ORDER BY title");
    await editor.commit(page);
    await config.getByLabel("Grouping column").fill("status");
    await config.getByLabel("Title column").fill("title");
    await config.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(sharedBoards.getByTestId("kanban-empty")).toHaveCount(2);
    const shared = await readSlashState(page);
    expect(shared.boards).toHaveLength(2);
    expect(shared.boards.find(board => board.id === added.id)?.value).toMatchObject({
        query: "SELECT id, title, status FROM tasks ORDER BY title",
        groupField: "status",
        titleField: "title",
    });
    expect(shared.placements.filter(item => item.kanbanId === added.id)).toHaveLength(2);
    expect(await readKanbanEntry(page, added.id)).toMatchObject({
        hasSourceTableId: false,
        hasInsertTargetTableId: false,
    });
    await page.reload();
    await expect(page.getByTestId("kanban-board")).toHaveCount(3, { timeout: 30000 });
    expect((await readSlashState(page)).boards).toEqual(shared.boards);
    expect((await readSlashState(page)).placements).toEqual(shared.placements);
});
