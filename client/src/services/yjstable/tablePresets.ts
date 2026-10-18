// Presets: predefined CREATE TABLE + Grid definition templates.
//
// A preset can seed a standalone Table, or the compatibility workflow can
// compose that operation with one Grid over the new Table. Keeping the Table
// writer independent lets other presentation creators reuse presets without
// allocating an unused Grid.

import { validateExplicitSelectAliases } from "$shared/services/explicitSelectAlias";
import * as Y from "yjs";
import { createGrid } from "./gridDocs";
import { sqlNameError } from "./sqlNames";
import { createTable, listTables } from "./tableDocs";

export interface TablePreset {
    key: "blank" | "tasks" | "habits";
    /** Display name used for the registry entry by default. */
    name: string;
    /** Default SQL name suggested by the creation dialog. */
    defaultSqlName: string;
    /**
     * Preset SQL is a template: the SQL name chosen at creation time is the
     * real `CREATE TABLE` identifier, so two tables built from the same preset
     * are two distinct relations instead of two copies of one hardcoded name.
     */
    schemaSql: (table: string) => string;
    query: (table: string) => string;
    /** Cell component type per column (nested Y.Map in the Grid definition). */
    components: Record<string, { type: string; }>;
}

export const BLANK_PRESET: TablePreset = {
    key: "blank",
    name: "Table",
    defaultSqlName: "items",
    schemaSql: (t) =>
        `CREATE TABLE ${t} (\n`
        + "  id TEXT PRIMARY KEY,\n"
        + "  title TEXT NOT NULL,\n"
        + "  done BOOLEAN\n"
        + ")",
    query: (t) => `SELECT id, title, done FROM ${t}`,
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
    defaultSqlName: "tasks",
    schemaSql: (t) =>
        `CREATE TABLE ${t} (\n`
        + "  id TEXT PRIMARY KEY,\n"
        + "  title TEXT NOT NULL,\n"
        + "  status TEXT CHECK (status IN ('open', 'done')),\n"
        + "  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),\n"
        + "  due_date DATE,\n"
        + "  repeat_days INTEGER,\n"
        + "  created_at TIMESTAMP,\n"
        + "  completed_at TIMESTAMP\n"
        + ")",
    query: (t) =>
        `SELECT id, title, status, priority, due_date, repeat_days FROM ${t} `
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
    defaultSqlName: "habits",
    schemaSql: (t) =>
        `CREATE TABLE ${t} (\n`
        + "  id TEXT PRIMARY KEY,\n"
        + "  kind TEXT CHECK (kind IN ('habit', 'log')),\n"
        + "  habit_id TEXT,\n"
        + "  name TEXT,\n"
        + "  interval_days INTEGER,\n"
        + "  log_date DATE,\n"
        + "  created_at TIMESTAMP\n"
        + ")",
    query: (t) => `SELECT id, kind, name, interval_days, log_date FROM ${t} ORDER BY kind, name, log_date`,
    components: {
        kind: { type: "select" },
        name: { type: "text" },
        interval_days: { type: "number" },
        log_date: { type: "date" },
    },
};

export const TABLE_PRESETS: TablePreset[] = [BLANK_PRESET, TASKS_PRESET, HABITS_PRESET];

export interface PresetCreationResult {
    tableId: string;
    gridId: string;
}

function assertAvailableSqlName(projectDoc: Y.Doc, sqlName: string): void {
    const invalid = sqlNameError(sqlName);
    if (invalid) throw new Error(invalid);
    if (listTables(projectDoc).some(table => table.sqlName === sqlName)) {
        throw new Error(`SQL name "${sqlName}" is already used in this project`);
    }
}

/**
 * Create one fully initialized Table from a preset, without creating or
 * changing any presentation object. The schema template is evaluated before
 * publication, and createTable's initializer completes the subdoc before the
 * registry entry becomes observable.
 */
export function createTableOnlyFromPreset(
    projectDoc: Y.Doc,
    preset: TablePreset,
    name: string = preset.name,
    sqlName: string = preset.defaultSqlName,
): string {
    assertAvailableSqlName(projectDoc, sqlName);
    const schema = preset.schemaSql(sqlName);
    return createTable(projectDoc, name, sqlName, handles => {
        handles.schemaText.insert(0, schema);
    });
}

/**
 * Create a Table AND a matching Grid from the preset. The Table owns
 * schema/data only; the Grid owns the SELECT and per-column settings.
 */
export function createTableFromPreset(
    projectDoc: Y.Doc,
    preset: TablePreset,
    name: string = preset.name,
    sqlName: string = preset.defaultSqlName,
): PresetCreationResult {
    // Evaluate every user-supplied preset function before publishing either
    // object. In particular, a malformed/throwing query cannot leave behind a
    // successfully published Table with no matching Grid.
    assertAvailableSqlName(projectDoc, sqlName);
    const schema = preset.schemaSql(sqlName);
    const query = preset.query(sqlName);
    const components = Object.fromEntries(
        Object.entries(preset.components).map(([column, cfg]) => [column, { type: cfg.type }]),
    );
    if (query.trim()) validateExplicitSelectAliases(query);

    const tableId = createTable(projectDoc, name, sqlName, handles => {
        handles.schemaText.insert(0, schema);
    });

    const gridId = createGrid(projectDoc, undefined, {
        name,
        query,
        components,
    });

    return { tableId, gridId };
}
