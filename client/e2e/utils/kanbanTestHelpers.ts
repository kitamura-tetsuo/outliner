import { expect, type Page, type TestInfo } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "./crossProjectGridHelpers";
import { SqlEditorHelper } from "./sqlEditorHelpers";
import { TestHelpers } from "./testHelpers";

export const TASK_SCHEMA =
    "CREATE TABLE tasks (\n  id TEXT PRIMARY KEY,\n  title TEXT,\n  status TEXT,\n  detail TEXT\n)";
export const TASK_QUERY = "SELECT id, title, status, detail FROM tasks ORDER BY id";

export interface KanbanFixture {
    projectName: string;
    tableId: string;
    recordIds: string[];
}
export interface KanbanState {
    id: string;
    name: string;
    sourceTableId: string;
    query: string;
    groupField?: string;
    titleField?: string;
    detailFields: string[];
    laneOrder: Array<string | null>;
}

export async function createSourceThroughUi(page: Page, testInfo: TestInfo): Promise<KanbanFixture> {
    const seeded = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Kanban fixture"]);
    await createBlankGrid(page, "Tasks", "tasks");
    await configureGrid(page, 0, TASK_SCHEMA, TASK_QUERY, "Title");
    for (let count = 1; count <= 3; count++) await addSourceRecord(page, 0, count);
    const table = (await readGridProjectState(page)).tables.find(value => value.sqlName === "tasks");
    if (!table) throw new Error("Tasks Table was not created through the UI");
    const recordIds = Object.keys(table.data).sort();
    for (const [index, id] of recordIds.entries()) {
        await setCellValue(page, 0, id, "title", ["Alpha", "Beta", "Gamma"][index]);
        await setCellValue(page, 0, id, "status", ["open", "done", "open"][index]);
        await setCellValue(page, 0, id, "detail", `detail-${index + 1}`);
    }
    return { projectName: seeded.projectName, tableId: table.id, recordIds };
}

export async function openKanbanList(page: Page, projectName: string): Promise<void> {
    await page.goto(`/${encodeURIComponent(projectName)}/-/kanbans`);
    await expect(page.getByTestId("kanban-create-form")).toBeVisible({ timeout: 30000 });
}

export async function createKanbanThroughUi(page: Page, name: string, tableId: string): Promise<string> {
    const form = page.getByTestId("kanban-create-form");
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("Source table").selectOption(tableId);
    await form.getByRole("button", { name: "Create Kanban" }).click();
    await expect(page.getByTestId("kanban-board")).toBeVisible({ timeout: 30000 });
    const id = await page.getByTestId("kanban-board").getAttribute("data-kanban-id");
    if (!id) throw new Error("Created Kanban has no stable identity");
    return id;
}

export async function configureKanbanThroughUi(
    page: Page,
    values: { query: string; group: string; title?: string; details?: string[]; lanes?: string[]; },
): Promise<void> {
    await page.getByRole("button", { name: "Configure" }).click();
    const panel = page.getByTestId("kanban-config");
    const editor = new SqlEditorHelper(panel.getByTestId("kanban-query-editor"));
    await editor.waitForReady();
    await editor.setValue(page, values.query);
    await editor.commit(page);
    await panel.getByLabel("Grouping column").fill(values.group);
    await panel.getByLabel("Title column").fill(values.title ?? "");
    await panel.getByLabel("Detail columns (one per line)").fill((values.details ?? []).join("\n"));
    if (values.lanes) await panel.getByLabel(/Lane preference/).fill(values.lanes.join("\n"));
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(panel).toHaveCount(0);
    await expect.poll(async () => (await readKanbans(page)).at(-1)?.query).toBe(values.query);
}

export async function readKanbans(page: Page): Promise<KanbanState[]> {
    return page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject();
        if (!project?.ydoc) throw new Error("Project unavailable");
        const result: KanbanState[] = [];
        project.ydoc.getMap("yjsKanbans").forEach((entry: any, id: string) =>
            result.push({
                id,
                name: String(entry.get("name") ?? ""),
                sourceTableId: String(entry.get("sourceTableId") ?? ""),
                query: String(entry.get("query") ?? ""),
                groupField: entry.get("groupField"),
                titleField: entry.get("titleField"),
                detailFields: entry.get("detailFields") ?? [],
                laneOrder: entry.get("laneOrder") ?? [],
            })
        );
        return result;
    });
}
