import * as Y from "yjs";
import { demoContentEn } from "./demo-content.en.js";
import { demoContentJa } from "./demo-content.ja.js";
import { DEFAULT_DEMO_SLUG, type DemoLocale, demoLocaleForSlug } from "./demo-projects.js";
import { Item, Items, Project } from "./schema/app-schema.js";

// The public demo project is the living showcase of the product: every
// end-user feature should be demonstrable on one of its pages.
// When you implement a new end-user feature, extend the template (add a
// line to an existing page, or add a new feature page plus a landing-page
// tour link) so the demo keeps covering the full feature set.
// See docs/demo-project.md for the full policy.
//
// The demo ships in several languages, one project per locale (see
// shared/src/demoProjects.ts). This module owns everything the locales share
// — types, ids, SQL, dates and the seeding logic — while the strings a
// visitor reads live in demo-content.<locale>.ts. Adding a locale is one
// registry entry plus one content pack; nothing here needs to change.

// Bump this whenever the demo template changes so that already-seeded demo
// documents are re-seeded on the next /api/seed-demo call. One number covers
// every locale: each document stores its own `metadata.templateVersion`, so a
// single bump reseeds them all on their next visit.
export const DEMO_TEMPLATE_VERSION = 59;

// Must match the demo room id (`projects/demo`) so that internal links
// rendered from `project.title` resolve to /demo/<page> URLs. Localized demos
// follow the same rule with their own slug (`demo-ja` -> `projects/demo-ja`).
export const DEMO_PROJECT_TITLE = DEFAULT_DEMO_SLUG;

/**
 * Locale-stable identity of the landing page.
 *
 * Page *titles* are translated, so they cannot identify a page across locales.
 * `DemoPageTemplate.key` can, and it is what `templatePageId` stores.
 */
export const DEMO_LANDING_PAGE_KEY = "welcome";

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
    componentType?: "yjstable" | "calendar" | "layout";
    // For "layout" children (#4997): how many of the Layout's 12 columns this
    // item occupies. Order comes from the item's position among its siblings,
    // so this is the only placement value the template carries.
    columnSpan?: number;
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
    // Locale-stable identity of the page, stored on the seeded page as
    // `templatePageId`. The English keys are exactly `title.trim().toLowerCase()`
    // of the English titles, which is what earlier versions derived, so already
    // seeded `projects/demo` documents keep matching without a migration.
    key: string;
    // Localized. Internal `[Page Title]` links elsewhere in the same locale's
    // content must match this exactly.
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
export const DEMO_ATTACHMENT_IMAGE =
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
    components: Record<string, string | { type: string; label?: string; hidden?: boolean; }>;
    // Seed records: id -> column values.
    records: { id: string; values: Record<string, string | number | boolean | null>; }[];
    // Further Grids over the same Table, seeded so the Table page's "Grids
    // using this table" list has more than one entry and the two standalone
    // Grid pages are visibly independent presentations of one Table.
    extraGrids?: {
        gridId: string;
        name: string;
        query: string;
        components?: Record<string, string | { type: string; label?: string; hidden?: boolean; }>;
    }[];
}

