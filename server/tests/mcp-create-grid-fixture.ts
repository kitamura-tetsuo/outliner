import * as Y from "yjs";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { Item, Project } from "../src/schema/app-schema.js";

/**
 * A production-shaped project for createGridOnPage: two Tables in the
 * project registry (with their Table subdocs), an existing Grid, and a Page
 * with pre-existing children. The Hocuspocus stand-in hands the services the
 * same live Y.Docs, exactly as openDirectConnection does in the server.
 */
export function createGridFixture(canAccess: (uid: string, projectId: string) => Promise<boolean> = async () => true) {
    const project = Project.createInstance("Grid creation");
    const tables = project.ydoc.getMap<Y.Map<unknown>>("yjsTables");
    const rooms = new Map<string, Y.Doc>([["projects/project-1", project.ydoc]]);
    const addTable = (
        tableId: string,
        name: string,
        sqlName: string,
        schema: string,
        rows: Record<string, unknown>[],
    ) => {
        const entry = new Y.Map<unknown>();
        entry.set("name", name);
        entry.set("sqlName", sqlName);
        tables.set(tableId, entry);
        const doc = new Y.Doc();
        doc.getText("schema").insert(0, schema);
        for (const row of rows) {
            const record = new Y.Map<unknown>();
            for (const [key, value] of Object.entries(row)) record.set(key, value);
            doc.getMap("data").set(String(row.id), record);
        }
        rooms.set(`projects/project-1/tables/${tableId}`, doc);
        return doc;
    };
    const tasks = addTable(
        "table-tasks",
        "Task list",
        "tasks",
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, owner TEXT)",
        [{ id: "t1", title: "Write spec", owner: "p1" }, { id: "t2", title: "Ship", owner: "p2" }],
    );
    const people = addTable(
        "table-people",
        "People",
        "people",
        "CREATE TABLE people (id TEXT PRIMARY KEY, label TEXT)",
        [{ id: "p1", label: "Ada" }, { id: "p2", label: "Lin" }],
    );
    const existingGrid = new Y.Map<unknown>();
    existingGrid.set("sourceTableId", "table-tasks");
    existingGrid.set("name", "Existing");
    existingGrid.set("query", "SELECT * FROM tasks");
    project.ydoc.getMap("yjsGrids").set("grid-existing", existingGrid);

    const page = project.addPage("Plans", "owner");
    const first = page.items.addNode("owner");
    first.updateText("first child");
    const nested = first.items.addNode("owner");
    nested.updateText("nested");
    page.items.addNode("owner").updateText("second child");
    const otherPage = project.addPage("Other", "owner");

    const hocuspocus = {
        openDirectConnection: async (room: string) => ({
            document: rooms.get(room),
            disconnect: async () => {},
        }),
    } as never;
    const relations = new OutlinerRelationService(hocuspocus, canAccess);
    const reads = new OutlinerReadService(hocuspocus, canAccess, async () => []);
    return { project, tasks, people, page, first, nested, otherPage, relations, reads };
}

export function gridIds(project: Project): string[] {
    return [...project.ydoc.getMap("yjsGrids").keys()].sort();
}

export function childKeys(item: Item): string[] {
    return [...item.items].map(child => child.key);
}

/** Every item in the project whose node value binds a Grid. */
export function gridPlacements(project: Project): string[] {
    const found: string[] = [];
    const visit = (items: Iterable<Item>) => {
        for (const item of items) {
            if (item.yjsGridId) found.push(`${item.key}:${item.yjsGridId}`);
            visit(item.items);
        }
    };
    visit(project.items);
    return found.sort();
}

/**
 * Run `mutate` once, right after the first executable Grid query validation
 * has finished its asynchronous SQL work and before the creation operation
 * reaches its mutation boundary. It wraps (not replaces) the real plan
 * inspection, so validation semantics stay production ones. Returns a counter
 * of how many validations executed. With `every`, it runs after each one.
 */
export function afterFirstValidation(relations: OutlinerRelationService, mutate: () => void, every = false) {
    const target = relations as unknown as {
        queryPlanDependencies: (...args: unknown[]) => Promise<string[]>;
    };
    const original = target.queryPlanDependencies.bind(relations);
    const calls = { count: 0 };
    target.queryPlanDependencies = async (...args: unknown[]) => {
        const result = await original(...args);
        calls.count++;
        if (every || calls.count === 1) mutate();
        return result;
    };
    return calls;
}
