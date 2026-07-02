import { expect } from "chai";
import { buildDemoProject, DEMO_LANDING_PAGE_TITLE, DEMO_PROJECT_TITLE, demoPages } from "../src/demo-content.js";
import type { Item, Items } from "../src/schema/app-schema.js";

function childTexts(items: Items | undefined): string[] {
    const texts: string[] = [];
    if (!items) return texts;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (item) texts.push(item.text);
    }
    return texts;
}

function findChildByText(items: Items | undefined, text: string): Item | undefined {
    if (!items) return undefined;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (item && item.text === text) return item;
    }
    return undefined;
}

describe("Demo seed content", () => {
    const project = buildDemoProject("seed-test");

    it("builds a project titled 'demo' so internal links resolve to /demo/<page>", () => {
        expect(project.title).to.equal(DEMO_PROJECT_TITLE);
        expect(DEMO_PROJECT_TITLE).to.equal("demo");
    });

    it("creates one top-level page per template entry, in template order", () => {
        const pageTitles = childTexts(project.items);
        expect(pageTitles).to.deep.equal(demoPages.map(p => p.title));
        expect(pageTitles.length).to.be.greaterThanOrEqual(8);
    });

    it("seeds the landing page with internal links to every feature page", () => {
        const landing = findChildByText(project.items, DEMO_LANDING_PAGE_TITLE);
        expect(landing, "landing page exists").to.not.equal(undefined);

        const tour = findChildByText(landing!.items, "Feature tour:");
        expect(tour, "feature tour item exists").to.not.equal(undefined);

        const tourTexts = childTexts(tour!.items).join("\n");
        for (const page of demoPages) {
            if (page.title === DEMO_LANDING_PAGE_TITLE) continue;
            expect(tourTexts, `tour links to ${page.title}`).to.contain(`[${page.title}]`);
        }
    });

    it("nests indented template lines under their parent items", () => {
        const basics = findChildByText(project.items, "Outliner Basics");
        expect(basics).to.not.equal(undefined);

        const example = findChildByText(basics!.items, "A nested example:");
        expect(example).to.not.equal(undefined);

        const parent = findChildByText(example!.items, "Parent item");
        expect(parent).to.not.equal(undefined);
        expect(childTexts(parent!.items)).to.deep.equal(["Child item", "Another child"]);

        const child = findChildByText(parent!.items, "Child item");
        expect(childTexts(child!.items)).to.deep.equal(["Grandchild item"]);
    });

    it("seeds checkbox items on the tasks page", () => {
        const tasks = findChildByText(project.items, "Checkboxes and Tasks");
        expect(tasks).to.not.equal(undefined);

        const list = findChildByText(tasks!.items, "Shopping list:");
        expect(list).to.not.equal(undefined);

        const entries = childTexts(list!.items);
        expect(entries).to.deep.equal(["[x] Milk", "[x] Bread", "[ ] Eggs", "[ ] Coffee"]);
    });

    it("seeds formatting examples covering bold, italic, strike-through and code", () => {
        const formatting = findChildByText(project.items, "Formatting");
        expect(formatting).to.not.equal(undefined);

        const examples = findChildByText(formatting!.items, "Examples:");
        expect(examples).to.not.equal(undefined);

        const texts = childTexts(examples!.items).join("\n");
        expect(texts).to.contain("[[bold]]");
        expect(texts).to.contain("[/ italic]");
        expect(texts).to.contain("[-strike through]");
        expect(texts).to.contain("`code`");
    });

    it("seeds a live chart component with a self-contained SQL query", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        expect(advanced).to.not.equal(undefined);

        const chart = findChildByText(
            advanced!.items,
            "Charts: this item renders a bar chart from a self-contained SQL query.",
        );
        expect(chart, "chart item exists").to.not.equal(undefined);
        expect(chart!.componentType).to.equal("chart");
        // The query must be fully self-contained so the chart renders with no
        // external data source.
        expect(chart!.chartQuery).to.contain("CREATE TABLE");
        expect(chart!.chartQuery).to.contain("INSERT INTO");
        expect(chart!.chartQuery!.toUpperCase()).to.contain("SELECT");
    });

    it("seeds a live table component", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        const table = findChildByText(
            advanced!.items,
            "SQL Tables: this item renders an editable, query-backed table grid.",
        );
        expect(table, "table item exists").to.not.equal(undefined);
        expect(table!.componentType).to.equal("table");
    });

    it("seeds an alias that mirrors a target item on the same page", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        const original = findChildByText(
            advanced!.items,
            "Original item: edit me and watch the alias below update.",
        );
        const alias = findChildByText(advanced!.items, "Alias (mirrors the original item above):");
        expect(original, "alias target exists").to.not.equal(undefined);
        expect(alias, "alias item exists").to.not.equal(undefined);
        expect(alias!.aliasTargetId, "alias points at the target item id").to.equal(original!.id);
    });

    it("seeds an attachment on an item", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        const attached = findChildByText(
            advanced!.items,
            "Attachments: drag and drop images or files onto an item to attach them. This item has a seeded image attachment.",
        );
        expect(attached, "attachment item exists").to.not.equal(undefined);
        expect(attached!.attachments.length).to.equal(1);
        expect(String(attached!.attachments.get(0))).to.contain("data:image/svg+xml");
    });

    it("seeds votes and a comment thread on the Comments and Votes page", () => {
        const page = findChildByText(project.items, "Comments and Votes");
        expect(page).to.not.equal(undefined);

        const voted = findChildByText(
            page!.items,
            "This item is already popular (3 votes). Click the vote button to add yours.",
        );
        expect(voted, "voted item exists").to.not.equal(undefined);
        expect(voted!.votes.toArray()).to.deep.equal(["alice", "bob", "carol"]);

        const commented = findChildByText(
            page!.items,
            "This item already has a seeded comment thread — open it to read the messages.",
        );
        expect(commented, "commented item exists").to.not.equal(undefined);
        const comments = commented!.comments.toPlain();
        expect(comments.length).to.equal(2);
        expect(comments.map(c => c.author)).to.deep.equal(["alice", "bob"]);
    });
});
