import { Item, Items, Project } from "./schema/app-schema.js";

// The public demo project is the living showcase of the product: every
// end-user feature should be demonstrable on one of the pages below.
// When you implement a new end-user feature, extend this template (add a
// line to an existing page, or add a new feature page plus a landing-page
// tour link) so the demo keeps covering the full feature set.
// See docs/demo-project.md for the full policy.

// Bump this whenever the demo template below changes so that already-seeded
// demo documents are re-seeded on the next /api/seed-demo call.
export const DEMO_TEMPLATE_VERSION = 5;

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
    tableSchema?: string;
    // Column names of the item-embedded table (JSON-cached on the item).
    tableColumns?: string[];
    // Seed rows for the item-embedded table, keyed by column name.
    tableRows?: Record<string, string>[];
    // The item's plain text. Optional for component/alias items.
    text?: string;
    // Render this item as a live component instead of plain text.
    componentType?: "table" | "chart" | "tasks" | "habits";
    // For chart components: a self-contained SQL query (CREATE + INSERT +
    // SELECT) so the chart renders without any external data source.
    chartQuery?: string;
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

// A self-contained SQL query that builds its own data and selects it, so the
// chart component renders a deterministic bar chart with no external source.
const DEMO_CHART_QUERY =
    "DROP TABLE IF EXISTS sales; CREATE TABLE sales(id TEXT PRIMARY KEY, month TEXT, revenue INTEGER);"
    + ' INSERT INTO sales VALUES("1","Jan",120),("2","Feb",180),("3","Mar",150),("4","Apr",210);'
    + " SELECT month AS sales_month, revenue AS sales_revenue FROM sales";

// Table definitions for the task manager / habit tracker components.
// These strings must stay byte-identical to TASK_TABLE_DDL / HABIT_TABLE_DDL in
// client/src/services/taskHabitService.ts so the components recognize the
// seeded tables as their own schema.
const DEMO_TASK_TABLE_DDL = "CREATE TABLE tasks (\n"
    + "  id TEXT PRIMARY KEY,\n"
    + "  title TEXT,\n"
    + "  status TEXT,\n"
    + "  priority TEXT,\n"
    + "  due_at TEXT,\n"
    + "  repeat_days TEXT,\n"
    + "  created_at TEXT,\n"
    + "  completed_at TEXT\n"
    + ")";
const DEMO_TASK_COLUMNS = ["id", "title", "status", "priority", "due_at", "repeat_days", "created_at", "completed_at"];

const DEMO_HABIT_TABLE_DDL = "CREATE TABLE habits (\n"
    + "  id TEXT PRIMARY KEY,\n"
    + "  kind TEXT,\n"
    + "  habit_id TEXT,\n"
    + "  name TEXT,\n"
    + "  interval_days TEXT,\n"
    + "  date TEXT,\n"
    + "  created_at TEXT\n"
    + ")";
const DEMO_HABIT_COLUMNS = ["id", "kind", "habit_id", "name", "interval_days", "date", "created_at"];

