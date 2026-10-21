import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { configureKanbanThroughUi, createSourceThroughUi, readKanbanEntry } from "../utils/kanbanTestHelpers";

test(
    "changing SQL after Table-seeded slash creation routes rendering and edits to the new source",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const fixture = await createSourceThroughUi(page, info);
        await createBlankGrid(page, "Other", "other_tasks");
        await configureGrid(
            page,
            1,
            "CREATE TABLE other_tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)",
            "SELECT id, title, status FROM other_tasks",
            "Title",
        );
        await addSourceRecord(page, 1, 1);
        const b = (await readGridProjectState(page)).tables.find(table => table.sqlName === "other_tasks")!;
        const recordId = Object.keys(b.data)[0];
        await setCellValue(page, 1, recordId, "title", "From B");
        await setCellValue(page, 1, recordId, "status", "open");
        const before = await readGridProjectState(page);
        const target = (await readSlashState(page)).placements.find(item => item.text === "Kanban fixture")!;
        const panel = await openKanbanSetup(page, target.id);
        await panel.getByRole("button", { name: "New Kanban over Existing Table" }).click();
        await panel.getByLabel("Existing Table", { exact: true }).selectOption(fixture.tableId);
        await panel.getByRole("button", { name: "Create Kanban", exact: true }).click();
        await expect(page.getByTestId("kanban-board")).toBeVisible();
        const boardId = (await readSlashState(page)).boards[0].id;
        await configureKanbanThroughUi(page, {
            query: "SELECT id, title, status FROM other_tasks ORDER BY id",
            group: "status",
            title: "title",
        });
        const card = page.locator("article.card").filter({ hasText: "From B" });
        await expect(card).toBeVisible();
        const occurrence = await card.getAttribute("data-card-occurrence");
        const current = page.locator(`article.card[data-card-occurrence="${occurrence}"]`);
        await current.getByRole("button", { name: "Edit title" }).click();
        await current.getByRole("textbox", { name: "Edit title" }).fill("B edited");
        await current.getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.locator("article.card").filter({ hasText: "B edited" })).toBeVisible();
        const after = await readGridProjectState(page);
        expect(after.tables.find(table => table.id === fixture.tableId)).toEqual(
            before.tables.find(table => table.id === fixture.tableId),
        );
        expect((after.tables.find(table => table.id === b.id)!.data as any)[recordId].title).toBe("B edited");
        expect(await readKanbanEntry(page, boardId)).toMatchObject({
            hasSourceTableId: false,
            hasInsertTargetTableId: false,
        });
    },
);
