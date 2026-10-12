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
    demoPagesFor,
    demoTablesFor,
    deriveDemoTemplateRevision,
    effectiveDemoTemplate,
    registerDemoCatalog,
} from "../src/demo-content.js";

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
