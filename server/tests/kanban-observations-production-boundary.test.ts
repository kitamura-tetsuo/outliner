import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import { restoreSqlCatalogObject } from "../../shared/src/services/sqlCatalog.js";
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
        const sourceRef = { kind: "table", id: "t", sqlName: "tasks", rowId: "r" };
        const effectiveSchema = await server!.kanbanObservations.analyzeTableEffectiveSchema({
            projectDoc,
            sourceSchema: schema,
            projectId: "p",
            tableId: "t",
            sqlName: "tasks",
            physicalColumn: "status",
        })!;
        const omittedEnum = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, projectHandle, [tableHandle]),
            tableFields: [{
                scopeId: "omitted-enum",
                owner: row,
                field: "status",
                container: tableDoc.getMap("data"),
                containerKey: "r",
                sourceRef,
                outputField: "status",
                physicalColumn: "status",
                roles: ["title"],
                effectiveSchema: { tableId: "t", sourceSchema: schema, catalogDependencies: [] } as never,
                table: {
                    projectDoc,
                    registry: projectDoc.getMap("yjsTables"),
                    tableId: "t",
                    entry: tableEntry,
                    sqlName: "tasks",
                    tableDoc,
                },
            }],
        });
        expect(omittedEnum).to.deep.equal({ available: false, reason: "source_unavailable" });
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
                    effectiveSchema,
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
        tableDoc.getText("schema").insert(0, "CREATE TABLE tasks (status text)");
        const sourceRef = { kind: "table", id: "t", sqlName: "tasks", rowId: "r" };
        const scalarSchema = await server!.kanbanObservations.analyzeTableEffectiveSchema({
            projectDoc,
            sourceSchema: tableDoc.getText("schema"),
            projectId: "p",
            tableId: "t",
            sqlName: "tasks",
            physicalColumn: "status",
        })!;
        const oldTableDoc = new Y.Doc();
        const oldData = oldTableDoc.getMap<Y.Map<unknown>>("data");
        const oldRow = new Y.Map<unknown>();
        oldRow.set("status", "todo");
        oldData.set("r", oldRow);
        const staleRawTarget = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, projectHandle, [tableHandle]),
            tableFields: [{
                scopeId: "stale-row",
                owner: oldRow,
                field: "status",
                container: oldData,
                containerKey: "r",
                sourceRef,
                outputField: "cardStatus",
                physicalColumn: "status",
                roles: ["title"],
                effectiveSchema: scalarSchema,
                table: { projectDoc, registry, tableId: "t", entry, sqlName: "tasks", tableDoc },
            }],
        });
        expect(staleRawTarget).to.deep.equal({ available: false, reason: "source_unavailable" });
        expect(projectHandle.document).not.to.equal(null);
        expect(tableHandle.document).not.to.equal(null);
        const withoutSchema = server!.kanbanObservations.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(server!.hocuspocus, projectHandle, [tableHandle]),
            tableFields: [{
                scopeId: "missing-schema",
                owner: row,
                field: "status",
                container: tableDoc.getMap("data"),
                containerKey: "r",
                sourceRef,
                outputField: "cardStatus",
                physicalColumn: "status",
                roles: ["title"],
                effectiveSchema: {
                    tableId: "t",
                    sqlName: "tasks",
                    physicalColumn: "status",
                    sourceSchema: tableDoc.getText("schema"),
                    catalogDependencies: [],
                } as never,
                table: { projectDoc, registry, tableId: "t", entry, sqlName: "tasks", tableDoc },
            }],
        });
        expect(withoutSchema).to.deep.equal({ available: false, reason: "source_unavailable" });
        expect(projectHandle.document).not.to.equal(null);
        expect(tableHandle.document).not.to.equal(null);
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
                effectiveSchema: scalarSchema,
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