// Local date helpers so the seeded tasks/habits stay relative to the seeding
// moment (the demo is re-seeded at least daily, so drift stays small).
export function demoDate(daysFromToday: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Recurring-task helpers. The occurrences table is keyed by UTC dates because the
// schedule rules that generate its rows run in the UTC timezone, so seeded and
// generated occurrence ids must agree regardless of the server's local zone.
export function demoUtcDate(daysFromToday: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
}

// Monday (UTC) of the week `weeksAgo` weeks before the current one.
export function demoUtcWeekStart(weeksAgo: number): string {
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

/**
 * Deterministic Grid id derived from a Table id. Each demo Table has one Grid
 * seeded alongside it; outline items reference the Grid, and the Grid points
 * at the source Table. Keeping the derivation stable across reseeds means an
 * already-seeded project matches without a migration step.
 */
export function demoGridIdFor(tableId: string): string {
    return `${tableId}-grid`;
}

// The recurring tasks demonstrated on the "Recurring Tasks" page. Each entry
// becomes a row of the routine templates table; the seeded schedule rules read
// that table and turn its rows into dated occurrences in the occurrences table.
export interface DemoRoutineTemplate {
    taskKey: string;
    // Localized. Copied into both routine tables, and from there into the rows
    // the schedule rules generate (see routineOccurrenceSql).
    title: string;
    cadence: "daily" | "weekly";
}

const demoRoutineTemplatesEn: DemoRoutineTemplate[] = [
    { taskKey: "daily-standup", title: "Write the standup note", cadence: "daily" },
    { taskKey: "daily-inbox", title: "Empty the inbox", cadence: "daily" },
    { taskKey: "weekly-review", title: "Weekly review", cadence: "weekly" },
    { taskKey: "weekly-report", title: "Send the weekly report", cadence: "weekly" },
];

/**
 * Build the demo tables. Structure, SQL and ids are identical in every locale;
 * only display names, column labels and the human-readable record values
 * differ, and those arrive through `routineTemplates` and the overrides
 * applied by `demoTablesFor`.
 */
function buildDemoTables(routineTemplates: DemoRoutineTemplate[]): DemoTableTemplate[] {
    return [
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
            components: { id: { type: "text", hidden: true }, month: "text", revenue: "number" },
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
            records: routineTemplates.map((template) => ({
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
            records: routineTemplates.flatMap((template) => {
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
            // A second, independent presentation of the same Table: the full
            // history rather than only the newest occurrence per task. Opening
            // /tables/demo/demo-table-routine-occurrences shows the raw rows
            // plus links to *both* Grids; neither one is "the table".
            extraGrids: [
                {
                    gridId: DEMO_ROUTINE_HISTORY_GRID_ID,
                    name: "Routine Occurrences · full history",
                    query: "SELECT id, task_key, title, occurrence_date, done\n"
                        + "FROM routine_occurrences\n"
                        + "ORDER BY occurrence_date DESC, task_key",
                    components: {
                        task_key: "text",
                        title: "text",
                        occurrence_date: { type: "date", label: "Date" },
                        done: "checkbox",
                    },
                },
            ],
        },
    ];
}

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
    name?: string;
    targetTableId: string;
    sql: string;
    rrule: string;
    // Local wall-clock start of the recurrence (in `timezone`).
    dtstart: string;
    timezone: string;
    catchUp: boolean;
}

/** Second Grid over the routine occurrences Table (see `extraGrids`). */
export const DEMO_ROUTINE_HISTORY_GRID_ID = "demo-table-routine-occurrences-history-grid";

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
            name: "Routine Occurrences · daily",
            targetTableId: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
            sql: routineOccurrenceSql("daily"),
            rrule: "RRULE:FREQ=DAILY",
            dtstart: `${demoUtcDate(0)}T00:00:00`,
            timezone: "UTC",
            catchUp: true,
        },
        {
            ruleId: DEMO_WEEKLY_RULE_ID,
            name: "Routine Occurrences · weekly",
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
export function registerDemoScheduleRules(projectDoc: Y.Doc, locale: DemoLocale = "en"): void {
    const schedules = projectDoc.getMap<Y.Map<string | boolean>>("schedules");
    for (const rule of buildDemoScheduleRulesFor(locale)) {
        const ruleMap = new Y.Map<string | boolean>();
        schedules.set(rule.ruleId, ruleMap);
        if (rule.name) {
            ruleMap.set("name", rule.name);
        }
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
    // "gantt" selects the Gantt view (#4350) and "hours" the single-day Hour
    // Map (#4972) instead.
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
export const DEMO_HOUR_MAP_CALENDAR_ID = "demo-calendar-hour-map";

const demoCalendarsEn: DemoCalendarTemplate[] = [
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
    {
        calendarId: DEMO_HOUR_MAP_CALENDAR_ID,
        name: "Today by the Hour",
        // Same query and roles as the tasks calendar — the Hour Map (#4972) is
        // purely a different projection of the same entries, so the only thing
        // that differs is `viewType`.
        query: "SELECT id, text AS title, due, all_day, start_on, start_at, duration, "
            + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        viewType: "hours",
        roleTitle: "title",
        roleStart: "start_at",
        roleAllDay: "all_day",
        roleDuration: "duration",
        roleDue: "due",
    },
];

/** Write the demo's calendars into the project doc's `calendars` map. */
export function registerDemoCalendars(projectDoc: Y.Doc, locale: DemoLocale = "en"): void {
    const calendars = projectDoc.getMap<Y.Map<unknown>>("calendars");
    for (const template of demoCalendarsFor(locale)) {
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
 *
 * The guid is scoped by `slug` because the table *ids* are shared across
 * locales while the documents are not: `/demo` and `/demo-ja` each have their
 * own `projects/<slug>/tables/<tableId>` room. Yjs-bound components remount on
 * `ydoc.guid` (AGENTS.md §11), so a guid shared between the two locales would
 * leave a table view showing the previous locale's document after navigating
 * from one demo to the other.
 */
export function registerDemoTables(
    projectDoc: Y.Doc,
    slug: string = DEFAULT_DEMO_SLUG,
    locale: DemoLocale = "en",
): void {
    const registry = projectDoc.getMap<Y.Map<unknown>>("yjsTables");
    const gridRegistry = projectDoc.getMap<Y.Map<unknown>>("yjsGrids");
    for (const template of demoTablesFor(locale)) {
        const entry = new Y.Map<unknown>();
        registry.set(template.tableId, entry);
        entry.set("name", template.name);
        entry.set("sqlName", template.sqlName);
        entry.set("doc", new Y.Doc({ guid: `demo--${slug}--table--${template.tableId}`, autoLoad: true }));

        // One Grid per demo Table, seeded alongside it. Outline items bind to
        // this Grid; the Grid points at the Table for schema+data.
        const gridId = demoGridIdFor(template.tableId);
        const gridEntry = new Y.Map<unknown>();
        gridEntry.set("sourceTableId", template.tableId);
        gridEntry.set("name", template.name);
        gridEntry.set("query", template.query);
        const components = new Y.Map<Y.Map<unknown>>();
        for (const [column, def] of Object.entries(template.components)) {
            const cfg = new Y.Map<unknown>();
            components.set(column, cfg);
            if (typeof def === "string") cfg.set("type", def);
            else {
                cfg.set("type", def.type);
                if (def.label) cfg.set("label", def.label);
                if (def.hidden) cfg.set("hidden", true);
            }
        }
        gridEntry.set("components", components);
        gridRegistry.set(gridId, gridEntry);

        for (const extra of template.extraGrids ?? []) {
            const extraEntry = new Y.Map<unknown>();
            extraEntry.set("sourceTableId", template.tableId);
            extraEntry.set("name", extra.name);
            extraEntry.set("query", extra.query);
            const extraComponents = new Y.Map<Y.Map<unknown>>();
            for (const [column, def] of Object.entries(extra.components ?? {})) {
                const cfg = new Y.Map<unknown>();
                extraComponents.set(column, cfg);
                if (typeof def === "string") cfg.set("type", def);
                else {
                    cfg.set("type", def.type);
                    if (def.label) cfg.set("label", def.label);
                    if (def.hidden) cfg.set("hidden", true);
                }
            }
            extraEntry.set("components", extraComponents);
            gridRegistry.set(extra.gridId, extraEntry);
        }
    }
}

/**
 * Seed one Table subdoc (the live document of `projects/demo/tables/<tableId>`)
 * with schema text and data records (nested Y.Map per record). Grid state
 * (SELECT + column UI) is seeded separately into the project doc's
 * `yjsGrids` registry by `registerDemoTables`; the Table subdoc no longer
 * carries an authoritative `ui` map.
 */
export function seedDemoTableDoc(doc: Y.Doc, template: DemoTableTemplate): void {
    const meta = doc.getMap<unknown>("metadata");
    meta.set("templateVersion", DEMO_TEMPLATE_VERSION);

    const schema = doc.getText("schema");
    schema.delete(0, schema.length);
    schema.insert(0, template.schemaSql);

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

// Populate an existing, empty project with the demo template pages.
// The reset endpoint calls this against the live shared document so that all
// writes (including YTree re-initialization) are sequential operations of the
// server client. Applying a fresh document's update instead would make the
// YTree "root" marker a concurrent write, which can lose against tombstoned
// entries from earlier resets and corrupt the tree.
export function populateDemoProject(
    project: Project,
    author = "seed-server",
    locale: DemoLocale = "en",
    slug: string = DEFAULT_DEMO_SLUG,
): void {
    // Aliases reference a target item by its `ref` label. Build every page
    // first (recording refs and pending aliases), then resolve the alias
    // targets so that aliases can point to an item declared anywhere.
    const refs = new Map<string, Item>();
    const pendingAliases: { item: Item; aliasTo: string; }[] = [];

    // Register the demo tables (registry entries + subdoc references) in the
    // project doc. The table contents live in their own rooms and are seeded
    // separately by the demo API.
    registerDemoTables(project.ydoc, slug, locale);

    // Recurring SQL execution against the routine occurrences table (see the
    // "Recurring Tasks" page).
    registerDemoScheduleRules(project.ydoc, locale);

    // The calendars registry (query + role assignment, no subdoc of its own;
    // see the "Calendars" page).
    registerDemoCalendars(project.ydoc, locale);

    for (const pageTemplate of demoPagesFor(locale)) {
        const page = project.addPage(pageTemplate.title, author);
        // Locale-stable: the title is translated, the key is not. The seeding
        // freshness check pairs this id with the expected title of the same
        // locale (see demo-api.ts), which is what still makes a renamed page
        // force a reseed.
        page.templatePageId = pageTemplate.key;
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

/**
 * Build a fully populated demo project for one locale.
 *
 * The project's title is the slug, which is also its room id and its first URL
 * segment — see shared/src/demoProjects.ts for why those three must agree.
 */
export function buildDemoProject(author = "seed-server", slug: string = DEFAULT_DEMO_SLUG): Project {
    const locale = demoLocaleForSlug(slug) ?? "en";
    const project = Project.createInstance(slug);
    populateDemoProject(project, author, locale, slug);
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
        if (def.yjsTableId !== undefined) {
            // Grid owns the SELECT/UI now; the Table id stays as provenance so
            // the Table-keyed clipboard/export pipeline still recognises the
            // block as a component. See gridDocs.ts / itemBinding.ts.
            node.yjsTableId = def.yjsTableId;
            node.yjsGridId = demoGridIdFor(def.yjsTableId);
        }
        if (def.calendarId !== undefined) node.calendarId = def.calendarId;
        if (def.columnSpan !== undefined) node.columnSpan = def.columnSpan;
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

// ---------------------------------------------------------------------------
// Locale packs.
//
// English is the base: it defines the structure and every string. Other
// locales are sparse overrides, so a page (or a table name, or a single
// record value) that has not been translated yet still seeds — in English —
// instead of disappearing from that locale's demo.
// ---------------------------------------------------------------------------

export interface DemoLocaleContent {
    // Merged over the English pages by `key`, keeping the English order. A page
    // present only in English seeds untranslated; a page whose key matches no
    // English page is ignored, since nothing else in the demo would link to it.
    pages?: DemoPageTemplate[];
    // tableId -> display name.
    tableNames?: Record<string, string>;
    // `${tableId}.${column}` -> column label.
    columnLabels?: Record<string, string>;
    // `${tableId}.${recordId}.${column}` -> cell value. Sparse: only the
    // human-readable columns need translating, never ids, dates or enums.
    recordText?: Record<string, string>;
    // taskKey -> routine title. Propagates into both routine tables and, from
    // there, into the rows the schedule rules generate.
    routineTitles?: Record<string, string>;
    // calendarId -> display name.
    calendarNames?: Record<string, string>;
    // ruleId -> display name.
    ruleNames?: Record<string, string>;
}

const localeContentLoaders: Record<DemoLocale, () => DemoLocaleContent> = {
    en: demoContentEn,
    ja: demoContentJa,
};

// Each pack is built once per process, matching the old module-level consts.
const localeContentCache = new Map<DemoLocale, DemoLocaleContent>();

function localeContent(locale: DemoLocale): DemoLocaleContent {
    let content = localeContentCache.get(locale);
    if (!content) {
        content = localeContentLoaders[locale]();
        localeContentCache.set(locale, content);
    }
    return content;
}

/** Drop the memoized packs. Exported for tests that stub a locale. */
export function resetDemoLocaleCache(): void {
    localeContentCache.clear();
}

/**
 * The pages of one locale, in the English pack's order, each page falling back
 * to English when this locale has not translated it.
 */
export function demoPagesFor(locale: DemoLocale): DemoPageTemplate[] {
    const base = localeContent("en").pages ?? [];
    if (locale === "en") return base;
    const overrides = new Map((localeContent(locale).pages ?? []).map(p => [p.key, p]));
    return base.map(page => overrides.get(page.key) ?? page);
}

/** The demo tables of one locale: shared structure, localized strings. */
export function demoTablesFor(locale: DemoLocale): DemoTableTemplate[] {
    const tables = buildDemoTables(demoRoutineTemplatesFor(locale));
    if (locale === "en") return tables;

    const { tableNames = {}, columnLabels = {}, recordText = {} } = localeContent(locale);
    return tables.map(table => ({
        ...table,
        name: tableNames[table.tableId] ?? table.name,
        components: Object.fromEntries(
            Object.entries(table.components).map(([column, def]) => {
                const label = columnLabels[`${table.tableId}.${column}`];
                if (!label) return [column, def];
                // A bare string is shorthand for `{ type }`; widen it so the
                // localized label has somewhere to live.
                return [column, typeof def === "string" ? { type: def, label } : { ...def, label }];
            }),
        ),
        records: table.records.map(record => ({
            ...record,
            values: Object.fromEntries(
                Object.entries(record.values).map(([column, value]) => [
                    column,
                    recordText[`${table.tableId}.${record.id}.${column}`] ?? value,
                ]),
            ),
        })),
    }));
}

/** The recurring-task templates of one locale. */
export function demoRoutineTemplatesFor(locale: DemoLocale): DemoRoutineTemplate[] {
    if (locale === "en") return demoRoutineTemplatesEn;
    const { routineTitles = {} } = localeContent(locale);
    return demoRoutineTemplatesEn.map(template => ({
        ...template,
        title: routineTitles[template.taskKey] ?? template.title,
    }));
}

/** The calendars of one locale. Queries and role bindings are never localized. */
export function demoCalendarsFor(locale: DemoLocale): DemoCalendarTemplate[] {
    if (locale === "en") return demoCalendarsEn;
    const { calendarNames = {} } = localeContent(locale);
    return demoCalendarsEn.map(calendar => ({
        ...calendar,
        name: calendarNames[calendar.calendarId] ?? calendar.name,
    }));
}

/** The schedule rules of one locale. RRULEs, SQL and dtstarts are never localized. */
export function buildDemoScheduleRulesFor(locale: DemoLocale): DemoScheduleRuleTemplate[] {
    const rules = buildDemoScheduleRules();
    if (locale === "en") return rules;
    const { ruleNames = {} } = localeContent(locale);
    return rules.map(rule => ({ ...rule, name: ruleNames[rule.ruleId] ?? rule.name }));
}

/** The landing page's title in one locale. */
export function demoLandingPageTitle(locale: DemoLocale): string {
    const landing = demoPagesFor(locale).find(page => page.key === DEMO_LANDING_PAGE_KEY);
    return landing?.title ?? DEMO_LANDING_PAGE_TITLE;
}

// ---------------------------------------------------------------------------
// English views of the above, kept as consts so the many existing callers and
// tests that predate the locale split keep working unchanged.
// ---------------------------------------------------------------------------

export const demoPages: DemoPageTemplate[] = demoPagesFor("en");
export const demoTables: DemoTableTemplate[] = demoTablesFor("en");
export const demoRoutineTemplates: DemoRoutineTemplate[] = demoRoutineTemplatesEn;
export const demoCalendars: DemoCalendarTemplate[] = demoCalendarsEn;
