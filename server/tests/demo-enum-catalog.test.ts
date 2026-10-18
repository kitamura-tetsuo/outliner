import { expect } from "chai";
import * as Y from "yjs";
import { readSqlCatalog, replaceSqlCatalogSource } from "../../shared/src/services/sqlCatalog.js";
import { compileSqlEnvironment } from "../../shared/src/services/sqlEnvironmentCompiler.js";
import {
    buildDemoProject,
    DEMO_ENUM_OBJECT_ID,
    DEMO_ENUM_PRIORITIES_TABLE_ID,
    DEMO_ENUM_SOURCE,
    DEMO_LANDING_PAGE_KEY,
    DEMO_TASKS_PRIORITY_GRID_ID,
    DEMO_TASKS_TABLE_ID,
    demoCatalogFor,
    demoGridIdFor,
    demoPagesFor,
    demoTablesFor,
    deriveDemoTemplateRevision,
    effectiveDemoTemplate,
    registerDemoCatalog,
    registerDemoTables,
    seedDemoTableDoc,
} from "../src/demo-content.js";
import type { Item, Items } from "../src/schema/app-schema.js";

function descendantItems(items: Items | undefined): Item[] {
    const found: Item[] = [];
    if (!items) return found;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (!item) continue;
        found.push(item);
        found.push(...descendantItems(item.items));
    }
    return found;
}

