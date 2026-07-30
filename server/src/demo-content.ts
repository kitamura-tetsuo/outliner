import * as Y from "yjs";
import { Item, Items, Project } from "./schema/app-schema.js";

// The public demo project is the living showcase of the product: every
// end-user feature should be demonstrable on one of the pages below.
// When you implement a new end-user feature, extend this template (add a
// line to an existing page, or add a new feature page plus a landing-page
// tour link) so the demo keeps covering the full feature set.
// See docs/demo-project.md for the full policy.

// Bump this whenever the demo template below changes so that already-seeded
// demo documents are re-seeded on the next /api/seed-demo call.
export const DEMO_TEMPLATE_VERSION = 29;

// Must match the demo room id (`projects/demo`) so that internal links
// rendered from `project.title` resolve to /demo/<page> URLs.
export const DEMO_PROJECT_TITLE = "demo";

export const DEMO_LANDING_PAGE_TITLE = "Welcome";

// A structured demo item, used for pages that need to seed more than plain
// text: live components (table/chart), aliases, votes, comments, attachments.
// This is the richer alternative to the `lines` form below and lets the demo
// double as a deterministic verification surface for coding agents: every
// non-text feature is seeded with concrete, reproducible data.
export interface DemoItem {
    // The item's plain text. Optional for component/alias items.
    text?: string;
    // Render this item as a live component instead of plain text.
    componentType?: "yjstable" | "calendar";
    // For "yjstable" components: id of the demo table (see demoTables below)
    // this item embeds.
    yjsTableId?: string;
    // For "calendar" components: id of the demo calendar (see demoCalendars
    // below) this item embeds. A calendar has no subdoc of its own, so unlike
    // a table there is no separate room to seed — registerDemoCalendars
    // writes it straight into the project doc's `calendars` map.
    calendarId?: string;
    // Seed votes from these voter ids.
    votes?: string[];
    // Seed a comment thread.
    comments?: { author: string; text: string; }[];
    // Seed attachment urls (e.g. data: URIs so they render offline).
    attachments?: string[];
    // Label this item so an alias elsewhere on the same page can target it.
    ref?: string;
    // Make this item an alias mirroring the item declared with `ref: <aliasTo>`.
    aliasTo?: string;
    // Calendar time model (#4341): a floating date (`YYYY-MM-DD`) when
    // `allDay` is true, an ISO instant otherwise.
    start?: string;
    allDay?: boolean;
    // ISO 8601 duration (`Item.duration`'s own format), e.g. "PT30M".
    duration?: string;
    // Deadline, independent of `start`/`duration` (#4341).
    due?: string;
    // Structured tags (#4342), grouped into calendar lanes by #4348.
    tags?: string[];
    // Nested child items.
    children?: DemoItem[];
}

export interface DemoPageTemplate {
    title: string;
    // Item text lines. Two leading spaces per nesting level.
    // Use this for text-only pages.
    lines?: string[];
    // Structured items. Use this when a page seeds non-text content
    // (components, aliases, votes, comments, attachments).
    items?: DemoItem[];
}

// A small, self-contained SVG image encoded as a data URI so the seeded
// attachment renders without any network access (handy for verification).
const DEMO_ATTACHMENT_IMAGE =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27100%27%20height%3D%27100%27%3E%3Crect%20width%3D%27100%27%20height%3D%27100%27%20fill%3D%27%23e2e8f0%27%20rx%3D%278%27%2F%3E%3Ccircle%20cx%3D%2750%27%20cy%3D%2740%27%20r%3D%2715%27%20fill%3D%27%2394a3b8%27%2F%3E%3Cpath%20d%3D%27M20%2080%20L40%2055%20L60%2070%20L80%2045%20L80%2080%20Z%27%20fill%3D%27%2364748b%27%2F%3E%3C%2Fsvg%3E";

// ---------------------------------------------------------------------------
// Demo database tables (the consolidated Yjs + PGlite table feature).
//
// One table = one Y.Doc subdoc. The project doc holds a registry entry per
// table (display name + subdoc reference); the table's own content (schema
// text, UI definition, data records) lives in its subdoc, which syncs through
// the room `projects/demo/tables/<tableId>` and is seeded by the demo API.
// ---------------------------------------------------------------------------

export interface DemoTableTemplate {
    rules?: any[];
    // Fixed id (also the room segment): [A-Za-z0-9_-] only.
    tableId: string;
    name: string;
    // Identifier of the CREATE TABLE statement: the only name queries use, and
    // unique across the project so a query can join any two demo tables.
    sqlName: string;
    schemaSql: string;
    query: string;
    // Cell component type per column (UI Definition).
    components: Record<string, string | { type: string; label?: string }>;
    // Seed records: id -> column values.
    records: { id: string; values: Record<string, string | number | boolean | null>; }[];
}

// Local date helpers so the seeded tasks/habits stay relative to the seeding
// moment (the demo is re-seeded at least daily, so drift stays small).
function demoDate(daysFromToday: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Recurring-task helpers. The occurrences table is keyed by UTC dates because the
// schedule rules that generate its rows run in the UTC timezone, so seeded and
// generated occurrence ids must agree regardless of the server's local zone.
function demoUtcDate(daysFromToday: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
}

// Monday (UTC) of the week `weeksAgo` weeks before the current one.
function demoUtcWeekStart(weeksAgo: number): string {
    const d = new Date();
    const daysSinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday - weeksAgo * 7);
    return d.toISOString().slice(0, 10);
}

