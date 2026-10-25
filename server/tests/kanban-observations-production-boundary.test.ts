import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import { replaceSqlCatalogSource, restoreSqlCatalogObject } from "../../shared/src/services/sqlCatalog.js";
import { adoptKanbanObservationLease, KanbanObservationError } from "../src/mcp/kanban-observations.js";
import { openLiveRoom } from "../src/mcp/live-room.js";
import { Project } from "../src/schema/app-schema.js";
import { AclStore, startTestServer, stopTestServer, tempDir, type TestServer } from "./server-create-table-fixture.js";

describe("Kanban observations at the persisted production boundary", function() {
    this.timeout(30_000);
    let dir: string;
    let server: TestServer | undefined;

    beforeEach(async () => {
        dir = tempDir();
        server = await startTestServer(dir, new AclStore());
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("retains a persisted room between requests with no browser connection", async () => {
        const seed = await openLiveRoom(server!.hocuspocus, "projects/p", "u", { test: "seed" });
        const seedDoc = seed.document as unknown as Y.Doc;
        createKanbanEntry(seedDoc, "k", { name: "Board", laneOrder: ["todo"] });
        await seed.disconnect();

        // This is a new production load from SQLite. Capture transfers its
        // sole direct connection; no provider or test-owned handle stays open.
        const read = await openLiveRoom(server!.hocuspocus, "projects/p", "u", { test: "read" });
        const doc = read.document as unknown as Y.Doc;
        const captured = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, read),
            definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: ["laneOrder"] },
        });
        if (!captured.available) throw new Error(captured.reason);

        expect(server!.hocuspocus.documents.get("projects/p")).to.equal(doc);
        server!.kanbanObservations.acquire("u", "p", captured.observationToken).assertCurrent({
            kind: "definition",
            kanbanId: "k",
            keys: ["laneOrder"],
        });
        await server!.kanbanObservations.release(captured.observationToken);
        expect(read.document).to.equal(null);
    });

    it("observes model row, schema, and catalog ABA through live Project/Table rooms", async () => {
        const projectHandle = await openLiveRoom(server!.hocuspocus, "projects/p", "u", { test: "project" });
        const tableHandle = await openLiveRoom(server!.hocuspocus, "projects/p/tables/t", "u", { test: "table" });
        const projectDoc = projectHandle.document as unknown as Y.Doc;
        const tableDoc = tableHandle.document as unknown as Y.Doc;
        const project = Project.fromDoc(projectDoc);
        project.addPage("Cards", "u");
        const tableEntry = new Y.Map<unknown>();
        tableEntry.set("sqlName", "tasks");
        projectDoc.getMap("yjsTables").set("t", tableEntry);
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        tableDoc.getMap("data").set("r", row);
        const schema = tableDoc.getText("schema");
        schema.insert(0, "CREATE TABLE tasks (status task_status)");
        restoreSqlCatalogObject(projectDoc, {
            id: "status-enum",
            kind: "enum",
            source: "CREATE TYPE task_status AS ENUM ('todo')",
        });
        const catalog = projectDoc.getMap<Y.Map<unknown>>("sqlCatalog");
        const sourceRef = { kind: "table", id: "t", sqlName: "tasks", rowId: "r" };
        const capture = () =>
            server!.kanbanObservations.capture({
                uid: "u",
                projectId: "p",
                kanbanId: "k",
                lease: adoptKanbanObservationLease(server!.hocuspocus, projectHandle, [tableHandle]),
                tableFields: [{
                    scopeId: "tasks:r:status",
                    owner: row,
                    field: "status",
                    container: tableDoc.getMap("data"),
                    containerKey: "r",
                    sourceRef,
                    outputField: "status",
                    physicalColumn: "status",
                    roles: ["title", "detail"],
                    table: {
                        projectDoc,
                        registry: projectDoc.getMap("yjsTables"),
                        tableId: "t",
                        entry: tableEntry,
                        sqlName: "tasks",
                        tableDoc,
                    },
                    schemaTexts: [schema],
                    dependencies: [{
                        owner: catalog.get("status-enum")!,
                        fields: ["kind", "source"],
                        container: catalog,
                        containerKey: "status-enum",
                    }],
                }],
            });
        const captured = capture();
        if (!captured.available) throw new Error(captured.reason);
        const selection = {
            kind: "table-field",
            kanbanId: "k",
            scopeId: "tasks:r:status",
            sourceRef,
            outputField: "status",
            physicalColumn: "status",
            role: "title",
        } as const;

        schema.insert(schema.length, " -- changed");
        schema.delete(schema.length - 11, 11);
        expect(() => server!.kanbanObservations.acquire("u", "p", captured.observationToken).assertCurrent(selection))
            .to.throw(KanbanObservationError, "observation_changed");

        // A separate observation proves catalog events, not the stale schema
        // guard above, are the reason the second selector is rejected.
        await server!.kanbanObservations.release(captured.observationToken);
        const secondProject = await openLiveRoom(server!.hocuspocus, "projects/p", "u", { test: "project-2" });
        const secondTable = await openLiveRoom(server!.hocuspocus, "projects/p/tables/t", "u", { test: "table-2" });
        const secondDoc = secondProject.document as unknown as Y.Doc;
        const secondTableDoc = secondTable.document as unknown as Y.Doc;
        const secondRow = secondTableDoc.getMap<Y.Map<unknown>>("data").get("r")!;
        const secondCatalog = secondDoc.getMap<Y.Map<unknown>>("sqlCatalog");
        const secondEntry = secondDoc.getMap<Y.Map<unknown>>("yjsTables").get("t")!;
        const second = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, secondProject, [secondTable]),
            tableFields: [{
                scopeId: "tasks:r:status",
                owner: secondRow,
                field: "status",
                container: secondTableDoc.getMap("data"),
                containerKey: "r",
                sourceRef,
                outputField: "status",
                physicalColumn: "status",
                roles: ["title"],
                table: {
                    projectDoc: secondDoc,
                    registry: secondDoc.getMap("yjsTables"),
                    tableId: "t",
                    entry: secondEntry,
                    sqlName: "tasks",
                    tableDoc: secondTableDoc,
                },
                schemaTexts: [secondTableDoc.getText("schema")],
                dependencies: [{
                    owner: secondCatalog.get("status-enum")!,
                    fields: ["kind", "source"],
                    container: secondCatalog,
                    containerKey: "status-enum",
                }],
            }],
        });
        if (!second.available) throw new Error(second.reason);
        replaceSqlCatalogSource(secondDoc, "status-enum", "CREATE TYPE task_status AS ENUM ('todo', 'done')");
        replaceSqlCatalogSource(secondDoc, "status-enum", "CREATE TYPE task_status AS ENUM ('todo')");
        expect(() => server!.kanbanObservations.acquire("u", "p", second.observationToken).assertCurrent(selection))
            .to.throw(KanbanObservationError, "observation_changed");
    });

    it("binds Table selectors to registry identity, route, source, and canonical role", async () => {
        const projectHandle = await openLiveRoom(server!.hocuspocus, "projects/p", "u", { test: "binding" });
        const tableHandle = await openLiveRoom(server!.hocuspocus, "projects/p/tables/t", "u", {
            test: "binding-table",
        });
        const projectDoc = projectHandle.document as unknown as Y.Doc;
        const tableDoc = tableHandle.document as unknown as Y.Doc;
        const registry = projectDoc.getMap<Y.Map<unknown>>("yjsTables");
        const entry = new Y.Map<unknown>();
        entry.set("sqlName", "tasks");
        registry.set("t", entry);
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        tableDoc.getMap("data").set("r", row);
        const sourceRef = { kind: "table", id: "t", sqlName: "tasks", rowId: "r" };
        const captured = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, projectHandle, [tableHandle]),
            tableFields: [{
                scopeId: "status",
                owner: row,
                field: "status",
                container: tableDoc.getMap("data"),
                containerKey: "r",
                sourceRef,
                outputField: "cardStatus",
                physicalColumn: "status",
                roles: ["title", "detail"],
                table: { projectDoc, registry, tableId: "t", entry, sqlName: "tasks", tableDoc },
            }],
        });
        if (!captured.available) throw new Error(captured.reason);
        const guard = server!.kanbanObservations.acquire("u", "p", captured.observationToken);
        expect(() =>
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "k",
                scopeId: "status",
                sourceRef,
                outputField: "cardStatus",
                physicalColumn: "status",
                role: "detail",
            })
        ).to.throw(
            KanbanObservationError,
            "scope_not_observed",
        );
        expect(() =>
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "k",
                scopeId: "status",
                sourceRef: { ...sourceRef, rowId: "another" },
                outputField: "cardStatus",
                physicalColumn: "status",
                role: "title",
            })
        ).to.throw(KanbanObservationError, "scope_not_observed");

        entry.set("sqlName", "other");
        entry.set("sqlName", "tasks");
        expect(() =>
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "k",
                scopeId: "status",
                sourceRef,
                outputField: "cardStatus",
                physicalColumn: "status",
                role: "title",
            })
        ).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
    });
});
