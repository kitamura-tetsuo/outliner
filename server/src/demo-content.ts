import { Item, Items, Project } from "./schema/app-schema.js";

// The public demo project is the living showcase of the product: every
// end-user feature should be demonstrable on one of the pages below.
// When you implement a new end-user feature, extend this template (add a
// line to an existing page, or add a new feature page plus a landing-page
// tour link) so the demo keeps covering the full feature set.
// See docs/demo-project.md for the full policy.

// Bump this whenever the demo template below changes so that already-seeded
// demo documents are re-seeded on the next /api/seed-demo call.
export const DEMO_TEMPLATE_VERSION = 6;

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
    componentType?: "table" | "chart";
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
    "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2740%27%20height%3D%2740%27%3E%3Crect%20width%3D%2740%27%20height%3D%2740%27%20fill%3D%27%233b82f6%27%2F%3E%3Ctext%20x%3D%2720%27%20y%3D%2725%27%20font-size%3D%2710%27%20fill%3D%27white%27%20text-anchor%3D%27middle%27%3EIMG%3C%2Ftext%3E%3C%2Fsvg%3E";

// A self-contained SQL query that builds its own data and selects it, so the
// chart component renders a deterministic bar chart with no external source.
const DEMO_CHART_QUERY = "CREATE TABLE sales(id TEXT PRIMARY KEY, month TEXT, revenue INTEGER);"
    + ' INSERT INTO sales VALUES("1","Jan",120),("2","Feb",180),("3","Mar",150),("4","Apr",210);'
    + " SELECT month AS sales_month, revenue AS sales_revenue FROM sales";

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
            "  [Checkboxes and Tasks]: interactive checklists with completion status.",
            "  [Internal Links]: linking between pages, backlinks, and the graph view.",
            "  [Search and Commands]: full-text search and the inline command palette.",
            "  [Selection and Clipboard]: multi-item selection, box selection, copy and paste.",
            "  [Collaboration]: real-time editing with other users.",
            "  [Comments and Votes]: discussing and voting on items, with live seeded threads and votes.",
            "  [Publishing and Sharing]: read-only sharing, scheduled publishing, and snapshots.",
            "  [Advanced Features]: live charts, SQL tables, aliases, and attachments.",
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
            "  You can make text [/italic] using a slash bracket.",
            "  You can [-strike through] text using a dash bracket.",
            "  Inline `code` uses backticks.",
            "  Formats can be combined, like [[bold with [/italic]]] inside.",
            "URLs become clickable links: https://github.com/yjs/yjs",
            "Try editing any line above to see the syntax behind it.",
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
        title: "Checkboxes and Tasks",
        lines: [
            "Type [ ] at the start of an item to turn it into a checkbox.",
            "Click a checkbox to toggle it. Parent items reflect the completion status of their children.",
            "Shopping list:",
            "  [x] Milk",
            "  [x] Bread",
            "  [ ] Eggs",
            "  [ ] Coffee",
            "Your turn:",
            "  [ ] Try checking this box",
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
            "More links to explore: [Outliner Basics], [Checkboxes and Tasks], [Collaboration]",
        ],
    },
    {
        title: "Search and Commands",
        lines: [
            "Use the Search button at the top of a page to search across the whole project.",
            "Recent searches are remembered for quick access.",
            "The inline command palette opens when you type [/ inside an item.",
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
                votes: ["alice", "bob", "carol"],
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
