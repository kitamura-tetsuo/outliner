import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import * as Y from "yjs";
import {
    buildDemoProject,
    buildDemoScheduleRules,
    DEMO_CALENDAR_ID,
    DEMO_DAILY_RULE_ID,
    DEMO_GANTT_CALENDAR_ID,
    DEMO_HABITS_TABLE_ID,
    DEMO_HOUR_MAP_CALENDAR_ID,
    DEMO_LANDING_PAGE_TITLE,
    DEMO_PROJECT_TITLE,
    DEMO_ROUTINE_HISTORY_GRID_ID,
    DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
    DEMO_ROUTINE_TEMPLATES_TABLE_ID,
    DEMO_SALES_TABLE_ID,
    DEMO_TASKS_TABLE_ID,
    DEMO_TEMPLATE_VERSION,
    DEMO_WEEKLY_RULE_ID,
    demoCalendars,
    demoPages,
    demoRoutineTemplates,
    demoTables,
    registerDemoTables,
    routineOccurrenceSql,
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

/**
 * A visual node owns no outline text (#5015), so a Grid, Calendar or Layout is
 * found by what it binds to rather than by a caption.
 */
function findChildBy(items: Items | undefined, match: (item: Item) => boolean): Item | undefined {
    if (!items) return undefined;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (item && match(item)) return item;
    }
    return undefined;
}

function findGrid(items: Items | undefined, tableId: string): Item | undefined {
    return findChildBy(items, item => item.componentType === "yjstable" && item.yjsTableId === tableId);
}

function findCalendarBlock(items: Items | undefined, calendarId: string): Item | undefined {
    return findChildBy(items, item => item.componentType === "calendar" && item.calendarId === calendarId);
}

function findLayout(items: Items | undefined): Item | undefined {
    return findChildBy(items, item => item.componentType === "layout");
}

