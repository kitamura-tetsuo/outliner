import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter, resetDemoWarmState } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_REVISION } from "../src/demo-content.js";
import { populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

describe("Demo API", () => {
    let mockHocuspocus: any;
    let mockDoc: Y.Doc;
    let mockDirectConnection: any;

    beforeEach(async () => {
        resetDemoWarmState();
        mockDoc = new Y.Doc();
        const metadata = mockDoc.getMap("metadata");
        metadata.set("lastReset", Date.now());
        metadata.set("templateRevision", DEMO_TEMPLATE_REVISION);

        // Populate tree using app-schema logic so it passes "missingTemplatePages" check
        const project = Project.fromDoc(mockDoc as any);
        populateDemoProject(project, "test-user");

        mockDirectConnection = {
            document: mockDoc,
            transact: jest.fn((cb: any) => cb(mockDoc)),
            disconnect: jest.fn(),
        };

        mockHocuspocus = {
            openDirectConnection: jest.fn().mockResolvedValue(mockDirectConnection),
        };
    });

    it("should reset empty document", async () => {
        const emptyDoc = new Y.Doc();
        emptyDoc.getMap("metadata").set("lastReset", Date.now());
        emptyDoc.getMap("metadata").set("templateRevision", DEMO_TEMPLATE_REVISION);

        mockDirectConnection.document = emptyDoc;
        mockDirectConnection.transact = jest.fn((cb: any) => cb(emptyDoc));

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);
        expect(response.body.success).toBe(true);

        const metadata = emptyDoc.getMap("metadata");
        expect(metadata.get("title")).toBe(DEMO_PROJECT_TITLE);
        expect(mockDirectConnection.disconnect).toHaveBeenCalled();
    });

    it("should clear visitor-created grids and restore template grids to template definitions", async () => {
        const { Project } = await import("../src/schema/app-schema.js");
        const { populateDemoProject, demoTablesFor, demoGridIdFor } = await import("../src/demo-content.js");
        const demoTables = demoTablesFor("en");

        mockDoc.transact(() => {
            const project = Project.fromDoc(mockDoc);
            populateDemoProject(project, "test-user");

            // Mutate template grids
            const yjsGrids = mockDoc.getMap("yjsGrids") as Y.Map<Y.Map<unknown>>;
            for (const template of demoTables) {
                const gridId = demoGridIdFor(template.tableId);
                const gridEntry = yjsGrids.get(gridId);
                if (gridEntry) {
                    // modify it to differ from template
                    gridEntry.set("queryText", "SELECT * FROM somewhere_else");
                    gridEntry.set("columns", [{ name: "mutated", width: 100 }]);
                }
            }

            // Add visitor created grid
            const visitorGrid = new Y.Map<unknown>();
            visitorGrid.set("queryText", "SELECT * FROM visitor");
            yjsGrids.set("visitor-grid-1", visitorGrid);
        });

        // Set version old to force reset
        mockDoc.getMap("metadata").set("templateRevision", 1);

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);

        const yjsGrids = mockDoc.getMap("yjsGrids") as Y.Map<Y.Map<unknown>>;

        // Visitor grid should be gone
        expect(yjsGrids.has("visitor-grid-1")).toBe(false);

        // Seeded grids should be restored
        for (const template of demoTables) {
            const gridId = demoGridIdFor(template.tableId);
            const gridEntry = yjsGrids.get(gridId);
            expect(gridEntry).toBeDefined();
            // Should match template
            expect(gridEntry?.get("queryText")).toBe(`SELECT * FROM "${template.sqlName}"`);
        }
    });

    it("should not reset if already seeded and not expired", async () => {
        const { Project } = await import("../src/schema/app-schema.js");
        const { populateDemoProject } = await import("../src/demo-content.js");

        mockDoc.transact(() => {
            const project = Project.fromDoc(mockDoc);
            populateDemoProject(project);
        });

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(false);
        expect(response.body.success).toBe(true);
    });

    it("should reset if template version changed", async () => {
        // Production migration boundary: documents created by the old scheme
        // contain only the numeric templateVersion field.
        mockDoc.getMap("metadata").delete("templateRevision");
        mockDoc.getMap("metadata").set("templateVersion", 77);

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);
        expect(response.body.success).toBe(true);
        expect(mockDoc.getMap("metadata").get("templateRevision")).toBe(DEMO_TEMPLATE_REVISION);
        expect(mockDoc.getMap("metadata").has("templateVersion")).toBe(false);
        expect(
            (mockDoc.getMap("schedules").get("demo-rule-daily-routines") as Y.Map<unknown>).get(
                "sqlAliasPolicyVersion",
            ),
        ).toBe(1);
    });

    it("should selectively re-seed missing/stale table documents without full reset", async () => {
        const { Project } = await import("../src/schema/app-schema.js");
        const { populateDemoProject, demoTables } = await import("../src/demo-content.js");

        mockDoc.transact(() => {
            const project = Project.fromDoc(mockDoc);
            populateDemoProject(project);
        });

        const tableDoc = new Y.Doc();
        const mockTableConnection = {
            document: tableDoc,
            transact: jest.fn((cb: any) => cb(tableDoc)),
            disconnect: jest.fn(),
        };

        // We create a fresh mock function to return mockTableConnection specifically for this test
        // Because a singleton tableDoc doesn't update its own state between calls during the mock,
        // mockTableConnection.transact gets called as many times as there are tables, since they all
        // appear missing the version.
        mockHocuspocus.openDirectConnection = jest.fn().mockImplementation(async (room: string) => {
            if (room.includes("/tables/")) {
                return mockTableConnection;
            }
            return mockDirectConnection;
        });

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(false);
        expect(response.body.success).toBe(true);
        // Should have called transact once for each table room missing the template version
        expect(mockTableConnection.transact).toHaveBeenCalledTimes(1);
    });
});

