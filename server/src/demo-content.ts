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
export const DEMO_TEMPLATE_VERSION = 11;

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
    componentType?: "yjstable";
    // For "yjstable" components: id of the demo table (see demoTables below)
    // this item embeds.
    yjsTableId?: string;
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
    // Fixed id (also the room segment): [A-Za-z0-9_-] only.
    tableId: string;
    name: string;
    schemaSql: string;
    query: string;
    // Cell component type per column (UI Definition).
    components: Record<string, string>;
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

export const DEMO_SALES_TABLE_ID = "demo-table-sales";
export const DEMO_TASKS_TABLE_ID = "demo-table-tasks";
export const DEMO_HABITS_TABLE_ID = "demo-table-habits";

export const demoTables: DemoTableTemplate[] = [
    {
        tableId: DEMO_SALES_TABLE_ID,
        name: "Sales",
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
        tableId: DEMO_TASKS_TABLE_ID,
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
            title: "text",
            status: "select",
            priority: "select",
            due_date: "date",
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
];

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
    for (const [column, type] of Object.entries(template.components)) {
        const cfg = new Y.Map<unknown>();
        components.set(column, cfg);
        cfg.set("type", type);
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
            "  [Internal Links]: linking between pages, backlinks, and the graph view.",
            "  [Search and Commands]: full-text search and the inline command palette.",
            "  [Selection and Clipboard]: multi-item selection, box selection, copy and paste.",
            "  [Collaboration]: real-time editing with other users.",
            "  [Comments and Votes]: discussing and voting on items, with live seeded threads and votes.",
            "  [Publishing and Sharing]: read-only sharing, scheduled publishing, and snapshots.",
            "  [Advanced Features]: live database tables with charts, aliases, and attachments.",
            "  [Tasks and Habits]: task management and habit tracking built on database tables.",
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
        title: "Search and Commands",
        lines: [
            "Use the Search button at the top of a page to search across the whole project.",
            "Recent searches are remembered for quick access.",
            "The inline command palette opens when you type / inside an item.",
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
            "Scheduled publishing: schedule a page to be published automatically at a later time.",
            "The schedule management page lists upcoming publishing tasks and lets you edit or cancel them.",
            "Snapshots: the snapshot diff viewer shows how a page changed compared to earlier versions.",
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

    for (const pageTemplate of demoPages) {
        const page = project.addPage(pageTemplate.title, author);
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
        const text = rawLine.trimStart();
        if (!text) continue;

        const indent = rawLine.length - text.length;
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