export const DEMO_SALES_TABLE_ID = "demo-table-sales";
export const DEMO_TASKS_TABLE_ID = "demo-table-tasks";
export const DEMO_HABITS_TABLE_ID = "demo-table-habits";
export const DEMO_ROUTINE_TEMPLATES_TABLE_ID = "demo-table-routine-templates";
export const DEMO_ROUTINE_OCCURRENCES_TABLE_ID = "demo-table-routine-occurrences";
export const DEMO_SALES_TARGETS_TABLE_ID = "demo-table-sales-targets";

// The recurring tasks demonstrated on the "Recurring Tasks" page. Each entry
// becomes a row of the routine templates table; the seeded schedule rules read
// that table and turn its rows into dated occurrences in the occurrences table.
export const demoRoutineTemplates: { taskKey: string; title: string; cadence: "daily" | "weekly"; }[] = [
    { taskKey: "daily-standup", title: "Write the standup note", cadence: "daily" },
    { taskKey: "daily-inbox", title: "Empty the inbox", cadence: "daily" },
    { taskKey: "weekly-review", title: "Weekly review", cadence: "weekly" },
    { taskKey: "weekly-report", title: "Send the weekly report", cadence: "weekly" },
];

export const demoTables: DemoTableTemplate[] = [
    {
        tableId: DEMO_SALES_TABLE_ID,
        name: "Sales",
        sqlName: "sales",
        schemaSql: "CREATE TABLE sales (\n"
            + "  id TEXT PRIMARY KEY,\n"
            + "  month TEXT NOT NULL,\n"
            + "  revenue INTEGER\n"
            + ")",
        query: "SELECT id, month, revenue FROM sales ORDER BY id",
        components: { month: "text", revenue: "number" },
        records: [
            { id: "demo-sales-1", values: { month: "Jan", revenue: 120 } },
            { id: "demo-sales-2", values: { month: "Feb", revenue: 180 } },
            { id: "demo-sales-3", values: { month: "Mar", revenue: 150 } },
            { id: "demo-sales-4", values: { month: "Apr", revenue: 210 } },
        ],
    },
    {
        // Cross-table aggregation: this table only stores the monthly targets,
        // but its query joins `sales` and reports both series side by side.
        // Postgres resolves `sales` because every table of a project shares one
        // schema; the engine materializes it even when no view has opened it.
        tableId: DEMO_SALES_TARGETS_TABLE_ID,
        name: "Sales vs Target",
        sqlName: "sales_targets",
        schemaSql: "CREATE TABLE sales_targets (\n"
            + "  id TEXT PRIMARY KEY,\n"
            + "  month TEXT NOT NULL,\n"
            + "  target INTEGER\n"
            + ")",
        query: "SELECT t.month, SUM(s.revenue) AS revenue, MAX(t.target) AS target, "
            + "SUM(s.revenue) - MAX(t.target) AS diff "
            + "FROM sales_targets t JOIN sales s ON s.month = t.month "
            + "GROUP BY t.month ORDER BY MIN(s.id)",
        components: { month: "text", target: "number" },
        records: [
            { id: "demo-target-1", values: { month: "Jan", target: 150 } },
            { id: "demo-target-2", values: { month: "Feb", target: 150 } },
            { id: "demo-target-3", values: { month: "Mar", target: 200 } },
            { id: "demo-target-4", values: { month: "Apr", target: 200 } },
        ],
    },
    {
        tableId: DEMO_TASKS_TABLE_ID,
        name: "Tasks",
        sqlName: "tasks",
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
            title: "text",
            status: "select",
            priority: "select",
            due_date: { type: "date", label: "Due date" },
            repeat_days: "number",
        },
        records: [
            {
                id: "demo-task-overdue",
                values: {
                    title: "Reply to the design review",
                    status: "open",
                    priority: "high",
                    due_date: demoDate(-1),
                    repeat_days: null,
                    created_at: `${demoDate(-3)}T09:00:00`,
                    completed_at: null,
                },
            },
            {
                id: "demo-task-today",
                values: {
                    title: "Prepare tomorrow's standup notes",
                    status: "open",
                    priority: "medium",
                    due_date: demoDate(0),
                    repeat_days: null,
                    created_at: `${demoDate(-1)}T18:30:00`,
                    completed_at: null,
                },
            },
            {
                id: "demo-task-recurring",
                values: {
                    title: "Water the plants",
                    status: "open",
                    priority: "low",
                    due_date: demoDate(1),
                    repeat_days: 3,
                    created_at: `${demoDate(-2)}T08:00:00`,
                    completed_at: null,
                },
            },
            {
                id: "demo-task-upcoming",
                values: {
                    title: "Book dentist appointment",
                    status: "open",
                    priority: "medium",
                    due_date: demoDate(4),
                    repeat_days: null,
                    created_at: `${demoDate(-1)}T12:00:00`,
                    completed_at: null,
                },
            },
            {
                id: "demo-task-done",
                values: {
                    title: "Send the weekly report",
                    status: "done",
                    priority: "high",
                    due_date: demoDate(-1),
                    repeat_days: null,
                    created_at: `${demoDate(-2)}T10:00:00`,
                    completed_at: `${demoDate(-1)}T16:45:00`,
                },
            },
        ],
    },
    {
        tableId: DEMO_HABITS_TABLE_ID,
        name: "Habits",
        sqlName: "habits",
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
            kind: "select",
            name: "text",
            interval_days: "number",
            log_date: "date",
        },
        records: [
            {
                id: "demo-habit-stretch",
                values: {
                    kind: "habit",
                    habit_id: null,
                    name: "Morning stretch",
                    interval_days: 1,
                    log_date: null,
                    created_at: `${demoDate(-6)}T07:00:00`,
                },
            },
            {
                id: "demo-habit-review",
                values: {
                    kind: "habit",
                    habit_id: null,
                    name: "Weekly review",
                    interval_days: 7,
                    log_date: null,
                    created_at: `${demoDate(-6)}T07:00:00`,
                },
            },
            // A three-day streak ending yesterday: log today to extend it.
            ...[-3, -2, -1].map((offset) => ({
                id: `demo-habit-stretch-log${offset}`,
                values: {
                    kind: "log",
                    habit_id: "demo-habit-stretch",
                    name: null,
                    interval_days: null,
                    log_date: demoDate(offset),
                    created_at: `${demoDate(offset)}T07:10:00`,
                },
            })),
            {
                id: "demo-habit-review-log",
                values: {
                    kind: "log",
                    habit_id: "demo-habit-review",
                    name: null,
                    interval_days: null,
                    log_date: demoDate(-5),
                    created_at: `${demoDate(-5)}T19:00:00`,
                },
            },
        ],
    },
    {
        // The definitions of the recurring tasks: what repeats, and how often.
        // Occurrences live in their own table (see below) so that a definition
        // is edited in one place while its generated history grows separately.
        // `task_key` is the stable identity of a recurring task: its
        // occurrences share it whatever their title says.
        tableId: DEMO_ROUTINE_TEMPLATES_TABLE_ID,
        name: "Routine Templates",
        sqlName: "routine_templates",
        schemaSql: "CREATE TABLE routine_templates (\n"
            + "  id TEXT PRIMARY KEY,\n"
            + "  task_key TEXT NOT NULL,\n"
            + "  title TEXT NOT NULL,\n"
            + "  cadence TEXT CHECK (cadence IN ('daily', 'weekly'))\n"
            + ")",
        query: "SELECT id, task_key, title, cadence FROM routine_templates ORDER BY cadence, task_key",
        components: {
            task_key: "text",
            title: "text",
            cadence: "select",
        },
        records: demoRoutineTemplates.map((template) => ({
            id: `routine-template-${template.taskKey}`,
            values: {
                task_key: template.taskKey,
                title: template.title,
                cadence: template.cadence,
            },
        })),
    },
    {
        // The dated occurrences generated from the templates table. The id of
        // an occurrence is `<task_key>-<YYYY-MM-DD>`, which makes the
        // generating INSERT idempotent.
        tableId: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
        name: "Routine Occurrences",
        sqlName: "routine_occurrences",
        schemaSql: "CREATE TABLE routine_occurrences (\n"
            + "  id TEXT PRIMARY KEY,\n"
            + "  task_key TEXT NOT NULL,\n"
            + "  title TEXT NOT NULL,\n"
            + "  cadence TEXT CHECK (cadence IN ('daily', 'weekly')),\n"
            + "  occurrence_date DATE,\n"
            + "  done BOOLEAN\n"
            + ")",
        // Display only the newest occurrence of each recurring task: a row is
        // shown when no later occurrence with the same task_key exists. The
        // correlated NOT EXISTS keeps the result editable (DISTINCT ON and
        // aggregates would make the grid read-only), so `done` stays a
        // writable checkbox.
        query: "SELECT id, task_key, title, cadence, occurrence_date, done\n"
            + "FROM routine_occurrences r\n"
            + "WHERE NOT EXISTS (\n"
            + "    SELECT 1 FROM routine_occurrences later\n"
            + "    WHERE later.task_key = r.task_key\n"
            + "      AND later.occurrence_date > r.occurrence_date\n"
            + "  )\n"
            + "ORDER BY cadence, task_key",
        components: {
            task_key: "text",
            title: "text",
            cadence: "select",
            occurrence_date: "date",
            done: "checkbox",
        },
        // Two occurrences per task so the "latest occurrence only" view is
        // visible right after seeding: the older one is hidden by the query,
        // the newest one is the row shown in the grid.
        records: demoRoutineTemplates.flatMap((template) => {
            const dates = template.cadence === "daily"
                ? [demoUtcDate(-1), demoUtcDate(0)]
                : [demoUtcWeekStart(1), demoUtcWeekStart(0)];
            return dates.map((date, index) => ({
                id: `${template.taskKey}-${date}`,
                values: {
                    task_key: template.taskKey,
                    title: template.title,
                    cadence: template.cadence,
                    occurrence_date: date,
                    // The superseded occurrence is left completed, the current
                    // one is still open.
                    done: index === 0,
                },
            }));
        }),
    },
];

