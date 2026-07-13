// Presets: predefined CREATE TABLE + UI Definition templates built on the
// consolidated Yjs table feature. The former dedicated Task Manager and Habit
// Tracker services are reconstructed as presets here.

import * as Y from "yjs";
import { createTable, getTableHandles, setSchemaText, type TableHandles } from "./tableDocs";

export interface TablePreset {
    key: "blank" | "tasks" | "habits";
    /** Display name used for the registry entry by default. */
    name: string;
    schemaSql: string;
    query: string;
    /** Cell component type per column (nested Y.Map in the UI Definition). */
    components: Record<string, { type: string; }>;
}

export const BLANK_PRESET: TablePreset = {
    key: "blank",
    name: "Table",
    schemaSql: "CREATE TABLE items (\n"
        + "  id TEXT PRIMARY KEY,\n"
        + "  title TEXT NOT NULL,\n"
        + "  done BOOLEAN\n"
        + ")",
    query: "SELECT id, title, done FROM items",
    components: {
        title: { type: "text" },
        done: { type: "checkbox" },
    },
};

// Task manager preset: recurring metadata is kept as plain columns; the list
// stays fully editable through the generic grid.
export const TASKS_PRESET: TablePreset = {
    key: "tasks",
    name: "Tasks",
    schemaSql: "CREATE TABLE tasks (\n"
        + "  id TEXT PRIMARY KEY,\n"
        + "  title TEXT NOT NULL,\n"
        + "  status TEXT CHECK (status IN ('open', 'done')),\n"
        + "  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),\n"
        + "  due_date DATE,\n"
        + "  repeat_days INTEGER,\n"
        + "  created_at TIMESTAMP,\n"
        + "  completed_at TIMESTAMP\n"
        + ")",
    query: "SELECT id, title, status, priority, due_date, repeat_days FROM tasks "
        + "ORDER BY status DESC, due_date NULLS LAST, priority",
    components: {
        title: { type: "text" },
        status: { type: "select" },
        priority: { type: "select" },
        due_date: { type: "date" },
        repeat_days: { type: "number" },
    },
};

// Habit tracker preset: one table holds habit definitions (kind='habit') and
// completion logs (kind='log'), mirroring the former dedicated tracker.
export const HABITS_PRESET: TablePreset = {
    key: "habits",
    name: "Habits",
    schemaSql: "CREATE TABLE habits (\n"
        + "  id TEXT PRIMARY KEY,\n"
        + "  kind TEXT CHECK (kind IN ('habit', 'log')),\n"
        + "  habit_id TEXT,\n"
        + "  name TEXT,\n"
        + "  interval_days INTEGER,\n"
        + "  log_date DATE,\n"
        + "  created_at TIMESTAMP\n"
        + ")",
    query: "SELECT id, kind, name, interval_days, log_date FROM habits ORDER BY kind, name, log_date",
    components: {
        kind: { type: "select" },
        name: { type: "text" },
        interval_days: { type: "number" },
        log_date: { type: "date" },
    },
};

export const TABLE_PRESETS: TablePreset[] = [BLANK_PRESET, TASKS_PRESET, HABITS_PRESET];

/** Seed a table's UI Definition from a preset (nested Y.Map per column). */
export function applyPresetUi(handles: TableHandles, preset: TablePreset): void {
    handles.doc.transact(() => {
        handles.uiDef.set("query", preset.query);
        const components = new Y.Map<Y.Map<unknown>>();
        for (const [column, config] of Object.entries(preset.components)) {
            const cfg = new Y.Map<unknown>();
            cfg.set("type", config.type);
            components.set(column, cfg);
        }
        handles.uiDef.set("components", components);
    });
}

/**
 * Create a new table in the project doc from a preset: registry entry,
 * schema text and UI definition. Returns the new table id.
 */
export function createTableFromPreset(
    projectDoc: Y.Doc,
    preset: TablePreset,
    name: string = preset.name,
): string {
    const tableId = createTable(projectDoc, name);
    const handles = getTableHandles(projectDoc, tableId);
    if (handles) {
        setSchemaText(handles, preset.schemaSql);
        applyPresetUi(handles, preset);
    }
    return tableId;
}
