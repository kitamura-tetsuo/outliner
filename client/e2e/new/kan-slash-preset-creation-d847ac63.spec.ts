import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "../utils/registerAfterEachSnapshot";
const TABLE_PRESETS = [
    {
        key: "blank",
        query: (t: string) => `SELECT id, title, done FROM ${t}`,
        schemaSql: (t: string) =>
            `CREATE TABLE ${t} (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  done BOOLEAN\n)`,
    },
    {
        key: "tasks",
        query: (t: string) =>
            `SELECT id, title, status, priority, due_date, repeat_days FROM ${t} ORDER BY status DESC, due_date NULLS LAST, priority`,
        schemaSql: (t: string) =>
            `CREATE TABLE ${t} (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  status TEXT CHECK (status IN ('open', 'done')),\n  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),\n  due_date DATE,\n  repeat_days INTEGER,\n  created_at TIMESTAMP,\n  completed_at TIMESTAMP\n)`,
    },
    {
        key: "habits",
        query: (t: string) => `SELECT id, kind, name, interval_days, log_date FROM ${t} ORDER BY kind, name, log_date`,
        schemaSql: (t: string) =>
            `CREATE TABLE ${t} (\n  id TEXT PRIMARY KEY,\n  kind TEXT CHECK (kind IN ('habit', 'log')),\n  habit_id TEXT,\n  name TEXT,\n  interval_days INTEGER,\n  log_date DATE,\n  created_at TIMESTAMP\n)`,
    },
];
import { expect, test } from "../fixtures/grid-render-trace";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { readKanbanEntry, readKanbanPurityState } from "../utils/kanbanTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

for (const preset of TABLE_PRESETS) {
    test(`${preset.key}: slash creates only initialized Table and independent Kanban`, async ({ page }, info) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, info, [""]);
        const target = (await readSlashState(page)).placements.find(item => item.text === "")!;
        const panel = await openKanbanSetup(page, target.id, preset.key === "habits");
        const pending = await readSlashState(page);
        expect(pending.tables).toEqual([]);
        expect(pending.grids).toEqual([]);
        expect(pending.boards).toEqual([]);
        expect(pending.placements.some(item => item.id === target.id)).toBe(false);
        const placement = pending.placements.find(item => item.kind === "kanban")!;
        await panel.getByTestId("yjs-table-preset-select").selectOption(preset.key);
        await panel.getByTestId("yjs-table-sql-name-input").fill(`custom_${preset.key}`);
        await panel.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("kanban-board")).toBeVisible();
        const state = await readSlashState(page);
        expect(state.tables).toHaveLength(1);
        expect(state.grids).toEqual([]);
        expect(state.boards).toHaveLength(1);
        const board = state.boards[0];
        expect(board.value.query).toBe(preset.query(`custom_${preset.key}`));
        expect(board.value.titleField).toBe(preset.key === "habits" ? "name" : "title");
        expect(board.value.groupField).toBe(
            preset.key === "blank" ? undefined : preset.key === "habits" ? "kind" : "status",
        );
        expect(state.placements.find(item => item.id === placement.id)?.kanbanId).toBe(board.id);
        const raw = await readKanbanEntry(page, board.id);
        expect(raw.hasSourceTableId).toBe(false);
        expect(raw.hasInsertTargetTableId).toBe(false);
        const source = (await readKanbanPurityState(page)).tables[0];
        expect(source.schema).toBe(preset.schemaSql(`custom_${preset.key}`));
        expect(source.data).toEqual({});
        if (preset.key === "blank") {
            await expect(page.getByTestId("kanban-board")).toContainText(/group|incomplete|configur/i);
        }
        await expect.poll(async () => (await readSlashState(page)).boards).toEqual(state.boards);
        await page.reload();
        await expect(page.getByTestId("kanban-board")).toBeVisible({ timeout: 30000 });
        expect((await readSlashState(page)).boards).toEqual(state.boards);
        expect((await readSlashState(page)).placements).toEqual(state.placements);
        expect((await readSlashState(page)).grids).toEqual([]);
        // Table subdocuments hydrate through their normal owning surface,
        // even when Blank's incomplete board intentionally executes no SQL.
        const show = page.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible().catch(() => false)) await show.click();
        await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await page.getByTestId(`object-open-${source.id}`).click();
        await expect(page.getByTestId("table-entity-view")).toBeVisible();
        await expect.poll(async () => (await readKanbanPurityState(page)).tables).toEqual([source]);
    });
}