// ---------------------------------------------------------------------------
// Demo schedule rules (recurring SQL execution against a table).
//
// A rule runs its SQL at every occurrence of its RRULE and writes the returned
// rows back into the target table's Data Storage. The demo seeds two rules
// that append today's / this week's occurrence of every recurring task.
// ---------------------------------------------------------------------------

export interface DemoScheduleRuleTemplate {
    // Fixed id so a reseed replaces the rule instead of adding a copy.
    ruleId: string;
    targetTableId: string;
    sql: string;
    rrule: string;
    // Local wall-clock start of the recurrence (in `timezone`).
    dtstart: string;
    timezone: string;
    catchUp: boolean;
}

export const DEMO_DAILY_RULE_ID = "demo-rule-daily-routines";
export const DEMO_WEEKLY_RULE_ID = "demo-rule-weekly-routines";

/**
 * The SQL of a routine rule: one occurrence row per recurring task of the
 * given cadence, for the occurrence the job is running.
 *
 * - the rule targets the occurrences table but reads its definitions from the
 *   templates table: a rule can query any table of its project, not only the
 *   one it writes to.
 * - `current_setting('job.occurrence')` (never `now()`) is the scheduled time,
 *   so a catch-up run produces the row it would have produced on time.
 * - the id is derived from the task's `task_key` and that date, so re-running
 *   the same occurrence is a no-op (`ON CONFLICT DO NOTHING`) and a completed
 *   checkbox is never reset.
 * - the outer SELECT renders the date as text: values written back into Yjs
 *   must be JSON primitives, not Date objects.
 */