// Local date helpers so the seeded tasks/habits stay relative to the seeding
// moment (the demo is re-seeded at least daily, so drift stays small).
function demoDate(daysFromToday: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DEMO_TASK_ROWS: Record<string, string>[] = [
    {
        id: "demo-task-overdue",
        title: "Reply to the design review",
        status: "open",
        priority: "high",
        due_at: demoDate(-1),
        repeat_days: "",
        created_at: `${demoDate(-3)}T09:00:00`,
        completed_at: "",
    },
    {
        id: "demo-task-today",
        title: "Prepare tomorrow's standup notes",
        status: "open",
        priority: "medium",
        due_at: demoDate(0),
        repeat_days: "",
        created_at: `${demoDate(-1)}T18:30:00`,
        completed_at: "",
    },
    {
        id: "demo-task-recurring",
        title: "Water the plants",
        status: "open",
        priority: "low",
        due_at: `${demoDate(1)}T09:00`,
        repeat_days: "3",
        created_at: `${demoDate(-2)}T08:00:00`,
        completed_at: "",
    },
    {
        id: "demo-task-upcoming",
        title: "Book dentist appointment",
        status: "open",
        priority: "medium",
        due_at: demoDate(4),
        repeat_days: "",
        created_at: `${demoDate(-1)}T12:00:00`,
        completed_at: "",
    },
    {
        id: "demo-task-done",
        title: "Send the weekly report",
        status: "done",
        priority: "high",
        due_at: demoDate(-1),
        repeat_days: "",
        created_at: `${demoDate(-2)}T10:00:00`,
        completed_at: `${demoDate(-1)}T16:45:00`,
    },
];

const DEMO_HABIT_ROWS: Record<string, string>[] = [
    {
        id: "demo-habit-stretch",
        kind: "habit",
        habit_id: "",
        name: "Morning stretch",
        interval_days: "1",
        date: "",
        created_at: `${demoDate(-6)}T07:00:00`,
    },
    {
        id: "demo-habit-review",
        kind: "habit",
        habit_id: "",
        name: "Weekly review",
        interval_days: "7",
        date: "",
        created_at: `${demoDate(-6)}T07:00:00`,
    },
    // A three-day streak ending yesterday: check today's cell to extend it.
    ...[-3, -2, -1].map((offset) => ({
        id: `demo-habit-stretch-log${offset}`,
        kind: "log",
        habit_id: "demo-habit-stretch",
        name: "",
        interval_days: "",
        date: demoDate(offset),
        created_at: `${demoDate(offset)}T07:10:00`,
    })),
    {
        id: "demo-habit-review-log",
        kind: "log",
        habit_id: "demo-habit-review",
        name: "",
        interval_days: "",
        date: demoDate(-5),
        created_at: `${demoDate(-5)}T19:00:00`,
    },
];

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
            "  [Advanced Features]: live charts, SQL tables, aliases, and attachments.",
            "  [Tasks and Habits]: SQL-backed task management and habit tracking.",
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
                text: "Charts: this item renders a bar chart from a self-contained SQL query.",
                componentType: "chart",
                chartQuery: DEMO_CHART_QUERY,
            },
            {
                text: "SQL Tables: this item renders an editable, query-backed table grid.",
                componentType: "table",
                tableSchema: "CREATE TABLE demo_table (id INTEGER PRIMARY KEY, name TEXT)",
                chartQuery: "SELECT 1 AS value",
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
                    "Practical task management and habit tracking, built on the SQL table feature. The items below are live components.",
            },
            {
                text:
                    "Task manager: add tasks with due dates, priorities and repeat intervals. Completing a repeating task schedules the next occurrence automatically.",
                componentType: "tasks",
                tableSchema: DEMO_TASK_TABLE_DDL,
                tableColumns: DEMO_TASK_COLUMNS,
                tableRows: DEMO_TASK_ROWS,
            },
            {
                text:
                    "Habit tracker: check off each day in the grid and watch your streak grow. Each habit has its own repeat interval.",
                componentType: "habits",
                tableSchema: DEMO_HABIT_TABLE_DDL,
                tableColumns: DEMO_HABIT_COLUMNS,
                tableRows: DEMO_HABIT_ROWS,
            },
            {
                text:
                    "The Today, Upcoming, Overdue and Completed views — and the habit streaks — are computed with real SQL (SQLite) over the collaborative table rows.",
            },
            {
                text: "Every task records its registration time, and completed tasks keep their completion timestamp.",
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
        if (def.chartQuery !== undefined) node.chartQuery = def.chartQuery;
        if (def.tableSchema !== undefined) node.tableSchema = def.tableSchema;
        if (def.tableColumns !== undefined) node.tableColumns = def.tableColumns;
        if (def.tableRows) {
            for (const row of def.tableRows) node.addTableRow(row);
        }
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
