import { v4 as uuidv4 } from "uuid";
import type { Item } from "../schema/app-schema";
import { getSqlStatic } from "./sqlService";

// Task manager and habit tracker built on top of the item-embedded SQL table
// feature: the data lives in the item's Yjs table rows (collaborative,
// cell-level CRDT) while every list view and aggregate is computed with real
// SQL (sql.js / SQLite) over an isolated in-memory database.

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

export const TASK_TABLE_DDL = "CREATE TABLE tasks (\n"
    + "  id TEXT PRIMARY KEY,\n"
    + "  title TEXT,\n"
    + "  status TEXT,\n" // 'open' | 'done'
    + "  priority TEXT,\n" // 'high' | 'medium' | 'low'
    + "  due_at TEXT,\n" // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' ('' = no due date)
    + "  repeat_days TEXT,\n" // recurrence interval in days ('' = one-shot task)
    + "  created_at TEXT,\n" // registration timestamp 'YYYY-MM-DDTHH:MM:SS'
    + "  completed_at TEXT\n" // completion timestamp ('' = not completed)
    + ")";

export const TASK_COLUMNS = [
    "id",
    "title",
    "status",
    "priority",
    "due_at",
    "repeat_days",
    "created_at",
    "completed_at",
];

// A single table holds both habit definitions (kind='habit') and daily
// completion logs (kind='log') so the whole tracker stays queryable with a
// self-join and remains editable through the generic SQL table grid.
export const HABIT_TABLE_DDL = "CREATE TABLE habits (\n"
    + "  id TEXT PRIMARY KEY,\n"
    + "  kind TEXT,\n" // 'habit' (definition) | 'log' (completion record)
    + "  habit_id TEXT,\n" // for logs: id of the habit definition row
    + "  name TEXT,\n" // habit name (definition rows)
    + "  interval_days TEXT,\n" // expected repeat interval in days (definition rows)
    + "  date TEXT,\n" // completion date 'YYYY-MM-DD' (log rows)
    + "  created_at TEXT\n" // registration timestamp of the row
    + ")";