export function routineOccurrenceSql(cadence: "daily" | "weekly"): string {
    return `WITH inserted AS (
    INSERT INTO routine_occurrences (id, task_key, title, cadence, occurrence_date, done)
    SELECT
        t.task_key || '-' || to_char(current_setting('job.occurrence')::timestamptz, 'YYYY-MM-DD'),
        t.task_key,
        t.title,
        t.cadence,
        (current_setting('job.occurrence')::timestamptz)::date,
        false
    FROM routine_templates t
    WHERE t.cadence = '${cadence}'
    ON CONFLICT (id) DO NOTHING
    RETURNING *
)
SELECT
    id,
    task_key,
    title,
    cadence,
    to_char(occurrence_date, 'YYYY-MM-DD') AS occurrence_date,
    done
FROM inserted`;
}

/**
 * The demo's schedule rules. Built on demand because both dtstarts are
 * relative to the seeding moment: the daily rule starts at today's midnight
 * and the weekly one at this week's Monday, so the first occurrence is due
 * immediately and the rule visibly runs shortly after the demo is seeded.
 */
export function buildDemoScheduleRules(): DemoScheduleRuleTemplate[] {
    return [
        {
            ruleId: DEMO_DAILY_RULE_ID,
            targetTableId: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
            sql: routineOccurrenceSql("daily"),
            rrule: "RRULE:FREQ=DAILY",
            dtstart: `${demoUtcDate(0)}T00:00:00`,
            timezone: "UTC",
            catchUp: true,
        },
        {
            ruleId: DEMO_WEEKLY_RULE_ID,
            targetTableId: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
            sql: routineOccurrenceSql("weekly"),
            rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
            dtstart: `${demoUtcWeekStart(0)}T00:00:00`,
            timezone: "UTC",
            catchUp: true,
        },
    ];
}

/** Write the demo's schedule rules into the project doc's `schedules` map. */
export function registerDemoScheduleRules(projectDoc: Y.Doc): void {
    const schedules = projectDoc.getMap<Y.Map<string | boolean>>("schedules");
    for (const rule of buildDemoScheduleRules()) {
        const ruleMap = new Y.Map<string | boolean>();
        schedules.set(rule.ruleId, ruleMap);
        ruleMap.set("targetTableId", rule.targetTableId);
        ruleMap.set("sql", rule.sql);
        ruleMap.set("rrule", rule.rrule);
        ruleMap.set("dtstart", rule.dtstart);
        ruleMap.set("timezone", rule.timezone);
        ruleMap.set("enabled", true);
        ruleMap.set("catchUp", rule.catchUp);
    }
}

// ---------------------------------------------------------------------------
// Demo calendars (the calendars registry: query + role assignment, no data of
// its own — docs/crdt-sql-architecture.md §6.6). Unlike a table, a calendar
// has no subdoc, so it is written straight into the project doc's
// `calendars` map, in the same id -> Y.Map shape `schedules` already uses.
// ---------------------------------------------------------------------------

export interface DemoCalendarTemplate {
    // Fixed id so a reseed replaces the calendar instead of adding a copy.
    calendarId: string;
    name: string;
    query: string;
    // Defaults to "week" (day/multi-day/week/month grid views, #4347).
    // "gantt" selects the Gantt view (#4350) instead.
    viewType?: string;
    roleTitle?: string;
    roleStart?: string;
    roleAllDay?: string;
    roleDuration?: string;
    roleDue?: string;
    groupAxes?: string[];
}

export const DEMO_CALENDAR_ID = "demo-calendar-tasks";
export const DEMO_GANTT_CALENDAR_ID = "demo-calendar-gantt";

export const demoCalendars: DemoCalendarTemplate[] = [
    {
        calendarId: DEMO_CALENDAR_ID,
        name: "Tasks Calendar",
        // source_kind/source_id make every row addressable for a write
        // (docs/crdt-sql-architecture.md §4.4, §6.3), so this calendar is not
        // read-only the moment a grid view is built on top of it. The value
        // must be the reserved relation name (`ITEMS_RELATION_NAME`,
        // `outline_items`) — that is what a drag/drop write resolves against
        // (tableEngine.ts's `resolveRelationInternal`), not a descriptive label.
        query: "SELECT id, text AS title, due, all_day, start_on, start_at, duration, tags, "
            + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        roleTitle: "title",
        roleStart: "start_at",
        roleAllDay: "all_day",
        roleDuration: "duration",
        roleDue: "due",
        groupAxes: ["tags"],
    },
    {
        calendarId: DEMO_GANTT_CALENDAR_ID,
        name: "Project Plan (Gantt)",
        // `parent_id` drives Gantt's hierarchy/roll-up (#4350, §6.7) — it is
        // the outline's own parent, projected for free by `outline_items`.
        // `source_kind` must be the reserved relation name itself
        // (`ITEMS_RELATION_NAME`, not an arbitrary label) or a write can
        // never resolve back to a provider (`resolveRelation` matches on the
        // exact name).
        query: "SELECT id, text AS title, due, all_day, start_on, start_at, duration, parent_id, "
            + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        viewType: "gantt",
        roleTitle: "title",
        roleStart: "start_at",
        roleAllDay: "all_day",
        roleDuration: "duration",
        roleDue: "due",
    },
];

