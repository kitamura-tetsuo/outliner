import { expect } from "chai";
import * as Y from "yjs";
import { KanbanObservationError, KanbanObservationService } from "../src/mcp/kanban-observations.js";

describe("KanbanObservationService physical field scopes", () => {
    it("detects nested ABA and dependencies while ignoring unrelated fields", async () => {
        const project = new Y.Doc();
        const rows = project.getMap<Y.Map<unknown>>("data");
        const row = new Y.Map<unknown>();
        const text = new Y.Text("A");
        row.set("title", text);
        row.set("other", "untouched");
        rows.set("r1", row);
        project.getText("schema").insert(0, "CREATE TABLE tasks (title text)");
        const tableEntry = new Y.Map<unknown>();
        tableEntry.set("sqlName", "tasks");
        project.getMap("yjsTables").set("t", tableEntry);
        const host = {
            documents: new Map([["projects/p", project]]),
            openDirectConnection: async () => undefined as never,
        };
        const service = new KanbanObservationService(host);
        const effectiveSchema = await service.analyzeTableEffectiveSchema({
            projectDoc: project,
            sourceSchema: project.getText("schema"),
            projectId: "p",
            tableId: "t",
        })!;
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: { projectDoc: project, rooms: [{ room: "projects/p", doc: project }], release: async () => {} },
            tableFields: [{
                scopeId: "card:r1:title",
                owner: row,
                field: "title",
                container: rows,
                containerKey: "r1",
                sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r1" },
                outputField: "title",
                physicalColumn: "title",
                roles: ["title"],
                table: {
                    projectDoc: project,
                    registry: project.getMap("yjsTables"),
                    tableId: "t",
                    entry: tableEntry,
                    sqlName: "tasks",
                    tableDoc: project,
                },
                effectiveSchema,
            }],
        });
        if (!captured.available) throw new Error(captured.reason);
        row.set("other", "changed");
        const selection = {
            kind: "table-field",
            kanbanId: "k",
            scopeId: "card:r1:title",
            sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: "r1" },
            outputField: "title",
            physicalColumn: "title",
            role: "title",
        } as const;
        service.acquire("u", "p", captured.observationToken).assertCurrent(selection);
        text.delete(0, 1);
        text.insert(0, "B");
        text.delete(0, 1);
        text.insert(0, "A");
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(selection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
        await service.dispose();
    });

    it("deduplicates shared Table identities for capacity and restores the exact count", async () => {
        const doc = new Y.Doc();
        doc.getText("schema").insert(0, "CREATE TABLE tasks (status text)");
        const registry = doc.getMap<Y.Map<unknown>>("yjsTables");
        const entry = new Y.Map<unknown>();
        entry.set("sqlName", "tasks");
        registry.set("t", entry);
        const data = doc.getMap<Y.Map<unknown>>("data");
        const rows = ["r1", "r2", "r3"].map(id => {
            const row = new Y.Map<unknown>();
            row.set("status", "todo");
            data.set(id, row);
            return { id, row };
        });
        const host = {
            documents: new Map([["projects/p", doc]]),
            openDirectConnection: async () => undefined as never,
        };
        const service = new KanbanObservationService(host, { limits: { scopesPerToken: 5, scopes: 5 } });
        const effectiveSchema = await service.analyzeTableEffectiveSchema({
            projectId: "p",
            projectDoc: doc,
            tableId: "t",
            sourceSchema: doc.getText("schema"),
        });
        if (!effectiveSchema) throw new Error("schema analysis failed");
        const makeCapture = (selected: typeof rows) =>
            service.capture({
                uid: "u",
                projectId: "p",
                kanbanId: "k",
                lease: { projectDoc: doc, rooms: [{ room: "projects/p", doc }], release: async () => {} },
                tableFields: selected.map(({ id, row }) => ({
                    scopeId: id,
                    owner: row,
                    field: "status",
                    container: data,
                    containerKey: id,
                    sourceRef: { kind: "table", id: "t", sqlName: "tasks", rowId: id },
                    outputField: "status",
                    physicalColumn: "status",
                    roles: ["title"] as const,
                    effectiveSchema,
                    table: { projectDoc: doc, registry, tableId: "t", entry, sqlName: "tasks", tableDoc: doc },
                })),
            });

        const accepted = makeCapture(rows.slice(0, 2));
        expect(accepted.available).to.equal(true);
        if (!accepted.available) return;
        await service.release(accepted.observationToken);
        expect(makeCapture(rows)).to.deep.equal({ available: false, reason: "capacity" });
        expect(makeCapture(rows.slice(0, 2)).available).to.equal(true);
        await service.dispose();
    });
});
