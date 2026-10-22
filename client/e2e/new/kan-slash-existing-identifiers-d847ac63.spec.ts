import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, configureGrid, createBlankGrid, setCellValue } from "../utils/crossProjectGridHelpers";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { TestHelpers } from "../utils/testHelpers";

test("creates Kanban over existing Table preserving Unicode and quoted SQL identifiers", async ({ page }, info) => {
    test.setTimeout(240000);
    await TestHelpers.seedProjectAndNavigate(page, info, ["", ""]);

    // --- Case 1: Non-ASCII identifier (日本語) ---
    const initialTargets = (await readSlashState(page)).placements.filter(item => item.text === "");
    const firstTargetId = initialTargets[0].id;

    await createBlankGrid(page, "Japanese Table", "japanese_temp");
    await configureGrid(
        page,
        0,
        `CREATE TABLE 日本語 (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT
)`,
        `SELECT * FROM "日本語"`,
        "title",
    );

    // Wait until the real applied schema and live Table registry expose the intended exact sqlName
    await expect.poll(async () => {
        const tables = (await readSlashState(page)).tables;
        return tables.find(t => t.value.sqlName === "日本語")?.id;
    }, { timeout: 30000 }).toBeDefined();

    const firstTableState = (await readSlashState(page)).tables.find(t => t.value.sqlName === "日本語")!;
    const firstTableId = firstTableState.id;

    await addSourceRecord(page, 0, 1);
    const firstRecords = (await readSlashState(page)).tables.find(t => t.id === firstTableId)!.value.data;
    const firstRecordId = Object.keys(firstRecords)[0];
    await setCellValue(page, 0, firstRecordId, "title", "タスク1");
    await setCellValue(page, 0, firstRecordId, "status", "進行中");

    const snapshotBeforeFirst = await readSlashState(page);

    const firstPanel = await openKanbanSetup(page, firstTargetId);
    const pending1 = await readSlashState(page);
    const placement1 = pending1.placements.find(item => item.kind === "kanban")!;
    expect(placement1).toBeDefined();

    await firstPanel.getByRole("button", { name: "New Kanban over Existing Table" }).click();
    await firstPanel.getByLabel("Existing Table", { exact: true }).selectOption(firstTableId);
    await firstPanel.getByRole("button", { name: "Create Kanban", exact: true }).click();

    await expect(page.getByTestId("kanban-board")).toHaveCount(1);
    const stateAfterFirst = await readSlashState(page);
    const firstBoard = stateAfterFirst.boards[0];
    expect(firstBoard.value.query).toBe('SELECT * FROM "日本語"');
    expect(firstBoard.value.groupField).toBeUndefined();
    expect(firstBoard.value.titleField).toBeUndefined();
    expect((firstBoard.value as any).sourceTableId).toBeUndefined();
    expect((firstBoard.value as any).insertTargetTableId).toBeUndefined();

    // Verify independent binding: pending placement is bound to firstBoard.id
    const boundPlacement1 = stateAfterFirst.placements.find(p => p.id === placement1.id)!;
    expect(boundPlacement1.kanbanId).toBe(firstBoard.id);

    // Grid, Table, records snapshot unchanged
    expect(stateAfterFirst.tables).toEqual(snapshotBeforeFirst.tables);
    expect(stateAfterFirst.grids).toEqual(snapshotBeforeFirst.grids);

    // Open board configurator and set roles without replacing query
    const boardLocator1 = page.locator(`[data-testid="kanban-board"][data-kanban-id="${firstBoard.id}"]`);
    await boardLocator1.getByRole("button", { name: "Configure", exact: true }).click();
    const config1 = boardLocator1.getByTestId("kanban-config");
    await config1.getByLabel("Grouping column").fill("status");
    await config1.getByLabel("Title column").fill("title");
    await config1.getByRole("button", { name: "Apply", exact: true }).click();

    // Verify card renders
    await expect(boardLocator1.locator("article.card")).toHaveCount(1);
    await expect(boardLocator1.locator("article.card")).toContainText("タスク1");
    expect((await readSlashState(page)).boards.find(b => b.id === firstBoard.id)!.value.query).toBe(
        'SELECT * FROM "日本語"',
    );

    // Reload test for Case 1
    await page.reload();
    await expect(page.getByTestId("kanban-board")).toHaveCount(1, { timeout: 30000 });
    const reloadedBoard1 = page.locator(`[data-testid="kanban-board"][data-kanban-id="${firstBoard.id}"]`);
    await expect(reloadedBoard1.locator("article.card")).toHaveCount(1);
    await expect(reloadedBoard1.locator("article.card")).toContainText("タスク1");
    const reloadedState1 = await readSlashState(page);
    expect(reloadedState1.boards.find(b => b.id === firstBoard.id)!.value.query).toBe('SELECT * FROM "日本語"');
    expect(reloadedState1.boards.find(b => b.id === firstBoard.id)!.value.groupField).toBe("status");
    expect(reloadedState1.boards.find(b => b.id === firstBoard.id)!.value.titleField).toBe("title");
    expect(reloadedState1.tables).toEqual(snapshotBeforeFirst.tables);

    // --- Case 2: Quoted identifier with spaces/mixed case ("Case Tasks") ---
    const secondTargetId = reloadedState1.placements.find(item => item.text === "" && !item.kanbanId)!.id;

    await createBlankGrid(page, "Case Tasks Table", "case_temp");
    await configureGrid(
        page,
        1,
        `CREATE TABLE "Case Tasks" (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT
)`,
        `SELECT * FROM "Case Tasks"`,
        "title",
    );

    // Wait until the real applied schema and live Table registry expose the intended exact sqlName
    await expect.poll(async () => {
        const tables = (await readSlashState(page)).tables;
        return tables.find(t => t.value.sqlName === "Case Tasks")?.id;
    }, { timeout: 30000 }).toBeDefined();

    const secondTableState = (await readSlashState(page)).tables.find(t => t.value.sqlName === "Case Tasks")!;
    const secondTableId = secondTableState.id;

    await addSourceRecord(page, 1, 1);
    const secondRecords = (await readSlashState(page)).tables.find(t => t.id === secondTableId)!.value.data;
    const secondRecordId = Object.keys(secondRecords)[0];
    await setCellValue(page, 1, secondRecordId, "title", "Case Item 1");
    await setCellValue(page, 1, secondRecordId, "status", "Review");

    const snapshotBeforeSecond = await readSlashState(page);

    const secondPanel = await openKanbanSetup(page, secondTargetId);
    const pending2 = await readSlashState(page);
    const placement2 = pending2.placements.find(item => item.kind === "kanban" && item.id !== placement1.id)!;
    expect(placement2).toBeDefined();

    await secondPanel.getByRole("button", { name: "New Kanban over Existing Table" }).click();
    await secondPanel.getByLabel("Existing Table", { exact: true }).selectOption(secondTableId);
    await secondPanel.getByRole("button", { name: "Create Kanban", exact: true }).click();

    await expect(page.getByTestId("kanban-board")).toHaveCount(2);
    const stateAfterSecond = await readSlashState(page);
    const secondBoard = stateAfterSecond.boards.find(b => b.id !== firstBoard.id)!;
    expect(secondBoard.value.query).toBe('SELECT * FROM "Case Tasks"');
    expect(secondBoard.value.groupField).toBeUndefined();
    expect(secondBoard.value.titleField).toBeUndefined();
    expect((secondBoard.value as any).sourceTableId).toBeUndefined();
    expect((secondBoard.value as any).insertTargetTableId).toBeUndefined();

    // Verify independent binding: pending placement is bound to secondBoard.id
    const boundPlacement2 = stateAfterSecond.placements.find(p => p.id === placement2.id)!;
    expect(boundPlacement2.kanbanId).toBe(secondBoard.id);

    // Grid, Table, records snapshot unchanged
    expect(stateAfterSecond.tables).toEqual(snapshotBeforeSecond.tables);
    expect(stateAfterSecond.grids).toEqual(snapshotBeforeSecond.grids);

    // Open board configurator and set roles without replacing query
    const boardLocator2 = page.locator(`[data-testid="kanban-board"][data-kanban-id="${secondBoard.id}"]`);
    await boardLocator2.getByRole("button", { name: "Configure", exact: true }).click();
    const config2 = boardLocator2.getByTestId("kanban-config");
    await config2.getByLabel("Grouping column").fill("status");
    await config2.getByLabel("Title column").fill("title");
    await config2.getByRole("button", { name: "Apply", exact: true }).click();

    // Verify card renders
    await expect(boardLocator2.locator("article.card")).toHaveCount(1);
    await expect(boardLocator2.locator("article.card")).toContainText("Case Item 1");
    expect((await readSlashState(page)).boards.find(b => b.id === secondBoard.id)!.value.query).toBe(
        'SELECT * FROM "Case Tasks"',
    );

    // Reload test for Case 2
    await page.reload();
    await expect(page.getByTestId("kanban-board")).toHaveCount(2, { timeout: 30000 });
    const reloadedBoard2 = page.locator(`[data-testid="kanban-board"][data-kanban-id="${secondBoard.id}"]`);
    await expect(reloadedBoard2.locator("article.card")).toHaveCount(1);
    await expect(reloadedBoard2.locator("article.card")).toContainText("Case Item 1");
    const reloadedState2 = await readSlashState(page);
    expect(reloadedState2.boards.find(b => b.id === secondBoard.id)!.value.query).toBe('SELECT * FROM "Case Tasks"');
    expect(reloadedState2.boards.find(b => b.id === secondBoard.id)!.value.groupField).toBe("status");
    expect(reloadedState2.boards.find(b => b.id === secondBoard.id)!.value.titleField).toBe("title");
    expect(reloadedState2.tables).toEqual(snapshotBeforeSecond.tables);
});
