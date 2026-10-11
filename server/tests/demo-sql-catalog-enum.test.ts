import { expect } from "chai";
import * as Y from "yjs";
import {
    buildDemoProject,
    DEMO_FEEDBACK_SENTIMENT_CATALOG_ID,
    DEMO_FEEDBACK_SENTIMENT_SOURCE,
    DEMO_FEEDBACK_SENTIMENT_TYPE_NAME,
    DEMO_FEEDBACK_TABLE_ID,
    demoCatalogTypesFor,
    demoTablesFor,
    effectiveDemoTemplate,
    registerDemoCatalogTypes,
    seedDemoTableDoc,
} from "../src/demo-content.js";
import type { Item, Items } from "../src/schema/app-schema.js";

function findChildByText(items: Items | undefined, text: string): Item | undefined {
    if (!items) return undefined;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (item && item.text === text) return item;
    }
    return undefined;
}

function findGrid(items: Items | undefined, tableId: string): Item | undefined {
    if (!items) return undefined;
    for (let i = 0; i < items.length; i++) {
        const item = items.at(i);
        if (item && item.componentType === "yjstable" && item.yjsTableId === tableId) return item;
    }
    return undefined;
}

describe("Demo SQL catalog ENUM", () => {
    it("registers the feedback_sentiment type in the project sqlCatalog map", () => {
        const projectDoc = new Y.Doc();
        registerDemoCatalogTypes(projectDoc);
        const catalog = projectDoc.getMap("sqlCatalog");
        const entry = catalog.get(DEMO_FEEDBACK_SENTIMENT_CATALOG_ID) as Y.Map<unknown> | undefined;
        expect(entry, "catalog entry exists").to.not.equal(undefined);
        expect(entry!.get("source")).to.equal(DEMO_FEEDBACK_SENTIMENT_SOURCE);
        expect(DEMO_FEEDBACK_SENTIMENT_SOURCE).to.contain(
            `CREATE TYPE ${DEMO_FEEDBACK_SENTIMENT_TYPE_NAME} AS ENUM`,
        );

        // A reseed replaces the entry instead of adding a copy.
        registerDemoCatalogTypes(projectDoc);
        expect(catalog.size).to.equal(demoCatalogTypesFor("en").length);
    });

    it("seeds a Feedback table whose schema uses the catalog type", () => {
        const template = demoTablesFor("en").find((t) => t.tableId === DEMO_FEEDBACK_TABLE_ID)!;
        expect(template, "feedback template exists").to.not.equal(undefined);
        expect(template.sqlName).to.equal("feedback");
        expect(template.schemaSql).to.contain(`sentiment ${DEMO_FEEDBACK_SENTIMENT_TYPE_NAME} NOT NULL`);
        expect(template.records.length).to.be.greaterThanOrEqual(3);
        const labels = ["positive", "neutral", "negative"];
        for (const record of template.records) {
            expect(labels, `label of ${record.id}`).to.include(String(record.values.sentiment));
        }
    });

    it("seedDemoTableDoc writes the feedback schema and records into a table doc", () => {
        const template = demoTablesFor("en").find((t) => t.tableId === DEMO_FEEDBACK_TABLE_ID)!;
        const doc = new Y.Doc();
        seedDemoTableDoc(doc, template);
        expect(doc.getText("schema").toString()).to.equal(template.schemaSql);
        expect(doc.getMap("data").size).to.equal(template.records.length);
    });

    it("builds the demo project with the catalog entry, the table and the SQL Catalog page", () => {
        const project = buildDemoProject("seed-test");
        const catalog = project.ydoc.getMap("sqlCatalog");
        expect(
            (catalog.get(DEMO_FEEDBACK_SENTIMENT_CATALOG_ID) as Y.Map<unknown> | undefined)
                ?.get("source"),
        ).to.equal(DEMO_FEEDBACK_SENTIMENT_SOURCE);

        const tables = project.ydoc.getMap("yjsTables");
        expect(tables.has(DEMO_FEEDBACK_TABLE_ID), "feedback table registered").to.equal(true);
        const grids = project.ydoc.getMap("yjsGrids");
        expect(
            grids.get(`${DEMO_FEEDBACK_TABLE_ID}-grid`),
            "feedback grid seeded alongside the table",
        ).to.not.equal(undefined);

        const page = findChildByText(project.items, "SQL Catalog");
        expect(page, "SQL Catalog page exists").to.not.equal(undefined);
        const grid = findGrid(page!.items, DEMO_FEEDBACK_TABLE_ID);
        expect(grid, "SQL Catalog page embeds the Feedback grid").to.not.equal(undefined);
        expect(grid!.text).to.equal("");
    });

    it("keeps the catalog type identical across locales and inside the template fingerprint", () => {
        for (const locale of ["en", "ja"] as const) {
            expect(demoCatalogTypesFor(locale).map((t) => t.catalogId)).to.deep.equal(
                demoCatalogTypesFor("en").map((t) => t.catalogId),
            );
            expect(demoCatalogTypesFor(locale).map((t) => t.source)).to.deep.equal(
                demoCatalogTypesFor("en").map((t) => t.source),
            );
        }
        const template = effectiveDemoTemplate();
        for (const demoProject of template.projects) {
            expect(
                demoProject.catalogTypes.map((t) => t.catalogId),
                `${demoProject.slug} catalog types`,
            ).to.contain(DEMO_FEEDBACK_SENTIMENT_CATALOG_ID);
            const registries = demoProject.registries as Record<string, unknown>;
            expect(registries, `${demoProject.slug} registries include the catalog`).to.have.property(
                "sqlCatalog",
            );
        }
    });
});
