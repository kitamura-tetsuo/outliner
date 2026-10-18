/** @feature KAN-5a45c9e1 */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import { configureKanbanThroughUi, createKanbanThroughUi, openKanbanList } from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

async function setChoiceCell(
    page: Parameters<typeof setCellValue>[0],
    viewIndex: number,
    recordId: string,
    column: string,
    value: string,
): Promise<void> {
    const select = page.getByTestId("yjs-table-view").nth(viewIndex)
        .getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${recordId}"][data-col="${column}"] select.cell-select`);
    await expect(select).toBeVisible({ timeout: 30000 });
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
}

test("a UNION card refuses lanes excluded by its actual supplier schema", async ({ page }, info) => {
    test.setTimeout(180000);
    const seeded = await TestHelpers.seedProjectAndNavigate(page, info, ["Kanban UNION fixture"]);
    await createBlankGrid(page, "A", "a_tasks");
    await configureGrid(
        page,
        0,
        "CREATE TABLE a_tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT CHECK (status IN ('open', 'done')))",
        "SELECT id, title, status FROM a_tasks",
        "A title",
    );
    await addSourceRecord(page, 0, 1);
    let state = await readGridProjectState(page);
    const a = state.tables.find(table => table.sqlName === "a_tasks")!;
    const aId = Object.keys(a.data)[0]!;
    await setCellValue(page, 0, aId, "title", "A card");
    await setChoiceCell(page, 0, aId, "status", "open");

    await createBlankGrid(page, "B", "b_tasks");
    await configureGrid(
        page,
        1,
        "CREATE TABLE b_tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT CHECK (status IN ('todo', 'blocked')))",
        "SELECT id, title, status FROM b_tasks",
        "B title",
    );
    await addSourceRecord(page, 1, 1);
    state = await readGridProjectState(page);
    const b = state.tables.find(table => table.sqlName === "b_tasks")!;
    const bId = Object.keys(b.data)[0]!;
    await setCellValue(page, 1, bId, "title", "B card");
    await setChoiceCell(page, 1, bId, "status", "todo");

    await openKanbanList(page, seeded.projectName);
    await createKanbanThroughUi(page, "Union lanes", a.id);
    await configureKanbanThroughUi(page, {
        query: "SELECT 'a_tasks' AS source_kind, id AS source_id, title, status FROM a_tasks "
            + "UNION ALL SELECT 'b_tasks', id, title, status FROM b_tasks",
        group: "status",
        title: "title",
    });

    const bCard = page.locator("article.card").filter({ hasText: "B card" });
    const openLane = page.locator("section.lane").filter({ has: page.getByRole("heading", { name: /open/ }) });
    const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    const handle = bCard.getByRole("button", { name: "Move card" });
    // The card is rendered before its query provenance and write controller
    // necessarily finish loading. Wait for that production readiness boundary
    // instead of starting a native drag while the handle is still disabled.
    await expect(handle).toHaveAttribute("draggable", "true");
    // This refusal does not refresh the card DOM, so Playwright's native
    // drag sequence can exercise the complete browser gesture reliably.
    await handle.dragTo(openLane);

    await expect(page.getByTestId("kanban-operation-message")).toContainText("invalid for this field");
    state = await readGridProjectState(page);
    expect(state.tables.find(table => table.id === a.id)?.data[aId]?.status).toBe("open");
    expect(state.tables.find(table => table.id === b.id)?.data[bId]?.status).toBe("todo");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
});
