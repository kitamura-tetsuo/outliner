import { Item, Items, Project } from "./schema/app-schema.js";

// Bump this whenever the demo template below changes so that already-seeded
// demo documents are re-seeded on the next /api/seed-demo call.
export const DEMO_TEMPLATE_VERSION = 3;

// Must match the demo room id (`projects/demo`) so that internal links
// rendered from `project.title` resolve to /demo/<page> URLs.
export const DEMO_PROJECT_TITLE = "demo";

export const DEMO_LANDING_PAGE_TITLE = "Demo";

export interface DemoPageTemplate {
    title: string;
    // Item text lines. Two leading spaces per nesting level.
    lines: string[];
}

export const demoPages: DemoPageTemplate[] = [
    {
        title: DEMO_LANDING_PAGE_TITLE,
        lines: [
            "Welcome to the Outliner Demo!",
            "This is a public, collaborative demo project. Anyone can edit it, and the content resets every 24 hours.",
            "Each page of this project demonstrates a group of features. Follow the links below to take the tour.",
            "Feature tour:",
            "  [Formatting]: bold, italic, strike-through, code, and links.",
            "  [Outliner Basics]: items, indentation, and keyboard navigation.",
            "  [Checkboxes and Tasks]: interactive checklists with completion status.",
            "  [Internal Links]: linking between pages, backlinks, and the graph view.",
            "  [Search and Commands]: full-text search and the inline command palette.",
            "  [Collaboration]: real-time editing with other users.",
            "  [Comments and Votes]: discussing and voting on items.",
            "  [Advanced Features]: charts, SQL queries, aliases, and attachments.",
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
        lines: [
            "Items can carry comment threads and votes.",
            "Comments:",
            "  Open an item's comment thread to discuss it with others.",
            "  Items show a badge with the number of comments.",
            "Votes:",
            "  Vote for an item to show agreement.",
            "Try commenting on this item!",
        ],
    },
    {
        title: "Advanced Features",
        lines: [
            "A quick tour of the more advanced capabilities.",
            "Charts: an item can render a chart from a data query.",
            "SQL: query your outline data with client-side SQL.",
            "Aliases: an item can mirror another item and stay in sync with the original.",
            "Attachments: drag and drop images or files onto an item to attach them.",
            "Schedule: the Schedule view shows date-tagged items as a timeline.",
            "Sharing: projects can be shared with read-only tokens.",
        ],
    },
];

// Build a fully populated demo project from the template above.
export function buildDemoProject(author = "seed-server"): Project {
    const project = Project.createInstance(DEMO_PROJECT_TITLE);
    for (const pageTemplate of demoPages) {
        const page = project.addPage(pageTemplate.title, author);
        addLinesToPage(page, pageTemplate.lines, author);
    }
    return project;
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
