import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GRID_REGISTRY_KEY } from "../../../../services/yjstable/gridDocs";
import { TABLE_REGISTRY_KEY } from "../../../../services/yjstable/tableDocs";
import {
    BLANK_PRESET,
    createTableFromPreset,
    HABITS_PRESET,
    TABLE_PRESETS,
    TASKS_PRESET,
} from "../../../../services/yjstable/tablePresets";

describe("tablePresets", () => {
    it("should export the predefined presets", () => {
        expect(BLANK_PRESET.key).toBe("blank");
        expect(TASKS_PRESET.key).toBe("tasks");
        expect(HABITS_PRESET.key).toBe("habits");
        expect(TABLE_PRESETS).toContain(BLANK_PRESET);
        expect(TABLE_PRESETS).toContain(TASKS_PRESET);
        expect(TABLE_PRESETS).toContain(HABITS_PRESET);
    });

    describe("preset properties", () => {
        it("should generate valid schema and query for BLANK_PRESET", () => {
            const schema = BLANK_PRESET.schemaSql("my_blank_table");
            expect(schema).toContain("CREATE TABLE my_blank_table");
            expect(schema).toContain("id TEXT PRIMARY KEY");

            const query = BLANK_PRESET.query("my_blank_table");
            expect(query).toBe("SELECT id, title, done FROM my_blank_table");
        });

        it("should generate valid schema and query for TASKS_PRESET", () => {
            const schema = TASKS_PRESET.schemaSql("my_tasks_table");
            expect(schema).toContain("CREATE TABLE my_tasks_table");
            expect(schema).toContain("status TEXT CHECK");

            const query = TASKS_PRESET.query("my_tasks_table");
            expect(query).toContain("SELECT id, title, status, priority, due_date, repeat_days FROM my_tasks_table");
            expect(query).toContain("ORDER BY");
        });

        it("should generate valid schema and query for HABITS_PRESET", () => {
            const schema = HABITS_PRESET.schemaSql("my_habits_table");
            expect(schema).toContain("CREATE TABLE my_habits_table");
            expect(schema).toContain("habit_id TEXT");

            const query = HABITS_PRESET.query("my_habits_table");
            expect(query).toContain("SELECT id, kind, name, interval_days, log_date FROM my_habits_table");
        });
    });

    describe("createTableFromPreset", () => {
        it("should create a table and a grid based on the given preset", () => {
            const doc = new Y.Doc();
            doc.guid = "test-project-id";

            const result = createTableFromPreset(doc, BLANK_PRESET, "My Blank Table", "custom_sql_name");

            expect(result.tableId).toBeDefined();
            expect(result.gridId).toBeDefined();

            // Verify table registry
            const registry = doc.getMap(TABLE_REGISTRY_KEY);
            const tableEntry = registry.get(result.tableId) as Y.Map<unknown>;
            expect(tableEntry).toBeDefined();
            expect(tableEntry.get("name")).toBe("My Blank Table");
            expect(tableEntry.get("sqlName")).toBe("custom_sql_name");

            // Verify grid registry
            const gridRegistry = doc.getMap(GRID_REGISTRY_KEY);
            const gridEntry = gridRegistry.get(result.gridId) as Y.Map<unknown>;
            expect(gridEntry).toBeDefined();
            expect(gridEntry.get("sourceTableId")).toBe(result.tableId);
            expect(gridEntry.get("name")).toBe("My Blank Table");
            expect(gridEntry.get("query")).toBe(BLANK_PRESET.query("custom_sql_name"));

            // Verify components mapping in grid
            const components = gridEntry.get("components") as Y.Map<any>;
            expect(components).toBeDefined();
            const titleCol = components.get("title") as Y.Map<any>;
            expect(titleCol.get("type")).toBe("text");
            const doneCol = components.get("done") as Y.Map<any>;
            expect(doneCol.get("type")).toBe("checkbox");
        });

        it("should use default names if not provided", () => {
            const doc = new Y.Doc();
            doc.guid = "test-project-id";

            const result = createTableFromPreset(doc, TASKS_PRESET);

            // Verify table registry
            const registry = doc.getMap(TABLE_REGISTRY_KEY);
            const tableEntry = registry.get(result.tableId) as Y.Map<unknown>;
            expect(tableEntry.get("name")).toBe("Tasks");
            expect(tableEntry.get("sqlName")).toBe("tasks");
        });
    });
});
