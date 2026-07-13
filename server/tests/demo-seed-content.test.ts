import { expect } from "chai";
import * as Y from "yjs";
import {
    buildDemoProject,
    DEMO_HABITS_TABLE_ID,
    DEMO_LANDING_PAGE_TITLE,
    DEMO_PROJECT_TITLE,
    DEMO_SALES_TABLE_ID,
    DEMO_TASKS_TABLE_ID,
    demoPages,
    demoTables,
    seedDemoTableDoc,
} from "../src/demo-content.js";
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
        expect(pageTitles.length).to.be.greaterThanOrEqual(7);
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

    it("seeds a live database table component bound to the sales demo table", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        expect(advanced).to.not.equal(undefined);

        const table = findChildByText(
            advanced!.items,
            "Database tables: this item embeds a live table (Yjs data, SQL queries via PGlite). "
                + "Toggle the Chart view to render the query result as a bar chart.",
        );
        expect(table, "database table item exists").to.not.equal(undefined);
        expect(table!.componentType).to.equal("yjstable");
        expect(table!.yjsTableId).to.equal(DEMO_SALES_TABLE_ID);
    });

    it("registers every demo table in the project doc registry", () => {
        const registry = project.ydoc.getMap("yjsTables");
        for (const template of demoTables) {
            const entry = registry.get(template.tableId) as Y.Map<unknown> | undefined;
            expect(entry, `registry entry for ${template.tableId}`).to.not.equal(undefined);
            expect(entry!.get("name")).to.equal(template.name);
            expect(entry!.get("doc")).to.be.instanceOf(Y.Doc);
        }
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

    it("seeds task and habit tables as presets of the database table feature", () => {
        const page = findChildByText(project.items, "Tasks and Habits");
        expect(page, "Tasks and Habits page exists").to.not.equal(undefined);

        const tasks = findChildByText(
            page!.items,
            "Task manager: add tasks with due dates, priorities and repeat intervals. "
                + "Status and priority options come from the schema's CHECK constraints.",
        );
        expect(tasks, "task manager item exists").to.not.equal(undefined);
        expect(tasks!.componentType).to.equal("yjstable");
        expect(tasks!.yjsTableId).to.equal(DEMO_TASKS_TABLE_ID);

        const habits = findChildByText(
            page!.items,
            "Habit tracker: one table holds habit definitions and daily completion logs. "
                + "Add a log row for today to extend a streak.",
        );
        expect(habits, "habit tracker item exists").to.not.equal(undefined);
        expect(habits!.componentType).to.equal("yjstable");
        expect(habits!.yjsTableId).to.equal(DEMO_HABITS_TABLE_ID);
    });

    it("task template seeds recurrence, completion and registration times", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_TASKS_TABLE_ID)!;
        expect(template.schemaSql).to.contain("CREATE TABLE tasks");
        expect(template.records.length).to.be.greaterThanOrEqual(5);
        expect(
            template.records.some((r) => typeof r.values.repeat_days === "number"),
            "a recurring task is seeded",
        ).to.equal(true);
        expect(
            template.records.some((r) => r.values.status === "done" && r.values.completed_at !== null),
            "a completed task with a completion timestamp is seeded",
        ).to.equal(true);
        expect(
            template.records.every((r) => typeof r.values.created_at === "string"),
            "every task records its registration time",
        ).to.equal(true);
    });

    it("habit template seeds definitions and completion logs", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_HABITS_TABLE_ID)!;
        const definitions = template.records.filter((r) => r.values.kind === "habit");
        const logs = template.records.filter((r) => r.values.kind === "log");
        expect(definitions.length).to.be.greaterThanOrEqual(2);
        expect(
            definitions.some((r) => Number(r.values.interval_days) > 1),
            "an interval habit is seeded",
        ).to.equal(true);
        expect(logs.length).to.be.greaterThanOrEqual(3);
        const definitionIds = new Set(definitions.map((r) => r.id));
        expect(
            logs.every((r) => definitionIds.has(String(r.values.habit_id))),
            "every log belongs to a seeded habit",
        ).to.equal(true);
    });

    it("seedDemoTableDoc writes the three table structures into a table doc", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_SALES_TABLE_ID)!;
        const doc = new Y.Doc();
        seedDemoTableDoc(doc, template);

        expect(doc.getText("schema").toString()).to.equal(template.schemaSql);
        const ui = doc.getMap("ui");
        expect(ui.get("query")).to.equal(template.query);
        const components = ui.get("components") as Y.Map<Y.Map<unknown>>;
        expect(components.get("revenue")!.get("type")).to.equal("number");

        const data = doc.getMap("data");
        expect(data.size).to.equal(template.records.length);
        const first = data.get(template.records[0].id) as Y.Map<unknown>;
        expect(first).to.be.instanceOf(Y.Map);
        expect(first.get("id")).to.equal(template.records[0].id);
        expect(first.get("month")).to.equal(template.records[0].values.month);

        // Re-seeding replaces the records instead of duplicating them.
        seedDemoTableDoc(doc, template);
        expect(doc.getMap("data").size).to.equal(template.records.length);
    });

    it("seeds votes and a comment thread on the Comments and Votes page", () => {
        const page = findChildByText(project.items, "Comments and Votes");
        expect(page).to.not.equal(undefined);

        const voted = findChildByText(
            page!.items,
            "This item is already popular (3 votes). Click the vote button to add yours.",
        );
        expect(voted, "voted item exists").to.not.equal(undefined);
        expect(voted!.votes.toArray()).to.deep.equal(["Alice", "Bob", "Carol"]);

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