/** Write the demo's calendars into the project doc's `calendars` map. */
export function registerDemoCalendars(projectDoc: Y.Doc): void {
    const calendars = projectDoc.getMap<Y.Map<unknown>>("calendars");
    for (const template of demoCalendars) {
        const calendarMap = new Y.Map<unknown>();
        calendars.set(template.calendarId, calendarMap);
        calendarMap.set("name", template.name);
        calendarMap.set("query", template.query);
        calendarMap.set("viewType", template.viewType ?? "week");
        if (template.roleTitle) calendarMap.set("roleTitle", template.roleTitle);
        if (template.roleStart) calendarMap.set("roleStart", template.roleStart);
        if (template.roleAllDay) calendarMap.set("roleAllDay", template.roleAllDay);
        if (template.roleDuration) calendarMap.set("roleDuration", template.roleDuration);
        if (template.roleDue) calendarMap.set("roleDue", template.roleDue);
        const groupAxes = new Y.Array<string>();
        if (template.groupAxes && template.groupAxes.length > 0) groupAxes.push(template.groupAxes);
        calendarMap.set("groupAxes", groupAxes);
    }
}

/**
 * Register every demo table in the project doc: a registry entry (display
 * name + subdoc reference) per table. The subdoc guid is deterministic so all
 * clients resolve the same table rooms.
 */
export function registerDemoTables(projectDoc: Y.Doc): void {
    const registry = projectDoc.getMap<Y.Map<unknown>>("yjsTables");
    for (const template of demoTables) {
        const entry = new Y.Map<unknown>();
        registry.set(template.tableId, entry);
        entry.set("name", template.name);
        entry.set("sqlName", template.sqlName);
        entry.set("doc", new Y.Doc({ guid: `demo--table--${template.tableId}`, autoLoad: true }));
    }
}

/**
 * Seed one table doc (the live document of `projects/demo/tables/<tableId>`)
 * with the template's three structures: schema text, UI definition and data
 * records (nested Y.Map per record).
 */
export function seedDemoTableDoc(doc: Y.Doc, template: DemoTableTemplate): void {
    const schema = doc.getText("schema");
    schema.delete(0, schema.length);
    schema.insert(0, template.schemaSql);

    const ui = doc.getMap<unknown>("ui");
    ui.set("query", template.query);
    const components = new Y.Map<Y.Map<unknown>>();
    ui.set("components", components);
    for (const [column, config] of Object.entries(template.components)) {
        const cfg = new Y.Map<unknown>();
        components.set(column, cfg);
        if (typeof config === "string") {
            cfg.set("type", config);
        } else {
            cfg.set("type", config.type);
            if (config.label) {
                cfg.set("label", config.label);
            }
        }
    }

    const data = doc.getMap<Y.Map<string | number | boolean | null>>("data");
    for (const key of Array.from(data.keys())) {
        data.delete(key);
    }
    for (const record of template.records) {
        const map = new Y.Map<string | number | boolean | null>();
        data.set(record.id, map);
        for (const [column, value] of Object.entries(record.values)) {
            map.set(column, value);
        }
        map.set("id", record.id);
    }
}

