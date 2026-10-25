import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import { replaceSqlCatalogSource, restoreSqlCatalogObject } from "../../shared/src/services/sqlCatalog.js";
import {
    adoptKanbanObservationLease,
    KanbanObservationError,
    KanbanObservationService,
} from "../src/mcp/kanban-observations.js";
import { openLiveRoom } from "../src/mcp/live-room.js";

describe("Kanban observations through production live-room handles", function() {
    this.timeout(30_000);
    let host: Hocuspocus;
    let service: KanbanObservationService;

    beforeEach(() => {
        host = new Hocuspocus({ name: "kanban-observation-test", quiet: true });
        service = new KanbanObservationService(host);
    });
    afterEach(async () => {
        await service.dispose();
        host.closeConnections();
    });

    it("retains an adopted serving room across requests and releases it", async () => {
        const connection = await openLiveRoom(host, "projects/p", "u", { test: "capture" });
        const doc = connection.document as unknown as Y.Doc;
        createKanbanEntry(doc, "k", { name: "Board", laneOrder: ["todo"] });
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: ["laneOrder"] },
        });
        if (!captured.available) throw new Error(captured.reason);

        // The read request has ended: its transferred connection is the only
        // handle retaining this exact serving document for the later request.
        expect(host.documents.get("projects/p")).to.equal(doc);
        service.acquire("u", "p", captured.observationToken).assertCurrent({
            kind: "definition",
            kanbanId: "k",
            keys: ["laneOrder"],
        });
        await service.release(captured.observationToken);
        expect(connection.document).to.equal(null);
    });

    it("rejects selected mutations synchronously inside an open Yjs transaction", async () => {
        const projectConnection = await openLiveRoom(host, "projects/p", "u", { test: "sync-project" });
        const tableConnection = await openLiveRoom(host, "projects/p/tables/t", "u", { test: "sync-table" });
        const projectDoc = projectConnection.document as unknown as Y.Doc;
        const tableDoc = tableConnection.document as unknown as Y.Doc;
        createKanbanEntry(projectDoc, "k", { name: "Board" });
        const definition = getKanbanDefinitionTarget(projectDoc, "k")!;
        const tableEntry = new Y.Map<unknown>();
        tableEntry.set("sqlName", "tasks");
        projectDoc.getMap("yjsTables").set("t", tableEntry);
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        tableDoc.getMap("data").set("r", row);
        tableDoc.getText("schema").insert(0, "CREATE TABLE tasks (status text)");
        const effectiveSchema = await service.analyzeTableEffectiveSchema({
            projectId: "p",
            projectDoc,
            tableId: "t",
            sqlName: "tasks",
            physicalColumn: "status",
            sourceSchema: tableDoc.getText("schema"),
        });
        if (!effectiveSchema) throw new Error("schema analysis failed");
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, projectConnection, [tableConnection]),
            definition: { target: definition, keys: ["name"] },
            tableFields: [{
                scopeId: "status",
                owner: row,
                field: "status",
                container: tableDoc.getMap("data"),
                containerKey: "r",
                sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r" },
                outputField: "status",
                physicalColumn: "status",
                roles: ["title"],
                effectiveSchema,
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
        if (!captured.available) throw new Error(captured.reason);
        const guard = service.acquire("u", "p", captured.observationToken);
        projectDoc.transact(() => {
            definition.entry.set("name", "Changed");
            definition.entry.set("name", "Board");
            expect(() => guard.assertCurrent({ kind: "definition", kanbanId: "k", keys: ["name"] })).to.throw(
                KanbanObservationError,
                "observation_changed",
            );
        });
        tableDoc.transact(() => {
            row.set("status", "done");
            row.set("status", "todo");
            expect(() =>
                guard.assertCurrent({
                    kind: "table-field",
                    kanbanId: "k",
                    scopeId: "status",
                    sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r" },
                    outputField: "status",
                    physicalColumn: "status",
                    role: "title",
                })
            ).to.throw(KanbanObservationError, "observation_changed");
        });
    });

    it("observes real Table schema/catalog ABA and unrelated catalog edits", async () => {
        const projectConnection = await openLiveRoom(host, "projects/p", "u", { test: "project" });
        const tableConnection = await openLiveRoom(host, "projects/p/tables/t", "u", { test: "table" });
        const projectDoc = projectConnection.document as unknown as Y.Doc;
        const tableDoc = tableConnection.document as unknown as Y.Doc;
        const tableEntry = new Y.Map<unknown>();
        tableEntry.set("sqlName", "tasks");
        projectDoc.getMap("yjsTables").set("t", tableEntry);
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("description", "first");
        tableDoc.getMap("data").set("r", row);
        tableDoc.getText("schema").insert(
            0,
            "CREATE TABLE tasks (status task_status, priority task_priority)",
        );
        restoreSqlCatalogObject(projectDoc, {
            id: "status-enum",
            kind: "enum",
            source: "CREATE TYPE task_status AS ENUM ('todo')",
        });
        restoreSqlCatalogObject(projectDoc, {
            id: "priority-enum",
            kind: "enum",
            source: "CREATE TYPE task_priority AS ENUM ('low')",
        });
        const catalog = projectDoc.getMap<Y.Map<unknown>>("sqlCatalog");
        const effectiveSchema = await service.analyzeTableEffectiveSchema({
            projectDoc,
            sourceSchema: tableDoc.getText("schema"),
            projectId: "p",
            tableId: "t",
            sqlName: "tasks",
            physicalColumn: "status",
        })!;
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, projectConnection, [tableConnection]),
            tableFields: [{
                scopeId: "tasks:r:status",
                owner: row,
                field: "status",
                container: tableDoc.getMap("data"),
                containerKey: "r",
                sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r" },
                outputField: "status",
                physicalColumn: "status",
                roles: ["group"],
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
        if (!captured.available) throw new Error(captured.reason);
        const selection = {
            kind: "table-field",
            kanbanId: "k",
            scopeId: "tasks:r:status",
            sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r" },
            outputField: "status",
            physicalColumn: "status",
            role: "group",
        } as const;
        replaceSqlCatalogSource(
            projectDoc,
            "priority-enum",
            "CREATE TYPE task_priority AS ENUM ('low', 'high')",
        );
        replaceSqlCatalogSource(projectDoc, "priority-enum", "CREATE TYPE task_priority AS ENUM ('low')");
        row.set("description", "second");
        service.acquire("u", "p", captured.observationToken).assertCurrent(selection);
        const dependency = catalog.get("status-enum")!;
        dependency.set("source", "CREATE TYPE task_status AS ENUM ('todo', 'done')");
        dependency.set("source", "CREATE TYPE task_status AS ENUM ('todo')");
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(selection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
    });

    it("rejects actual serving-room replacement and drops the orphan safely", async () => {
        const connection = await openLiveRoom(host, "projects/p", "u", { test: "replacement" });
        const doc = connection.document as unknown as Y.Doc;
        createKanbanEntry(doc, "k");
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: [] },
        });
        if (!captured.available) throw new Error(captured.reason);
        host.documents.delete("projects/p");
        host.documents.set("projects/p", doc as never);
        expect(() => service.acquire("u", "p", captured.observationToken)).to.throw(
            KanbanObservationError,
            "observation_unavailable",
        );
        await new Promise(resolve => setImmediate(resolve));
        expect(connection.document).to.equal(null);
        host.documents.delete("projects/p");
    });
});