export const HABIT_COLUMNS = [
    "id",
    "kind",
    "habit_id",
    "name",
    "interval_days",
    "date",
    "created_at",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPriority = "high" | "medium" | "low";
export type TaskView = "today" | "upcoming" | "overdue" | "completed" | "all";

export interface TaskRecord {
    id: string;
    title: string;
    status: "open" | "done";
    priority: TaskPriority;
    dueAt: string;
    repeatDays: number;
    createdAt: string;
    completedAt: string;
}

export interface TaskCounts {
    today: number;
    upcoming: number;
    overdue: number;
    completed: number;
    all: number;
}

export interface HabitStat {
    id: string;
    name: string;
    intervalDays: number;
    total: number;
    doneToday: boolean;
    lastDate: string;
    streak: number;
    logDates: string[];
}

// ---------------------------------------------------------------------------
// Date helpers (local time, SQLite-compatible ISO-8601 strings)
// ---------------------------------------------------------------------------

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

/** Local date as 'YYYY-MM-DD'. */
export function localDate(d: Date = new Date()): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local timestamp as 'YYYY-MM-DDTHH:MM:SS' (accepted by SQLite datetime()). */
export function localDateTime(d: Date = new Date()): string {
    return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Add whole days to a 'YYYY-MM-DD[THH:MM...]' string, preserving the time part. */
export function addDays(dateTime: string, days: number): string {
    const [datePart, timePart] = dateTime.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const next = new Date(y, m - 1, d + days);
    const nextDate = localDate(next);
    return timePart ? `${nextDate}T${timePart}` : nextDate;
}

/** Whole days from date string `a` to date string `b` (date parts only). */
export function daysBetween(a: string, b: string): number {
    const parse = (s: string) => {
        const [y, m, d] = s.split("T")[0].split("-").map(Number);
        return new Date(y, m - 1, d).getTime();
    };
    return Math.round((parse(b) - parse(a)) / 86400000);
}

function toComparable(dateTime: string): number {
    const [datePart, timePart] = dateTime.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh = 0, mm = 0, ss = 0] = (timePart ?? "").split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();
}

// ---------------------------------------------------------------------------
// Generic SQL runner: load plain rows into an isolated SQLite database and
// run a SELECT with bound parameters. Row sets are per-item and small, so a
// throwaway database per query keeps the shared sql.js database untouched.
// ---------------------------------------------------------------------------

export async function runTableSelect(
    ddl: string,
    columns: string[],
    rows: Record<string, string>[],
    select: string,
    params: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
    const SQL = await getSqlStatic();
    const db = new SQL.Database();
    try {
        db.exec(ddl);
        const tableName = ddl.match(/CREATE TABLE\s+"?([A-Za-z0-9_]+)"?/i)?.[1];
        if (!tableName) throw new Error("DDL does not define a table");

        const colList = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map(() => "?").join(", ");
        const insert = db.prepare(`INSERT INTO ${tableName} (${colList}) VALUES (${placeholders})`);
        try {
            for (const row of rows) {
                insert.run(columns.map((c) => row[c] ?? ""));
            }
        } finally {
            insert.free();
        }

        const stmt = db.prepare(select);
        try {
            const bound: Record<string, string> = {};
            for (const [key, value] of Object.entries(params)) {
                bound[key.startsWith("$") ? key : `$${key}`] = value;
            }
            if (Object.keys(bound).length > 0) stmt.bind(bound);
            const out: Record<string, unknown>[] = [];
            while (stmt.step()) {
                out.push(stmt.getAsObject());
            }
            return out;
        } finally {
            stmt.free();
        }
    } finally {
        try {
            db.close();
        } catch {
            // ignore close failures on the throwaway database
        }
    }
}

// ---------------------------------------------------------------------------
// Table bootstrap
// ---------------------------------------------------------------------------

/**
 * Make sure the item's embedded table uses the given schema.
 * Returns true when the table is ready. When the item already holds a table
 * with a different schema, no destructive change is made and false is
 * returned so the UI can ask before overwriting (`force` overwrites).
 */
function ensureTable(item: Item, ddl: string, columns: string[], force: boolean): boolean {
    if (item.tableSchema === ddl) return true;
    if (item.tableColumns.length === 0 || force) {
        item.defineTable(ddl, columns);
        return true;
    }
    return false;
}

export function ensureTaskTable(item: Item, force = false): boolean {
    return ensureTable(item, TASK_TABLE_DDL, TASK_COLUMNS, force);
}

export function ensureHabitTable(item: Item, force = false): boolean {
    return ensureTable(item, HABIT_TABLE_DDL, HABIT_COLUMNS, force);
}

// ---------------------------------------------------------------------------
// Task operations (write into the collaborative Yjs table rows)
// ---------------------------------------------------------------------------

export interface NewTask {
    title: string;
    dueAt?: string;
    priority?: TaskPriority;
    repeatDays?: number;
}

export function addTask(item: Item, task: NewTask, now: string = localDateTime()): string {
    const id = uuidv4();
    item.tableRows.addRow({
        id,
        title: task.title,
        status: "open",
        priority: task.priority ?? "medium",
        due_at: task.dueAt ?? "",
        repeat_days: task.repeatDays && task.repeatDays > 0 ? String(task.repeatDays) : "",
        created_at: now,
        completed_at: "",
    });
    return id;
}

function findRowIndex(item: Item, columns: string[], id: string): number {
    const rows = item.tableRows.toPlain(columns);
    return rows.findIndex((row) => row.id === id);
}

/**
 * Mark a task done, recording the completion timestamp. For recurring tasks
 * (repeat_days > 0) the next occurrence is created automatically with the due
 * date advanced by the interval until it lies in the future.
 * Returns the id of the spawned occurrence, if any.
 */
export function completeTask(item: Item, taskId: string, now: string = localDateTime()): string | undefined {
    const index = findRowIndex(item, TASK_COLUMNS, taskId);
    if (index < 0) return undefined;
    const row = item.tableRows.toPlain(TASK_COLUMNS)[index];

    item.tableRows.updateCell(index, "status", "done");
    item.tableRows.updateCell(index, "completed_at", now);

    const repeatDays = Number(row.repeat_days);
    if (!Number.isFinite(repeatDays) || repeatDays <= 0 || !row.due_at) return undefined;

    let nextDue = addDays(row.due_at, repeatDays);
    const nowMs = toComparable(now);
    while (toComparable(nextDue) <= nowMs) {
        nextDue = addDays(nextDue, repeatDays);
    }

    return addTask(item, {
        title: row.title,
        dueAt: nextDue,
        priority: (row.priority as TaskPriority) || "medium",
        repeatDays,
    }, now);
}

export function reopenTask(item: Item, taskId: string): void {
    const index = findRowIndex(item, TASK_COLUMNS, taskId);
    if (index < 0) return;
    item.tableRows.updateCell(index, "status", "open");
    item.tableRows.updateCell(index, "completed_at", "");
}

export function deleteTask(item: Item, taskId: string): void {
    const index = findRowIndex(item, TASK_COLUMNS, taskId);
    if (index >= 0) item.tableRows.deleteRow(index);
}

// ---------------------------------------------------------------------------
// Task queries (SQL views)
// ---------------------------------------------------------------------------

// Date-only due dates count as due at the end of that day, so a task due
// "today" (without a time) is not overdue until the day is over.
const DUE_TS = "datetime(CASE WHEN length(due_at) = 10 THEN due_at || 'T23:59:59' ELSE due_at END)";
const PRIORITY_ORDER = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";

const TASK_VIEW_SQL: Record<TaskView, string> = {
    today: "SELECT * FROM tasks WHERE status = 'open' AND due_at <> '' AND date(due_at) = date($now) "
        + `ORDER BY datetime(due_at), ${PRIORITY_ORDER}, datetime(created_at)`,
    upcoming: `SELECT * FROM tasks WHERE status = 'open' AND (due_at = '' OR ${DUE_TS} >= datetime($now)) `
        + `ORDER BY CASE WHEN due_at = '' THEN 1 ELSE 0 END, datetime(due_at), ${PRIORITY_ORDER}, datetime(created_at)`,
    overdue: `SELECT * FROM tasks WHERE status = 'open' AND due_at <> '' AND ${DUE_TS} < datetime($now) `
        + `ORDER BY datetime(due_at), ${PRIORITY_ORDER}`,
    completed: "SELECT * FROM tasks WHERE status = 'done' ORDER BY datetime(completed_at) DESC",
    all: "SELECT * FROM tasks ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, "
        + `CASE WHEN due_at = '' THEN 1 ELSE 0 END, datetime(due_at), ${PRIORITY_ORDER}, datetime(created_at)`,
};

function rowToTask(row: Record<string, unknown>): TaskRecord {
    const repeat = Number(row.repeat_days);
    return {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        status: row.status === "done" ? "done" : "open",
        priority: (["high", "medium", "low"].includes(String(row.priority))
            ? String(row.priority)
            : "medium") as TaskPriority,
        dueAt: String(row.due_at ?? ""),
        repeatDays: Number.isFinite(repeat) && repeat > 0 ? repeat : 0,
        createdAt: String(row.created_at ?? ""),
        completedAt: String(row.completed_at ?? ""),
    };
}

export async function queryTasks(
    item: Item,
    view: TaskView,
    now: string = localDateTime(),
): Promise<TaskRecord[]> {
    const rows = item.tableRows.toPlain(TASK_COLUMNS);
    const result = await runTableSelect(TASK_TABLE_DDL, TASK_COLUMNS, rows, TASK_VIEW_SQL[view], { now });
    return result.map(rowToTask);
}

export async function queryTaskCounts(item: Item, now: string = localDateTime()): Promise<TaskCounts> {
    const rows = item.tableRows.toPlain(TASK_COLUMNS);
    const sql = "SELECT "
        + "SUM(CASE WHEN status = 'open' AND due_at <> '' AND date(due_at) = date($now) THEN 1 ELSE 0 END) AS today, "
        + `SUM(CASE WHEN status = 'open' AND (due_at = '' OR ${DUE_TS} >= datetime($now)) THEN 1 ELSE 0 END) AS upcoming, `
        + `SUM(CASE WHEN status = 'open' AND due_at <> '' AND ${DUE_TS} < datetime($now) THEN 1 ELSE 0 END) AS overdue, `
        + "SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed, "
        + "COUNT(*) AS all_count "
        + "FROM tasks";
    const result = await runTableSelect(TASK_TABLE_DDL, TASK_COLUMNS, rows, sql, { now });
    const row = result[0] ?? {};
    return {
        today: Number(row.today ?? 0),
        upcoming: Number(row.upcoming ?? 0),
        overdue: Number(row.overdue ?? 0),
        completed: Number(row.completed ?? 0),
        all: Number(row.all_count ?? 0),
    };
}

// ---------------------------------------------------------------------------
// Habit operations
// ---------------------------------------------------------------------------

export function addHabit(
    item: Item,
    name: string,
    intervalDays = 1,
    now: string = localDateTime(),
): string {
    const id = uuidv4();
    item.tableRows.addRow({
        id,
        kind: "habit",
        habit_id: "",
        name,
        interval_days: String(intervalDays > 0 ? intervalDays : 1),
        date: "",
        created_at: now,
    });
    return id;
}

/** Toggle the completion log of a habit for the given 'YYYY-MM-DD' date. */
export function toggleHabitLog(
    item: Item,
    habitId: string,
    date: string,
    now: string = localDateTime(),
): void {
    const rows = item.tableRows.toPlain(HABIT_COLUMNS);
    const index = rows.findIndex((row) => row.kind === "log" && row.habit_id === habitId && row.date === date);
    if (index >= 0) {
        item.tableRows.deleteRow(index);
        return;
    }
    item.tableRows.addRow({
        id: uuidv4(),
        kind: "log",
        habit_id: habitId,
        name: "",
        interval_days: "",
        date,
        created_at: now,
    });
}

/** Delete a habit definition together with all of its completion logs. */
export function deleteHabit(item: Item, habitId: string): void {
    const rows = item.tableRows.toPlain(HABIT_COLUMNS);
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row.id === habitId || (row.kind === "log" && row.habit_id === habitId)) {
            item.tableRows.deleteRow(i);
        }
    }
}