export const demoPages: DemoPageTemplate[] = [
    {
        title: DEMO_LANDING_PAGE_TITLE,
        lines: [
            "Welcome to the Outliner Demo!",
            "This is a public, collaborative demo project. Anyone can edit it, and the content resets every 24 hours.",
            'You can also reset the content right now with the "Reset demo content" button at the top of the demo project page.',
            "Each page of this project demonstrates a group of features. Follow the links below to take the tour.",
            "Feature tour:",
            "  [Formatting]: bold, italic, strike-through, code, and links.",
            "  [Outliner Basics]: items, indentation, and keyboard navigation.",
            "  [Undo and Redo]: one history shared by the outline and the database tables.",
            "  [Internal Links]: linking between pages, backlinks, and the graph view.",
            "  [Search and Commands]: full-text search and the inline command palette.",
            "  [Selection and Clipboard]: multi-item selection, box selection, copy and paste.",
            "  [Collaboration]: real-time editing with other users.",
            "  [Comments and Votes]: discussing and voting on items, with live seeded threads and votes.",
            "  [Publishing and Sharing]: read-only sharing, scheduled publishing, and snapshots.",
            "  [Advanced Features]: live database tables with charts, aliases, and attachments.",
            "  [Tasks and Habits]: task management and habit tracking built on database tables.",
            "  [Recurring Tasks]: daily and weekly tasks generated by recurring SQL execution.",
            "  [Calendars]: a query plus a role assignment over its result columns, no data of its own.",
            "  [Schedule Rules]: automate database operations",
            "Give it a try! Everything in this project is editable.",
        ],
    },
    {
        title: "Formatting",
        lines: [
            "This page demonstrates text formatting with Scrapbox-style syntax.",
            "Click an item to see its raw text with the control characters visible.",
            "Examples:",
            "  You can make text [[bold]] using double brackets.",
            "  You can make text [/ italic] using a slash bracket.",
            "  You can [-strike through] text using a dash bracket.",
            "  Inline `code` uses backticks.",
            "  Formats can be combined, like [[bold with [/ italic]]] inside.",
            "URLs become clickable links: https://github.com/yjs/yjs",
            "Try editing any line above to see the syntax behind it.",
            "  [Internal Links] feature.",
        ],
    },
    {
        title: "Outliner Basics",
        lines: [
            "Every line is an item in an outline tree.",
            "Keyboard operations:",
            "  Press Enter to create a new item.",
            "  Press Tab to indent an item (make it a child of the item above).",
            "  Press Shift+Tab to unindent an item.",
            "  Move between items with the arrow keys; the cursor keeps its horizontal position.",
            "A nested example:",
            "  Parent item",
            "    Child item",
            "      Grandchild item",
            "    Another child",
            "Try reorganizing the tree above with Tab and Shift+Tab.",
        ],
    },
    {
        title: "Undo and Redo",
        lines: [
            "Undo and redo run off a single history for the whole project.",
            "Shortcuts:",
            "  Ctrl+Z undoes the most recent change.",
            "  Ctrl+Shift+Z or Ctrl+Y redoes it.",
            "The outline and every database table each keep their own change history internally, "
            + "but you never have to think about which one you are in.",
            "One stack, in order:",
            "  Edit a line here, then add a row to a table on the [Advanced Features] page.",
            "  Press Ctrl+Z twice: the table row goes first, then the edit on this page.",
            "  Changes made by other people editing the demo at the same time are never undone by you.",
            "Try it: type something on this line, then undo it.",
        ],
    },
    {
        title: "Internal Links",
        lines: [
            "Link to another page by writing its name in brackets, like [Formatting].",
            "Links to pages that do not exist yet look different, and the page is only created once you edit it.",
            "You can also link to a page in another project with [/project/page] syntax.",
            "Backlinks: pages that link to the current page are listed in the backlink panel at the bottom.",
            "The graph view visualizes how the pages of a project are connected.",
            "More links to explore: [Outliner Basics], [Collaboration]",
        ],
    },
    {
        title: "Schedule Rules",
        items: [
            {
                text: "Pages can be scheduled to be published at a later time.",
            },
            {
                text:
                    "Tables can run SQL on a recurrence: see [Recurring Tasks] for two live rules that add the tasks of the day and of the week.",
            },
            {
                text:
                    "Open the Schedule tab of a table (for example on the [Tasks and Habits] page) to create a rule of your own.",
            },
        ],
    },
    {
        title: "Search and Commands",
        lines: [
            "Use the Search button at the top of a page to search across the whole project.",
            "Recent searches are remembered for quick access.",
            "The inline command palette opens when you type / inside an item.",
            'Replace only rewrites item text; page titles stay untouched unless you tick "Include page titles".',
            "With that option on, renaming a page is confirmed first, and the open page follows its new name.",
            "Breadcrumbs at the top of each page let you jump back to the project or home.",
        ],
    },
    {
        title: "Selection and Clipboard",
        lines: [
            "Select text with the mouse or with Shift+Arrow keys.",
            "Selections can span multiple items: keep extending past the end of an item.",
            "Useful shortcuts:",
            "  Ctrl+L selects the entire line under the cursor.",
            "  Shift+Alt+Right expands the selection to the end of the line; Shift+Alt+Left shrinks it.",
            "  Alt+Shift+Arrow keys (or Alt+Shift+mouse drag) create a box selection across items.",
            "With an active selection you can:",
            "  Copy and paste it, even when it spans multiple items.",
            "  Delete the whole selection in one step.",
            "  Drag and drop the selected text to move it.",
            "  Apply formatting such as bold or italic to the selected range.",
            "Try selecting across the items above and copying them.",
        ],
    },
    {
        title: "Collaboration",
        lines: [
            "This demo is a shared, real-time collaborative space.",
            "Open this page in two browser windows and edit it in one of them.",
            "Changes appear in the other window instantly.",
            "While others type, you can see their cursors and selections.",
            "Editing in this demo is anonymous, so feel free to experiment.",
        ],
    },
    {
        title: "Comments and Votes",
        items: [
            { text: "Items can carry comment threads and votes." },
            {
                text: "Comments:",
                children: [
                    { text: "Open an item's comment thread to discuss it with others." },
                    { text: "Items show a badge with the number of comments." },
                ],
            },
            {
                text: "This item already has a seeded comment thread — open it to read the messages.",
                comments: [
                    { author: "alice", text: "This is a seeded demo comment." },
                    { author: "bob", text: "Comment threads sync in real time across everyone viewing the demo." },
                ],
            },
            {
                text: "Votes:",
                children: [
                    { text: "Vote for an item to show agreement." },
                ],
            },
            {
                text: "This item is already popular (3 votes). Click the vote button to add yours.",
                votes: ["Alice", "Bob", "Carol"],
            },
            { text: "Try commenting on or voting for the items above!" },
        ],
    },
    {
        title: "Publishing and Sharing",
        lines: [
            "Pages and projects can be shared beyond the people editing them.",
            "Sharing: generate a read-only token to share a project without giving edit access.",
            "  Tokens are generated in the Project Settings (gear icon in the top right).",
            "Scheduled publishing: schedule a page to be published automatically at a later time.",
            "  The [/demo/Publishing and Sharing/schedule] page lists upcoming publishing tasks and lets you edit or cancel them.",
            "Snapshots: the snapshot diff viewer shows how a page changed compared to earlier versions.",
            "  View this page's [/demo/Publishing and Sharing/diff] to see snapshots.",
        ],
    },
    {
        title: "Advanced Features",
        items: [
            {
                text:
                    "A quick tour of the more advanced capabilities. The items below are live components, not just descriptions.",
            },
            {
                text: "Database tables: this item embeds a live table (Yjs data, SQL queries via PGlite). "
                    + "Toggle the Chart view to render the query result as a bar chart.",
                componentType: "yjstable",
                yjsTableId: DEMO_SALES_TABLE_ID,
            },
            {
                text: "Aggregation across tables: this table stores only the monthly targets, "
                    + "but its query joins the Sales table above and compares both series. "
                    + "Every table of a project can be referenced by the name its schema declares.",
                componentType: "yjstable",
                yjsTableId: DEMO_SALES_TARGETS_TABLE_ID,
            },
            { text: "Aliases: an item can mirror another item and stay in sync with the original." },
            {
                text: "Original item: edit me and watch the alias below update.",
                ref: "alias-source",
            },
            {
                text: "Alias (mirrors the original item above):",
                aliasTo: "alias-source",
            },
            {
                text:
                    "Attachments: drag and drop images or files onto an item to attach them. This item has a seeded image attachment.",
                attachments: [DEMO_ATTACHMENT_IMAGE],
            },
            { text: "Schedule: the Schedule view shows date-tagged items as a timeline." },
            { text: "[[2026-07-12]] Date tagged item for the schedule view" },
        ],
    },
    {
        title: "Tasks and Habits",
        items: [
            {
                text:
                    "Inline checkboxes can also be used for lightweight, nested task tracking directly in the outline:",
                children: [
                    { text: "[ ] This is a pending task" },
                    { text: "[x] This is a completed task" },
                ],
            },
            {
                text:
                    "Practical task management and habit tracking, built as presets of the database table feature. The items below are live tables.",
            },
            {
                text:
                    "Task manager: add tasks with due dates, priorities and repeat intervals. Status and priority options come from the schema's CHECK constraints.",
                componentType: "yjstable",
                yjsTableId: DEMO_TASKS_TABLE_ID,
            },
            {
                text:
                    "Habit tracker: one table holds habit definitions and daily completion logs. Add a log row for today to extend a streak.",
                componentType: "yjstable",
                yjsTableId: DEMO_HABITS_TABLE_ID,
            },
            {
                text:
                    "Every view is computed with real SQL (Postgres via PGlite) over the collaborative table records, and the schema/query/grid are all editable.",
            },
        ],
    },
    {
        title: "Recurring Tasks",
        items: [
            {
                text:
                    "Daily and weekly tasks, generated by schedule rules: the SQL of a rule runs again at every occurrence of its recurrence and appends the task of that day or week.",
            },
            {
                text: "How it works:",
                children: [
                    {
                        text:
                            "Two tables: the templates below define what repeats, the occurrences table collects the dated tasks generated from them.",
                    },
                    {
                        text:
                            "Two schedule rules write into the occurrences table: one runs every day at 00:00, the other every Monday at 00:00 (UTC).",
                    },
                    {
                        text:
                            "Each run reads the templates table and inserts one occurrence per definition of its cadence: a rule can query any table of the project, not only the one it writes to.",
                    },
                    {
                        text:
                            "A recurring task is identified by its task_key, not by its title: renaming a task keeps its history together.",
                    },
                    {
                        text:
                            "The id of an occurrence is task_key + occurrence date, so re-running the same occurrence changes nothing and never clears a completed checkbox.",
                    },
                    {
                        text:
                            "The occurrences query shows only the newest occurrence of each task; the earlier ones stay in the table as history.",
                    },
                ],
            },
            {
                text:
                    "The recurring task definitions. Add a row here and the next run of the matching rule starts generating its occurrences.",
                componentType: "yjstable",
                yjsTableId: DEMO_ROUTINE_TEMPLATES_TABLE_ID,
            },
            {
                text:
                    "Tick a checkbox to complete today's (or this week's) task. Tomorrow's run adds a fresh, unchecked occurrence that replaces it in this view.",
                componentType: "yjstable",
                yjsTableId: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
            },
            {
                text:
                    "Open the Schedule tab of the occurrences table to read both rules, edit their SQL or recurrence, or disable them. See also [Schedule Rules].",
            },
        ],
    },
    {
        title: "Calendars",
        items: [
            {
                text:
                    "A calendar is a query plus a role assignment over its result columns — which column is the title, the start, the all-day flag, the duration, and which columns are grouping axes. It has no data of its own.",
            },
            {
                text: "How it works:",
                children: [
                    {
                        text:
                            "Candidates are the columns the query actually returns, in result order — never a fixed schema. Changing the query never discards an existing role assignment for a column that is temporarily missing from the new result.",
                    },
                    {
                        text:
                            'A query must SELECT both "source_kind" and "source_id" for its rows to be writable; otherwise the calendar is read-only and says so.',
                    },
                    {
                        text:
                            "Reassigning a role, editing the query, or changing group axes are all undoable, on the same shared history as everything else (see [Undo and Redo]).",
                    },
                    {
                        text:
                            "Drag an entry to reschedule it, drag its bottom edge to resize its duration, or move it with the arrow keys — all three go through the same write path, the same writability check, and the same optimistic-placement model. Switch between Day / Multi-day / Week / Month with the toolbar select; Gantt is a later feature.",
                    },
                    {
                        text:
                            "Grouping by \"tags\" splits the week/day view into swimlanes, one per tag, and colour-codes entries in month view. Drag an entry's small handle onto another lane to replace its tag set; hold Ctrl (Cmd on macOS) while dropping to add the lane's tag instead of replacing.",
                    },
                    {
                        text:
                            '"New entry" always asks which page to create it under — there is no implicit inbox — and offers previously used destinations first. Deleting an entry always prompts between removing it and just clearing its date, so a keystroke never silently discards writing.',
                    },
                ],
            },
            {
                text:
                    "A calendar over this project's outline items, already assigned title/start/all-day/duration/due roles and grouped by tags. Try dragging the entries below, changing the query, or reassigning a role.",
                componentType: "calendar",
                calendarId: DEMO_CALENDAR_ID,
            },
            {
                text: "Scheduled today",
                start: `${demoUtcDate(0)}T09:00:00.000Z`,
                allDay: false,
                duration: "PT30M",
                tags: ["work"],
            },
            {
                text: "Scheduled tomorrow, longer block",
                start: `${demoUtcDate(1)}T13:00:00.000Z`,
                allDay: false,
                duration: "PT2H",
                tags: ["urgent"],
            },
            {
                text: "All-day conference",
                start: demoUtcDate(2),
                allDay: true,
                duration: "P2D",
                tags: ["work", "travel"],
            },
            {
                text: "Deadline only, no start — renders as a marker, not a block",
                due: `${demoUtcDate(3)}T17:00:00.000Z`,
            },
            {
                text:
                    "Gantt (#4350): one row per entry, nested by this outline's own hierarchy — no separate Gantt hierarchy to define. A parent with dated children shows a rolled-up bar spanning their earliest start to latest end instead of its own dates; dragging it shifts the whole subtree as one undo entry. Axis granularity (day/week/month/quarter) is a view setting.",
                children: [
                    {
                        text:
                            "A parent's own due (if any) still renders as a marker alongside its rolled-up bar — the case that makes the roll-up useful: a deadline the children's own schedule may be overrunning.",
                    },
                ],
            },
            {
                text: "Project plan",
                componentType: "calendar",
                calendarId: DEMO_GANTT_CALENDAR_ID,
            },
            {
                text: "Launch plan",
                due: `${demoUtcDate(20)}T17:00:00.000Z`,
                children: [
                    {
                        text: "Design",
                        start: demoUtcDate(0),
                        allDay: true,
                        duration: "P3D",
                    },
                    {
                        text: "Build",
                        start: demoUtcDate(3),
                        allDay: true,
                        duration: "P5D",
                        children: [
                            {
                                text: "Backend",
                                start: demoUtcDate(3),
                                allDay: true,
                                duration: "P4D",
                            },
                            {
                                text: "Frontend",
                                start: demoUtcDate(5),
                                allDay: true,
                                duration: "P3D",
                            },
                        ],
                    },
                    {
                        text: "Test",
                        start: demoUtcDate(8),
                        allDay: true,
                        duration: "P2D",
                    },
                ],
            },
        ],
    },
];

