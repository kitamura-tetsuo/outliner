import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import type { Table } from "../schema/app-schema";

export const DEMO_TASK_TABLE_DDL = `CREATE TABLE demo_tasks (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    due_date TEXT
);`;

export const DEMO_HABIT_TABLE_DDL = `CREATE TABLE demo_habits (
    id TEXT PRIMARY KEY,
    habit_name TEXT,
    streak INTEGER,
    last_completed TEXT
);`;

export function applyTaskPreset(table: Table) {
    const oldLen = table.schema.length;
    table.schema.delete(0, oldLen);
    table.schema.insert(0, DEMO_TASK_TABLE_DDL);

    table.ui.set("query", "SELECT * FROM demo_tasks ORDER BY priority DESC;");
    table.ui.set("components", {
        title: { type: "text" },
        status: { type: "select" },
        priority: { type: "select" },
        due_date: { type: "text" }, // Date picker component could be added later
    });

    // Seed some task data
    const id1 = uuidv4();
    const map1 = new Y.Map<string>();
    map1.set("title", "Complete Dynamic Table");
    map1.set("status", "in_progress");
    map1.set("priority", "high");
    map1.set("due_date", "2026-07-20");
    table.data.set(id1, map1);

    const id2 = uuidv4();
    const map2 = new Y.Map<string>();
    map2.set("title", "Review PRs");
    map2.set("status", "todo");
    map2.set("priority", "medium");
    table.data.set(id2, map2);
}

export function applyHabitPreset(table: Table) {
    const oldLen = table.schema.length;
    table.schema.delete(0, oldLen);
    table.schema.insert(0, DEMO_HABIT_TABLE_DDL);

    table.ui.set("query", "SELECT * FROM demo_habits ORDER BY streak DESC;");
    table.ui.set("components", {
        habit_name: { type: "text" },
        streak: { type: "text" }, // Usually readonly, but text for now
        last_completed: { type: "text" },
    });

    const id1 = uuidv4();
    const map1 = new Y.Map<string>();
    map1.set("habit_name", "Morning Jog");
    map1.set("streak", "5");
    map1.set("last_completed", "2026-07-13");
    table.data.set(id1, map1);
}