// ---------------------------------------------------------------------------
// Habit queries (SQL aggregation + streak computation)
// ---------------------------------------------------------------------------

/**
 * Current streak: consecutive completions counted back from the most recent
 * log, where two logs are consecutive when they are at most `intervalDays`
 * apart. The streak is only "current" when the latest log is within the
 * interval of today.
 */
export function computeStreak(logDatesDesc: string[], intervalDays: number, today: string): number {
    if (logDatesDesc.length === 0) return 0;
    const interval = intervalDays > 0 ? intervalDays : 1;
    if (daysBetween(logDatesDesc[0], today) > interval) return 0;
    let streak = 1;
    for (let i = 0; i + 1 < logDatesDesc.length; i++) {
        if (daysBetween(logDatesDesc[i + 1], logDatesDesc[i]) <= interval) streak++;
        else break;
    }
    return streak;
}

export async function queryHabitStats(item: Item, now: string = localDateTime()): Promise<HabitStat[]> {
    const rows = item.tableRows.toPlain(HABIT_COLUMNS);
    const today = now.split("T")[0];

    const statsSql = "SELECT h.id AS id, h.name AS name, h.interval_days AS interval_days, "
        + "COUNT(l.id) AS total, IFNULL(MAX(l.date), '') AS last_date, "
        + "SUM(CASE WHEN l.date = date($now) THEN 1 ELSE 0 END) AS done_today "
        + "FROM habits h LEFT JOIN habits l ON l.kind = 'log' AND l.habit_id = h.id "
        + "WHERE h.kind = 'habit' "
        + "GROUP BY h.id ORDER BY h.rowid";
    const logsSql = "SELECT habit_id, date FROM habits WHERE kind = 'log' GROUP BY habit_id, date ORDER BY date DESC";

    const [stats, logs] = await Promise.all([
        runTableSelect(HABIT_TABLE_DDL, HABIT_COLUMNS, rows, statsSql, { now }),
        runTableSelect(HABIT_TABLE_DDL, HABIT_COLUMNS, rows, logsSql),
    ]);

    const logsByHabit = new Map<string, string[]>();
    for (const log of logs) {
        const habitId = String(log.habit_id ?? "");
        const list = logsByHabit.get(habitId) ?? [];
        list.push(String(log.date ?? ""));
        logsByHabit.set(habitId, list);
    }

    return stats.map((row) => {
        const id = String(row.id ?? "");
        const intervalDays = Math.max(1, Number(row.interval_days) || 1);
        const logDates = logsByHabit.get(id) ?? [];
        return {
            id,
            name: String(row.name ?? ""),
            intervalDays,
            total: Number(row.total ?? 0),
            doneToday: Number(row.done_today ?? 0) > 0,
            lastDate: String(row.last_date ?? ""),
            streak: computeStreak(logDates, intervalDays, today),
            logDates,
        };
    });
}

/** The last `count` calendar dates ending today, oldest first ('YYYY-MM-DD'). */
export function recentDates(count: number, today: string = localDate()): string[] {
    const dates: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        dates.push(addDays(today, -i));
    }
    return dates;
}