// Populate an existing, empty project with the demo template pages.
// The reset endpoint calls this against the live shared document so that all
// writes (including YTree re-initialization) are sequential operations of the
// server client. Applying a fresh document's update instead would make the
// YTree "root" marker a concurrent write, which can lose against tombstoned
// entries from earlier resets and corrupt the tree.
export function populateDemoProject(project: Project, author = "seed-server"): void {
    // Aliases reference a target item by its `ref` label. Build every page
    // first (recording refs and pending aliases), then resolve the alias
    // targets so that aliases can point to an item declared anywhere.
    const refs = new Map<string, Item>();
    const pendingAliases: { item: Item; aliasTo: string; }[] = [];

    // Register the demo tables (registry entries + subdoc references) in the
    // project doc. The table contents live in their own rooms and are seeded
    // separately by the demo API.
    registerDemoTables(project.ydoc);

    // Recurring SQL execution against the routine occurrences table (see the
    // "Recurring Tasks" page).
    registerDemoScheduleRules(project.ydoc);

    // The calendars registry (query + role assignment, no subdoc of its own;
    // see the "Calendars" page).
    registerDemoCalendars(project.ydoc);

    for (const pageTemplate of demoPages) {
        const page = project.addPage(pageTemplate.title, author);
        page.templatePageId = pageTemplate.title.trim().toLowerCase();
        if (pageTemplate.items) {
            addDemoItems(page.items, pageTemplate.items, author, refs, pendingAliases);
        } else if (pageTemplate.lines) {
            addLinesToPage(page, pageTemplate.lines, author);
        }
    }

    for (const { item, aliasTo } of pendingAliases) {
        const target = refs.get(aliasTo);
        if (target) item.aliasTargetId = target.id;
    }
}