describe("Demo seed content", () => {
    it("the feature tour YAML specification matches the current demoPages list", () => {
        const yamlPath = path.resolve(
            __dirname,
            "../../docs/client-features/dmo-demo-project-feature-tour-7d3e9a1c.yaml",
        );
        const yamlContent = fs.readFileSync(yamlPath, "utf-8");
        const match = yamlContent.match(/The demo project is seeded with one page per feature group \((.*?)\)/);
        expect(match, "Acceptance criterion enumerating feature groups exists in YAML").to.not.equal(null);

        const specGroups = match![1].split(",").map(s => s.trim());
        const expectedGroups = demoPages
            .filter(p => p.title !== DEMO_LANDING_PAGE_TITLE)
            .map(p => p.title.toLowerCase());

        expect(specGroups).to.deep.equal(expectedGroups);
    });

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

        // The explanation is its own Text node; the Grid that follows it owns
        // no outline text at all (#5015), so it is found by its binding.
        expect(
            findChildByText(
                advanced!.items,
                "Database tables: this item embeds a live table (Yjs data, SQL queries via PGlite). "
                    + "Toggle the Chart view to render the query result as a bar chart.",
            ),
            "database table explanation exists",
        ).to.not.equal(undefined);
        const table = findGrid(advanced!.items, DEMO_SALES_TABLE_ID);
        expect(table, "database table item exists").to.not.equal(undefined);
        expect(table!.text).to.equal("");
    });

    it("seeds the current Grid clipboard guidance", () => {
        expect(DEMO_TEMPLATE_VERSION).to.equal(62);

        const advanced = findChildByText(project.items, "Advanced Features");
        expect(advanced).to.not.equal(undefined);

        const guidance = childTexts(advanced!.items).find(text => text.startsWith("Clipboard:"));
        expect(guidance).to.equal(
            "Clipboard: within one project, copying and pasting a selection that crosses a Grid creates another "
                + "live view of the same table and Data Storage. Across projects, paste instead creates an independent "
                + "Grid with a fresh identity, copied schema, UI settings, and a paste-time snapshot of its rows; conflicting SQL "
                + "names are rewritten, and Calendar blocks retain their portable settings. Press Ctrl/Cmd+Shift+V "
                + "for Paste Special: choose another live view, an independent copy with or without data, or plain values. "
                + "Unavailable choices stay visible and explain why. This public demo has only one project, so try "
                + "the same-project choices here. Cut and paste moves the view "
                + "without deleting its data. When a cross-project paste has a hidden consequence—such as copying "
                + "query dependencies, renaming SQL relations, rebinding outline_items, omitting schedule rules, or "
                + "leaving a cut table in the source—a transient summary names exactly what happened. Outside Outliner "
                + "the same copy pastes as what you see: a "
                + "spreadsheet receives the Grid's rows as cells, a document receives them as a table, and "
                + "with the Chart view open the picture travels with the numbers.",
        );
    });

    it("seeds the guidance for selecting across a block (#5024)", () => {
        const advanced = findChildByText(project.items, "Advanced Features");
        expect(advanced).to.not.equal(undefined);

        // The demo already places a Grid between two Text nodes, which is
        // exactly the selection this guidance asks the visitor to draw.
        const guidance = childTexts(advanced!.items).find(text => text.startsWith("Selecting across blocks:"));
        expect(guidance, "cross-block selection guidance exists").to.not.equal(undefined);
        expect(guidance).to.contain("one selected block");
    });

    it("seeds the visual-node endpoint selection tour (#5025)", () => {
        const selection = findChildByText(project.items, "Selection and Clipboard");
        expect(selection).to.not.equal(undefined);

        const guidance = childTexts(selection!.items).find(text =>
            text.startsWith("Visual blocks are selected atomically:")
        );
        expect(guidance, "visual endpoint guidance exists").to.not.equal(undefined);
        expect(guidance).to.contain("[Advanced Features]");
        expect(guidance).to.contain("either edge of a live Grid");
    });

    it("seeds the direct visual-node selection tour (#5026)", () => {
        const selection = findChildByText(project.items, "Selection and Clipboard");
        expect(selection).to.not.equal(undefined);

        const guidance = childTexts(selection!.items).find(text => text.startsWith("Selecting a block directly:"));
        expect(guidance, "direct block selection guidance exists").to.not.equal(undefined);
        expect(guidance).to.contain("[Advanced Features]");
        // The gutter is the outline's own selection surface: the block keeps
        // every gesture on its own content.
        expect(guidance).to.contain("gutter");
        expect(guidance).to.contain("keeps its own clicks");
        expect(guidance).to.contain("Shift+Down");
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

        expect(
            findChildByText(
                page!.items,
                "Task manager: add tasks with due dates, priorities and repeat intervals. "
                    + "Status and priority options come from the schema's CHECK constraints.",
            ),
            "task manager explanation exists",
        ).to.not.equal(undefined);
        const tasks = findGrid(page!.items, DEMO_TASKS_TABLE_ID);
        expect(tasks, "task manager item exists").to.not.equal(undefined);
        expect(tasks!.text).to.equal("");

        expect(
            findChildByText(
                page!.items,
                "Habit tracker: one table holds habit definitions and daily completion logs. "
                    + "Add a log row for today to extend a streak.",
            ),
            "habit tracker explanation exists",
        ).to.not.equal(undefined);
        const habits = findGrid(page!.items, DEMO_HABITS_TABLE_ID);
        expect(habits, "habit tracker item exists").to.not.equal(undefined);
        expect(habits!.text).to.equal("");
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

    it("seedDemoTableDoc writes schema and data into a table doc (Grid state lives on the project)", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_SALES_TABLE_ID)!;
        const doc = new Y.Doc();
        seedDemoTableDoc(doc, template);

        expect(doc.getText("schema").toString()).to.equal(template.schemaSql);
        // The Table subdoc no longer owns SELECT/component state. Grid state is
        // seeded by registerDemoTables into the project doc's yjsGrids map.
        expect(doc.getMap("ui").size).to.equal(0);

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

    it("registerDemoTables seeds one Grid per demo Table into the project doc", () => {
        const projectDoc = new Y.Doc();
        registerDemoTables(projectDoc, "demo", "en");
        const grids = projectDoc.getMap<Y.Map<unknown>>("yjsGrids");
        for (const template of demoTables) {
            const grid = grids.get(`${template.tableId}-grid`);
            expect(grid, `Grid seeded for ${template.tableId}`).to.not.equal(undefined);
            expect(grid!.get("sourceTableId")).to.equal(template.tableId);
            expect(grid!.get("query")).to.equal(template.query);
            const components = grid!.get("components") as Y.Map<Y.Map<unknown>>;
            expect(components).to.be.instanceOf(Y.Map);
            for (const [column, def] of Object.entries(template.components)) {
                const type = typeof def === "string" ? def : def.type;
                expect(components.get(column)!.get("type")).to.equal(type);
            }
        }
    });

    // Issue #5012: a Table may carry several Grids, and none of them is "the
    // table". The occurrences table seeds a second one so the Table page's
    // reference list is visibly a list rather than a single implied Grid.
    it("registerDemoTables seeds every extra Grid a Table declares", () => {
        const projectDoc = new Y.Doc();
        registerDemoTables(projectDoc, "demo", "en");
        const grids = projectDoc.getMap<Y.Map<unknown>>("yjsGrids");

        const history = grids.get(DEMO_ROUTINE_HISTORY_GRID_ID);
        expect(history, "second Grid over the occurrences Table").to.not.equal(undefined);
        expect(history!.get("sourceTableId")).to.equal(DEMO_ROUTINE_OCCURRENCES_TABLE_ID);

        const overOccurrences: string[] = [];
        grids.forEach((grid, gridId) => {
            if (grid.get("sourceTableId") === DEMO_ROUTINE_OCCURRENCES_TABLE_ID) overOccurrences.push(gridId);
        });
        expect(overOccurrences.sort()).to.deep.equal(
            [`${DEMO_ROUTINE_OCCURRENCES_TABLE_ID}-grid`, DEMO_ROUTINE_HISTORY_GRID_ID].sort(),
        );

        // The two Grids are independent presentations of one Table.
        const dflt = grids.get(`${DEMO_ROUTINE_OCCURRENCES_TABLE_ID}-grid`)!;
        expect(history!.get("query")).to.not.equal(dflt.get("query"));
    });

    it("seeds votes and a comment thread on the Comments and Votes page", () => {
        const page = findChildByText(project.items, "Comments and Votes");
        expect(page).to.not.equal(undefined);

        const voted = findChildByText(
            page!.items,
            "This item is already popular (3 votes). Click the vote count button or right-click to add yours.",
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

    it("seeds nested sharing and publishing details with links", () => {
        const page = findChildByText(project.items, "Publishing and Sharing");
        expect(page).to.not.equal(undefined);

        const sharing = findChildByText(
            page!.items,
            "Sharing: generate a read-only token to share a project without giving edit access.",
        );
        expect(sharing).to.not.equal(undefined);
        expect(childTexts(sharing!.items)).to.deep.equal([
            "Tokens are generated in the Project Settings (gear icon in the top right).",
        ]);

        const schedule = findChildByText(
            page!.items,
            "Scheduled publishing: schedule a page to be published automatically at a later time.",
        );
        expect(schedule).to.not.equal(undefined);
        expect(childTexts(schedule!.items)).to.deep.equal([
            "The [/demo/Publishing and Sharing/schedule] page lists upcoming publishing tasks and lets you edit or cancel them.",
        ]);

        const snapshots = findChildByText(
            page!.items,
            "Snapshots: the snapshot diff viewer shows how a page changed compared to earlier versions.",
        );
        expect(snapshots).to.not.equal(undefined);
        expect(childTexts(snapshots!.items)).to.deep.equal([
            "View this page's [/demo/Publishing and Sharing/diff] to see snapshots.",
        ]);
    });

    it("seeds the Recurring Tasks page with the templates and the occurrences table", () => {
        const page = findChildByText(project.items, "Recurring Tasks");
        expect(page, "Recurring Tasks page exists").to.not.equal(undefined);

        expect(
            findChildByText(
                page!.items,
                "The recurring task definitions. Add a row here and the next run of the matching rule "
                    + "starts generating its occurrences.",
            ),
            "routine templates explanation exists",
        ).to.not.equal(undefined);
        const templatesItem = findGrid(page!.items, DEMO_ROUTINE_TEMPLATES_TABLE_ID);
        expect(templatesItem, "routine templates table item exists").to.not.equal(undefined);
        expect(templatesItem!.text).to.equal("");

        expect(
            findChildByText(
                page!.items,
                "Tick a checkbox to complete today's (or this week's) task. "
                    + "Tomorrow's run adds a fresh, unchecked occurrence that replaces it in this view.",
            ),
            "routine occurrences explanation exists",
        ).to.not.equal(undefined);
        const occurrencesItem = findGrid(page!.items, DEMO_ROUTINE_OCCURRENCES_TABLE_ID);
        expect(occurrencesItem, "routine occurrences table item exists").to.not.equal(undefined);
        expect(occurrencesItem!.text).to.equal("");
    });

    it("keeps the task definitions and their occurrences in two separate tables", () => {
        const templates = demoTables.find((t) => t.tableId === DEMO_ROUTINE_TEMPLATES_TABLE_ID)!;
        const occurrencesTable = demoTables.find((t) => t.tableId === DEMO_ROUTINE_OCCURRENCES_TABLE_ID)!;

        // Two tables, two SQL names, and neither carries the other's columns.
        expect(templates.sqlName).to.equal("routine_templates");
        expect(occurrencesTable.sqlName).to.equal("routine_occurrences");
        expect(templates.schemaSql).to.not.contain("occurrence_date");
        expect(templates.schemaSql).to.not.contain("done");
        // The discriminator column of the former single table is gone.
        expect(templates.schemaSql).to.not.contain("kind");
        expect(occurrencesTable.schemaSql).to.not.contain("kind");

        expect(templates.records.map((r) => r.id)).to.deep.equal(
            demoRoutineTemplates.map((t) => t.id),
        );
        expect(
            demoRoutineTemplates.some((t) => t.cadence === "daily")
                && demoRoutineTemplates.some((t) => t.cadence === "weekly"),
            "both cadences are demonstrated",
        ).to.equal(true);
    });

    it("the occurrences table seeds a history of two occurrences per task", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_ROUTINE_OCCURRENCES_TABLE_ID)!;
        const occurrences = template.records;

        // Two occurrences per task, so the display query has something to hide.
        expect(occurrences.length).to.equal(demoRoutineTemplates.length * 2);
        for (const definition of demoRoutineTemplates) {
            const mine = occurrences.filter((r) => r.values.template_id === definition.id);
            expect(mine.length, `${definition.id} has a history`).to.equal(2);
            // The id identifies the occurrence: task identity + its date.
            for (const record of mine) {
                expect(record.id).to.equal(`${definition.id}-${record.values.occurrence_date}`);
            }
        }

        // The checkbox column is a real boolean the grid can toggle.
        expect(template.components.done).to.equal("checkbox");
        expect(template.schemaSql).to.contain("done BOOLEAN");
    });

    it("the occurrences query keeps only the newest occurrence per task and stays editable", () => {
        const template = demoTables.find((t) => t.tableId === DEMO_ROUTINE_OCCURRENCES_TABLE_ID)!;

        expect(template.query).to.contain("NOT EXISTS");
        expect(template.query).to.contain("later.template_id = r.template_id");
        expect(template.query).to.contain("later.occurrence_date > r.occurrence_date");
        // DISTINCT / GROUP BY / aggregates would make the grid read-only, so
        // the checkbox could no longer be ticked (see queryAnalysis.ts).
        expect(/\bdistinct\b/i.test(template.query)).to.equal(false);
        expect(/\bgroup\s+by\b/i.test(template.query)).to.equal(false);
        expect(/\bjoin\b/i.test(template.query)).to.equal(false);
        expect(/\b(count|sum|avg|min|max)\s*\(/i.test(template.query)).to.equal(false);
        expect(template.query).to.contain("SELECT id,");
    });

    it("seeds a daily and a weekly schedule rule targeting the occurrences table", () => {
        const schedules = project.ydoc.getMap("schedules");
        expect(schedules.size).to.equal(2);

        for (const rule of buildDemoScheduleRules()) {
            const ruleMap = schedules.get(rule.ruleId) as Y.Map<unknown> | undefined;
            expect(ruleMap, `rule ${rule.ruleId} is registered`).to.not.equal(undefined);
            expect(ruleMap!.get("targetTableId")).to.equal(DEMO_ROUTINE_OCCURRENCES_TABLE_ID);
            expect(ruleMap!.get("enabled")).to.equal(true);
            expect(ruleMap!.get("timezone")).to.equal("UTC");
            // dtstart is a local wall-clock string at midnight.
            expect(String(ruleMap!.get("dtstart"))).to.match(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
        }

        const daily = schedules.get(DEMO_DAILY_RULE_ID) as Y.Map<unknown>;
        const weekly = schedules.get(DEMO_WEEKLY_RULE_ID) as Y.Map<unknown>;
        expect(daily.get("rrule")).to.equal("RRULE:FREQ=DAILY");
        expect(weekly.get("rrule")).to.equal("RRULE:FREQ=WEEKLY;BYDAY=MO");
        // The weekly rule starts on a Monday.
        expect(new Date(`${String(weekly.get("dtstart")).slice(0, 10)}T00:00:00Z`).getUTCDay()).to.equal(1);
    });

    it("the Schedule Rules page documents the Run now action", () => {
        const page = findChildByText(project.items, "Schedule Rules");
        expect(page, "Schedule Rules page exists").to.not.equal(undefined);

        const guidance = childTexts(page!.items).find(text => text.startsWith("Run now"));
        expect(guidance, "Run now guidance is seeded").to.not.equal(undefined);
        expect(guidance).to.contain("without waiting for the next occurrence");
        expect(guidance).to.contain("while the rule is disabled");
    });

    it("the rule SQL is valid, deterministic and idempotent by construction", () => {
        for (const cadence of ["daily", "weekly"] as const) {
            const sql = routineOccurrenceSql(cadence);
            // The rule SQL contract (shared/src/services/scheduleRuleValidation.ts):
            // a single `WITH ... INSERT ... RETURNING *` statement.
            expect(/^\s*with\b/i.test(sql), `${cadence} SQL starts with WITH`).to.equal(true);
            expect(/\binsert\b/i.test(sql), `${cadence} SQL inserts`).to.equal(true);
            expect(/\breturning\s+\*/i.test(sql), `${cadence} SQL returns the inserted rows`).to.equal(true);
            expect(sql.replace(/;\s*$/, "").includes(";"), `${cadence} SQL is one statement`).to.equal(false);
            // The scheduled occurrence, never the execution time.
            expect(sql).to.contain("current_setting('job.occurrence')");
            expect(/\bnow\s*\(\)/i.test(sql)).to.equal(false);
            // A deterministic id per task and occurrence keeps retries harmless.
            expect(sql).to.contain("ON CONFLICT (id) DO NOTHING");
            expect(sql).to.contain("t.id || '-' || to_char(");
            expect(sql).to.contain(`t.cadence = '${cadence}'`);
            // The rule reads the definitions from the templates table and
            // writes into the occurrences one.
            expect(sql).to.contain("INSERT INTO routine_occurrences");
            expect(sql).to.contain("FROM routine_templates t");
        }
    });

    it("seeds a live calendar component bound to the demo calendar", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        expect(calendarsPage).to.not.equal(undefined);

        expect(
            findChildByText(
                calendarsPage!.items,
                "A calendar over this project's outline items, already assigned title/start/all-day/duration/due roles "
                    + "and grouped by tags. Try dragging the entries below, or click **Settings** to change the query or reassign a role.",
            ),
            "calendar explanation exists",
        ).to.not.equal(undefined);
        const calendarItem = findCalendarBlock(calendarsPage!.items, DEMO_CALENDAR_ID);
        expect(calendarItem, "calendar item exists").to.not.equal(undefined);
        expect(calendarItem!.text).to.equal("");
    });

    it("registers the demo calendar in the project doc's calendars map", () => {
        const calendars = project.ydoc.getMap("calendars");
        expect(calendars.size).to.equal(demoCalendars.length);

        for (const template of demoCalendars) {
            const calendarMap = calendars.get(template.calendarId) as Y.Map<unknown> | undefined;
            expect(calendarMap, `calendar ${template.calendarId} is registered`).to.not.equal(undefined);
            expect(calendarMap!.get("name")).to.equal(template.name);
            expect(calendarMap!.get("query")).to.equal(template.query);
            expect(calendarMap!.get("viewType")).to.equal(template.viewType ?? "week");
            expect(calendarMap!.get("roleTitle")).to.equal(template.roleTitle);
            expect(calendarMap!.get("roleStart")).to.equal(template.roleStart);
            expect(calendarMap!.get("roleAllDay")).to.equal(template.roleAllDay);
            expect(calendarMap!.get("roleDuration")).to.equal(template.roleDuration);
            expect(calendarMap!.get("roleDue")).to.equal(template.roleDue);
            const groupAxes = calendarMap!.get("groupAxes") as Y.Array<string>;
            expect(groupAxes.toArray()).to.deep.equal(template.groupAxes ?? []);
        }
    });

    it("seeds concrete calendar entries on the Calendars page so the grid views have something to draw", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        expect(calendarsPage).to.not.equal(undefined);

        const timed = findChildByText(calendarsPage!.items, "Scheduled today");
        expect(timed, "timed entry exists").to.not.equal(undefined);
        expect(timed!.allDay).to.equal(false);
        expect(timed!.start).to.be.a("string");
        expect(timed!.duration).to.equal("PT30M");

        const allDay = findChildByText(calendarsPage!.items, "All-day conference");
        expect(allDay, "all-day entry exists").to.not.equal(undefined);
        expect(allDay!.allDay).to.equal(true);
        expect(allDay!.duration).to.equal("P2D");

        const dueOnly = findChildByText(
            calendarsPage!.items,
            "Deadline only, no start — renders as a marker, not a block",
        );
        expect(dueOnly, "due-only entry exists").to.not.equal(undefined);
        expect(dueOnly!.due).to.be.a("string");
        expect(dueOnly!.start).to.equal(undefined);
    });

    it("the demo calendar's query is a plain, addressable SELECT (source_kind/source_id present)", () => {
        const template = demoCalendars[0];
        expect(/\bjoin\b/i.test(template.query)).to.equal(false);
        expect(/\bgroup\s+by\b/i.test(template.query)).to.equal(false);
        // The value must be the reserved relation name (ITEMS_RELATION_NAME),
        // not a descriptive label — that is what a drag/drop write resolves
        // against (client's tableEngine.ts resolveRelationInternal).
        expect(template.query).to.contain("'outline_items' AS source_kind");
        expect(template.query).to.contain("id AS source_id");
        expect(template.query).to.contain("FROM outline_items");
    });

    it("seeds a live Gantt calendar component (#4350) whose query selects parent_id and the reserved source_kind", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        expect(calendarsPage).to.not.equal(undefined);

        expect(findChildByText(calendarsPage!.items, "Project plan"), "gantt heading exists")
            .to.not.equal(undefined);
        const ganttItem = findCalendarBlock(calendarsPage!.items, DEMO_GANTT_CALENDAR_ID);
        expect(ganttItem, "gantt calendar item exists").to.not.equal(undefined);
        expect(ganttItem!.text).to.equal("");

        const template = demoCalendars.find((t) => t.calendarId === DEMO_GANTT_CALENDAR_ID);
        expect(template, "gantt calendar template exists").to.not.equal(undefined);
        expect(template!.viewType).to.equal("gantt");
        expect(template!.query).to.contain("parent_id");
        // The reserved relation name itself, not an arbitrary label — a write
        // must resolve back to `outline_items` via `resolveRelation`.
        expect(template!.query).to.contain("'outline_items' AS source_kind");
    });

    it("seeds a live Hour Map calendar component (#4972) on the same entries as the tasks calendar", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        expect(calendarsPage).to.not.equal(undefined);

        expect(findChildByText(calendarsPage!.items, "Today by the hour"), "hour map heading exists")
            .to.not.equal(undefined);
        const hourMapItem = findCalendarBlock(calendarsPage!.items, DEMO_HOUR_MAP_CALENDAR_ID);
        expect(hourMapItem, "hour map calendar item exists").to.not.equal(undefined);
        expect(hourMapItem!.text).to.equal("");

        const template = demoCalendars.find((t) => t.calendarId === DEMO_HOUR_MAP_CALENDAR_ID);
        expect(template, "hour map calendar template exists").to.not.equal(undefined);
        // A distinct stored view type, never an overloaded "day".
        expect(template!.viewType).to.equal("hours");
        expect(template!.query).to.contain("'outline_items' AS source_kind");
        expect(template!.roleStart).to.equal("start_at");
        expect(template!.roleDuration).to.equal("duration");
    });

    it("seeds a nested demo hierarchy so a parent's Gantt bar can roll up from its children", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        const launchPlan = findChildByText(calendarsPage!.items, "Launch plan");
        expect(launchPlan, "launch plan parent exists").to.not.equal(undefined);
        expect(launchPlan!.due).to.be.a("string");
        expect(launchPlan!.start).to.equal(undefined);

        const design = findChildByText(launchPlan!.items, "Design");
        const build = findChildByText(launchPlan!.items, "Build");
        const test = findChildByText(launchPlan!.items, "Test");
        expect(design, "Design child exists").to.not.equal(undefined);
        expect(build, "Build child exists").to.not.equal(undefined);
        expect(test, "Test child exists").to.not.equal(undefined);
        expect(design!.start).to.be.a("string");
        expect(build!.start).to.be.a("string");

        // A grandchild, to exercise the recursive roll-up (a grandchild's
        // span must reach all the way up to "Launch plan").
        const backend = findChildByText(build!.items, "Backend");
        const frontend = findChildByText(build!.items, "Frontend");
        expect(backend, "Backend grandchild exists").to.not.equal(undefined);
        expect(frontend, "Frontend grandchild exists").to.not.equal(undefined);
    });

    it("the demo calendar's query returns tags, matching its tags group axis (#4348)", () => {
        const template = demoCalendars[0];
        expect(template.query).to.contain("tags");
        expect(template.groupAxes).to.deep.equal(["tags"]);
    });

    it("seeds tags on the Calendars page entries so grouping lanes have something to show (#4348)", () => {
        const calendarsPage = findChildByText(project.items, "Calendars");
        expect(calendarsPage).to.not.equal(undefined);

        const timed = findChildByText(calendarsPage!.items, "Scheduled today");
        expect(timed!.tags).to.deep.equal(["work"]);

        const allDay = findChildByText(calendarsPage!.items, "All-day conference");
        expect(allDay!.tags).to.deep.equal(["work", "travel"]);
    });

    it("seeds a Layout page whose container arranges a Grid and a Calendar side by side (#4997)", () => {
        const layoutPage = findChildByText(project.items, "Layout");
        expect(layoutPage, "Layout page exists").to.not.equal(undefined);

        // The heading is an ordinary Text node placed before the Layout; the
        // Layout itself and its children own no outline text (#5015).
        expect(
            findChildByText(layoutPage!.items, "A dashboard: sales next to the week's schedule."),
            "layout heading exists",
        ).to.not.equal(undefined);
        const layout = findLayout(layoutPage!.items);
        expect(layout, "layout container exists").to.not.equal(undefined);
        expect(layout!.text).to.equal("");
        // The container itself carries no placement metadata.
        expect(layout!.columnSpan).to.equal(undefined);

        expect(childTexts(layout!.items)).to.deep.equal(["", ""]);

        const grid = findGrid(layout!.items, DEMO_SALES_TABLE_ID);
        expect(grid, "layout grid child exists").to.not.equal(undefined);
        expect(grid!.columnSpan).to.equal(6);

        const calendar = findCalendarBlock(layout!.items, DEMO_CALENDAR_ID);
        expect(calendar, "layout calendar child exists").to.not.equal(undefined);
        expect(calendar!.columnSpan).to.equal(6);
    });
});