// Issue #5575: the public demos seed an executable ENUM example — a
// Project-catalog TYPE, a separate Table using it, and a live Grid whose
// ordinary ORDER BY follows declaration order instead of lexical order.
describe("Demo ENUM declaration-order example", function() {
    this.timeout(60000);

    it("seeds the catalog ENUM with stable identity in both locales", () => {
        for (const slug of ["demo", "demo-ja"] as const) {
            const project = buildDemoProject("seed-test", slug);
            const read = readSqlCatalog(slug, project.ydoc as never);
            expect(read.status, slug).to.equal("ready");
            const snapshot = (read as { snapshot: { objects: { id: string; kind: string; source: string; }[]; }; })
                .snapshot;
            expect(
                snapshot.objects.filter(object => object.id === DEMO_ENUM_OBJECT_ID),
                `${slug}: exactly one seeded ENUM object`,
            ).to.have.lengthOf(1);
            expect(snapshot.objects.find(object => object.id === DEMO_ENUM_OBJECT_ID)).to.deep.equal({
                id: DEMO_ENUM_OBJECT_ID,
                kind: "enum",
                source: DEMO_ENUM_SOURCE,
            });
        }
    });

    it("shares exact SQL, enum labels and identities across locales", () => {
        expect(demoCatalogFor()).to.deep.equal([{
            id: DEMO_ENUM_OBJECT_ID,
            kind: "enum",
            source: DEMO_ENUM_SOURCE,
        }]);
        const base = demoTablesFor("en").find(table => table.tableId === DEMO_ENUM_PRIORITIES_TABLE_ID)!;
        const localized = demoTablesFor("ja").find(table => table.tableId === DEMO_ENUM_PRIORITIES_TABLE_ID)!;
        expect(base, "english ENUM table exists").to.not.equal(undefined);
        expect(localized.sqlName).to.equal(base.sqlName);
        expect(localized.schemaSql).to.equal(base.schemaSql);
        expect(localized.query).to.equal(base.query);
        expect(localized.records.map(record => record.id))
            .to.deep.equal(base.records.map(record => record.id));
    });

    it("keeps catalog registration convergent across repeated reseeds", () => {
        const doc = new Y.Doc();
        registerDemoCatalog(doc);
        registerDemoCatalog(doc);
        const read = readSqlCatalog("demo", doc as never);
        expect(read.status).to.equal("ready");
        const snapshot = (read as { snapshot: { objects: unknown[]; }; }).snapshot;
        expect(snapshot.objects).to.have.lengthOf(1);

        // A drifted source is repaired in place under the same identity.
        replaceSqlCatalogSource(
            doc as never,
            DEMO_ENUM_OBJECT_ID,
            "CREATE TYPE demo_priority AS ENUM ('low', 'medium', 'high')",
        );
        registerDemoCatalog(doc);
        const repaired = readSqlCatalog("demo", doc as never);
        expect(repaired.status).to.equal("ready");
        const objects = (repaired as { snapshot: { objects: { id: string; source: string; }[]; }; }).snapshot.objects;
        expect(objects).to.have.lengthOf(1);
        expect(objects[0].id).to.equal(DEMO_ENUM_OBJECT_ID);
        expect(objects[0].source).to.equal(DEMO_ENUM_SOURCE);
    });

    it("seeds a separate ENUM-backed table with a plain declaration-order Grid query", () => {
        const table = demoTablesFor("en").find(entry => entry.tableId === DEMO_ENUM_PRIORITIES_TABLE_ID)!;
        expect(table.sqlName).to.equal("enum_priorities");
        expect(table.schemaSql).to.contain("priority demo_priority");
        expect(table.query).to.equal("SELECT id, title, priority FROM enum_priorities ORDER BY priority, id");
        expect(table.query).to.not.contain("CASE");
        expect(table.records.map(record => String(record.values.priority))).to.have.members([
            "high",
            "medium",
            "low",
        ]);
    });

    it("sorts the seeded rows by declaration order, not lexical text order", async () => {
        const project = buildDemoProject("seed-test", "demo");
        const read = readSqlCatalog("demo", project.ydoc as never);
        expect(read.status).to.equal("ready");
        const catalog = (read as { snapshot: import("../../shared/src/services/sqlCatalog.js").SqlCatalogSnapshot; })
            .snapshot;
        const template = demoTablesFor("en").find(entry => entry.tableId === DEMO_ENUM_PRIORITIES_TABLE_ID)!;
        const compiled = await compileSqlEnvironment({
            catalog,
            tables: [{
                id: template.tableId,
                schema: template.schemaSql,
                // Production table subdocs carry `id` inside the record map
                // (see seedDemoTableDoc), so the snapshot does too.
                records: template.records.map(record => ({
                    id: record.id,
                    values: { id: record.id, ...record.values },
                })),
            }],
            inspections: [],
        });
        expect(
            compiled.status,
            compiled.status === "failed" ? JSON.stringify(compiled.diagnostics) : compiled.status,
        ).to.equal("ready");
        if (compiled.status !== "ready") return;
        try {
            const declared = await compiled.environment.query<{ priority: string; }>(
                "SELECT priority FROM enum_priorities ORDER BY priority",
            );
            expect(declared.rows.map(row => row.priority)).to.deep.equal(["high", "medium", "low"]);
            const lexical = await compiled.environment.query<{ priority: string; }>(
                "SELECT priority FROM enum_priorities ORDER BY priority::TEXT",
            );
            expect(lexical.rows.map(row => row.priority)).to.deep.equal(["high", "low", "medium"]);
            const grid = await compiled.environment.query<{ id: string; }>(
                "SELECT id, title, priority FROM enum_priorities ORDER BY priority, id",
            );
            expect(grid.rows.map(row => row.id)).to.deep.equal(["demo-enum-1", "demo-enum-3", "demo-enum-2"]);
        } finally {
            await compiled.environment.dispose();
        }
    });

    it("participates in the template fingerprint so stale demos reseed through the normal path", () => {
        const withoutCatalog = structuredClone(effectiveDemoTemplate());
        withoutCatalog.projects[0].catalog = [];
        expect(deriveDemoTemplateRevision(withoutCatalog)).to.not.equal(
            deriveDemoTemplateRevision(effectiveDemoTemplate()),
        );
        const drifted = structuredClone(effectiveDemoTemplate());
        drifted.projects[0].catalog[0].source = "CREATE TYPE demo_priority AS ENUM ('low', 'medium', 'high')";
        expect(deriveDemoTemplateRevision(drifted)).to.not.equal(
            deriveDemoTemplateRevision(effectiveDemoTemplate()),
        );
    });

    it("preserves the existing Tasks records, default Grid queries and CASE demo", () => {
        const tasks = demoTablesFor("en").find(entry => entry.tableId === DEMO_TASKS_TABLE_ID)!;
        expect(tasks.query).to.equal(
            "SELECT id, title, status, priority, due_date, repeat_days FROM tasks "
                + "ORDER BY status DESC, due_date NULLS LAST, priority",
        );
        expect(tasks.records).to.have.lengthOf(5);
        const priorityGrid = tasks.extraGrids?.find(grid => grid.gridId === DEMO_TASKS_PRIORITY_GRID_ID);
        expect(priorityGrid, "CASE-based priority grid still seeded").to.not.equal(undefined);
        expect(priorityGrid!.query).to.contain("CASE priority");
    });

    it("binds the ENUM outline block to the persisted live Grid in both locales", () => {
        const expectedGridId = demoGridIdFor(DEMO_ENUM_PRIORITIES_TABLE_ID);
        const localizedGuidance = {
            demo: ["Project catalog", "no catalog-write access"],
            "demo-ja": ["プロジェクトのカタログ", "書き込み権限は不要"],
        } as const;
        for (const slug of ["demo", "demo-ja"] as const) {
            const project = buildDemoProject("seed-test", slug);
            let enumPage: Item | undefined;
            for (let i = 0; i < project.items.length; i++) {
                const page = project.items.at(i);
                if (page && page.templatePageId === "enum ordering") enumPage = page;
            }
            expect(enumPage, `${slug}: ENUM page is seeded`).to.not.equal(undefined);

            // The live block is found through its persisted outline binding,
            // not through the table template: pointing it at another Grid (or
            // leaving it unconfigured) fails here even while template-level
            // assertions stay green.
            const blocks = descendantItems(enumPage!.items).filter(
                item => item.componentType === "yjstable",
            );
            expect(blocks, `${slug}: exactly one live Grid block`).to.have.lengthOf(1);
            expect(blocks[0].yjsTableId, `${slug}: block binds the ENUM table`).to.equal(
                DEMO_ENUM_PRIORITIES_TABLE_ID,
            );
            expect(blocks[0].yjsGridId, `${slug}: block binds the ENUM Grid`).to.equal(expectedGridId);
            expect(blocks[0].yjsGridId, `${slug}: block does not reuse the Tasks Grid`).to.not.equal(
                DEMO_TASKS_PRIORITY_GRID_ID,
            );

            const grids = project.ydoc.getMap("yjsGrids");
            const gridEntry = grids.get(expectedGridId) as Y.Map<unknown> | undefined;
            expect(gridEntry, `${slug}: ENUM Grid is registered`).to.not.equal(undefined);
            expect(gridEntry!.has("sourceTableId"), `${slug}: Grid has no primary Table owner`).to.equal(false);
            expect(gridEntry!.get("query"), `${slug}: Grid keeps the ordinary ORDER BY`).to.equal(
                "SELECT id, title, priority FROM enum_priorities ORDER BY priority, id",
            );
            expect(String(gridEntry!.get("query")), `${slug}: Grid query uses no CASE`).to.not.contain(
                "CASE",
            );

            const pageText = descendantItems(enumPage!.items).map(item => item.text).join("\n");
            expect(pageText, `${slug}: page shows the catalog source`).to.contain(DEMO_ENUM_SOURCE);
            expect(pageText, `${slug}: page shows the Grid query`).to.contain(
                "SELECT id, title, priority FROM enum_priorities ORDER BY priority, id",
            );
            for (const phrase of localizedGuidance[slug]) {
                expect(pageText, `${slug}: page carries localized guidance`).to.contain(phrase);
            }
        }
    });

    it("executes the persisted Grid query in declaration order in both locales", async () => {
        for (const slug of ["demo", "demo-ja"] as const) {
            const locale = slug === "demo-ja" ? "ja" : "en";
            const project = buildDemoProject("seed-test", slug);
            const read = readSqlCatalog(slug, project.ydoc as never);
            expect(read.status, slug).to.equal("ready");
            const catalog =
                (read as { snapshot: import("../../shared/src/services/sqlCatalog.js").SqlCatalogSnapshot; })
                    .snapshot;

            // The query under test is the Grid's own saved SELECT, and the
            // records are read back from a table subdoc seeded through the
            // production seed path — never a hand-written literal.
            const gridEntry = project.ydoc.getMap("yjsGrids").get(
                demoGridIdFor(DEMO_ENUM_PRIORITIES_TABLE_ID),
            ) as Y.Map<unknown>;
            const savedQuery = String(gridEntry.get("query"));
            const template = demoTablesFor(locale).find(
                entry => entry.tableId === DEMO_ENUM_PRIORITIES_TABLE_ID,
            )!;
            const tableDoc = new Y.Doc();
            seedDemoTableDoc(tableDoc, template);
            const data = tableDoc.getMap("data") as Y.Map<Y.Map<unknown>>;
            const records = template.records.map(record => {
                const stored = data.get(record.id);
                const values: Record<string, unknown> = { id: record.id };
                stored?.forEach((value, key) => {
                    values[key] = value;
                });
                return { id: record.id, values };
            });
            const compiled = await compileSqlEnvironment({
                catalog,
                tables: [{ id: template.tableId, schema: template.schemaSql, records }],
                inspections: [],
            });
            expect(
                compiled.status,
                compiled.status === "failed" ? JSON.stringify(compiled.diagnostics) : compiled.status,
            ).to.equal("ready");
            if (compiled.status !== "ready") return;
            try {
                const grid = await compiled.environment.query<{ id: string; }>(savedQuery);
                expect(grid.rows.map(row => row.id), `${slug}: declaration order`).to.deep.equal([
                    "demo-enum-1",
                    "demo-enum-3",
                    "demo-enum-2",
                ]);
            } finally {
                await compiled.environment.dispose();
            }
        }
    });

    it("preserves the standalone Tasks Kanban board alongside the ENUM example", () => {
        for (const slug of ["demo", "demo-ja"] as const) {
            const project = buildDemoProject("seed-test", slug);
            const kanbans = project.ydoc.getMap("yjsKanbans");
            expect([...kanbans.keys()], `${slug}: one Kanban board`).to.deep.equal([
                "demo-tasks-kanban",
            ]);
            const board = kanbans.get("demo-tasks-kanban") as Y.Map<unknown>;
            expect(board.has("sourceTableId"), `${slug}: board has no primary binding`).to.equal(false);
            expect(board.get("query"), `${slug}: board reads Tasks through SQL`).to.equal(
                "SELECT id, title, status, priority, due_date FROM tasks ORDER BY priority, id",
            );
            expect(board.get("name"), `${slug}: board name`).to.equal("Tasks by status");
            expect(board.get("groupField"), `${slug}: board groups by status`).to.equal("status");
        }

        // Repeated registration converges instead of duplicating the board.
        const doc = new Y.Doc();
        registerDemoTables(doc, "demo", "en");
        registerDemoTables(doc, "demo", "en");
        expect([...doc.getMap("yjsKanbans").keys()], "reseed converges").to.deep.equal([
            "demo-tasks-kanban",
        ]);

        // The fingerprint covers the board, so a stale demo reseeds through
        // the normal template-revision path.
        for (const registered of effectiveDemoTemplate().projects) {
            const boards = registered.registries["yjsKanbans"] as Record<string, unknown>;
            expect(boards, `${registered.slug}: fingerprint covers the board`).to.not.equal(undefined);
            expect(
                boards["demo-tasks-kanban"],
                `${registered.slug}: board survives fingerprinting`,
            ).to.not.equal(undefined);
        }
    });

    it("links the example from the feature-tour navigation of each locale", () => {
        for (const locale of ["en", "ja"] as const) {
            const pages = demoPagesFor(locale);
            const example = pages.find(page => page.key === "enum ordering");
            expect(example, `${locale}: ENUM page exists`).to.not.equal(undefined);
            const landing = pages.find(page => page.key === DEMO_LANDING_PAGE_KEY)!;
            const landingText = [...(landing.lines ?? [])].join("\n");
            expect(landingText, `${locale}: tour links to ${example!.title}`).to.contain(`[${example!.title}]`);
            const exampleText = JSON.stringify(example!.items);
            expect(exampleText, `${locale}: page shows the catalog source`).to.contain(DEMO_ENUM_SOURCE);
            expect(exampleText, `${locale}: page shows the grid query`).to.contain(
                "SELECT id, title, priority FROM enum_priorities ORDER BY priority, id",
            );
        }
    });
});