describe("Demo API localized projects", () => {
    // The demo ships one project per locale; the endpoint seeds the room the
    // request names, with that locale's content and title.
    function makeStub() {
        const docs = new Map<string, Y.Doc>();
        const opened: string[] = [];
        const hocuspocus = {
            openDirectConnection: jest.fn(async (room: string) => {
                opened.push(room);
                let doc = docs.get(room);
                if (!doc) {
                    doc = new Y.Doc();
                    docs.set(room, doc);
                }
                const target = doc;
                return {
                    document: target,
                    transact: jest.fn((cb: any) => cb(target)),
                    disconnect: jest.fn(),
                };
            }),
        };
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(hocuspocus as any));
        return { app, docs, opened };
    }

    beforeEach(() => {
        resetDemoWarmState();
    });

    it("titles each demo document with its own slug so internal links stay inside it", async () => {
        // project.title is what renders internal links. A demo-ja document
        // titled "demo" would point every link at the English demo, at pages
        // whose Japanese titles do not exist there.
        for (const slug of ["demo", "demo-ja"]) {
            const { app, docs } = makeStub();
            const response = await request(app).post("/api/seed-demo").send({ project: slug });

            expect(response.status).toBe(200);
            expect(response.body.reset).toBe(true);
            expect(response.body.project).toBe(slug);
            expect(docs.get(`projects/${slug}`)!.getMap("metadata").get("title")).toBe(slug);
        }
    });

    it("seeds a localized demo's tables in its own rooms", async () => {
        const { app, opened } = makeStub();
        await request(app).post("/api/seed-demo").send({ project: "demo-ja" });

        const tableRooms = opened.filter(room => room.includes("/tables/"));
        expect(tableRooms.length).toBeGreaterThan(0);
        for (const room of tableRooms) {
            expect(room.startsWith("projects/demo-ja/tables/")).toBe(true);
        }
    });

    it("seeds the locale's own page titles", async () => {
        const { app, docs } = makeStub();
        await request(app).post("/api/seed-demo").send({ project: "demo-ja" });

        const project = Project.fromDoc(docs.get("projects/demo-ja")! as any);
        const titles: string[] = [];
        for (let i = 0; i < project.items.length; i++) {
            const page = project.items.at(i);
            if (page) titles.push(page.text);
        }
        expect(titles).toContain("ようこそ");
        expect(titles).not.toContain("Welcome");
    });
});