// Build a fully populated demo project from the template above.
export function buildDemoProject(author = "seed-server"): Project {
    const project = Project.createInstance(DEMO_PROJECT_TITLE);
    populateDemoProject(project, author);
    return project;
}

// Recursively create structured demo items, seeding non-text content
// (components, votes, comments, attachments) and collecting alias references
// so that `populateDemoProject` can resolve alias targets in a later pass.
function addDemoItems(
    parent: Items,
    defs: DemoItem[],
    author: string,
    refs: Map<string, Item>,
    pendingAliases: { item: Item; aliasTo: string; }[],
): void {
    for (const def of defs) {
        const node = parent.addNode(author);
        if (def.text !== undefined) node.text = def.text;
        if (def.componentType) node.componentType = def.componentType;
        if (def.yjsTableId !== undefined) node.yjsTableId = def.yjsTableId;
        if (def.calendarId !== undefined) node.calendarId = def.calendarId;
        if (def.start !== undefined) node.start = def.start;
        if (def.allDay !== undefined) node.allDay = def.allDay;
        if (def.duration !== undefined) node.duration = def.duration;
        if (def.due !== undefined) node.due = def.due;
        if (def.tags) node.tags = def.tags;
        if (def.votes) {
            for (const voter of def.votes) node.toggleVote(voter);
        }
        if (def.comments) {
            for (const comment of def.comments) node.addComment(comment.author, comment.text);
        }
        if (def.attachments) {
            for (const url of def.attachments) node.addAttachment(url);
        }
        if (def.ref) refs.set(def.ref, node);
        if (def.aliasTo) pendingAliases.push({ item: node, aliasTo: def.aliasTo });
        if (def.children) addDemoItems(node.items, def.children, author, refs, pendingAliases);
    }
}

function addLinesToPage(page: Item, lines: string[], author: string) {
    // levels[d] is the Items collection that receives items of depth d
    const levels: Items[] = [page.items];
    let lastItem: Item | undefined;

    for (const rawLine of lines) {
        const textStartTrimmed = rawLine.trimStart();
        const text = textStartTrimmed.trimEnd();
        if (!text) continue;

        const indent = rawLine.length - textStartTrimmed.length;
        let depth = Math.floor(indent / 2);

        if (depth >= levels.length) {
            // Deeper than before: nest under the previous item (clamp to one level per step)
            if (lastItem) levels.push(lastItem.items);
            depth = levels.length - 1;
        } else {
            levels.length = depth + 1;
        }

        lastItem = levels[depth].addNode(author);
        lastItem.text = text;
    }
}
