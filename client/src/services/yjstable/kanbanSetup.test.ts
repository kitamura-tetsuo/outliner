import { getKanbanRegistry, readKanbanSettings } from "$shared/services/kanbanDefinition";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { updateKanban } from "./kanbanDocs";
import { bindExistingKanban, createKanbanOverExistingTable, createKanbanWithNewTable } from "./kanbanSetup";
import { getTableRegistry, listTables, removeTable, setTableSqlName } from "./tableDocs";
import { TABLE_PRESETS, TASKS_PRESET } from "./tablePresets";

const allowed = () => ({ projectAccess: true, surfaceWritable: true });
function setup(doc = new Y.Doc()) {
    getTableRegistry(doc);
    getKanbanRegistry(doc);
    const nodes = doc.getMap<Y.Map<unknown>>("nodes");
    const key = String(nodes.size);
    const node = new Y.Map<unknown>();
    nodes.set(key, node);
    node.set("componentType", "kanban");
    return { doc, node, item: { ydoc: doc, tree: { getNodeValueFromKey: (id: string) => nodes.get(id) }, key } };
}
function snapshot(doc: Y.Doc) {
    return { json: doc.toJSON(), subdocs: doc.getSubdocs().size };
}

describe("Kanban setup publication", () => {
    for (const preset of TABLE_PRESETS) {
        it(`publishes initialized ${preset.key} with independent identity and exact SQL`, () => {
            const { doc, node, item } = setup();
            let updates = 0;
            doc.on("update", () => {
                updates++;
                expect(getTableRegistry(doc).size).toBe(1);
                expect(getKanbanRegistry(doc).size).toBe(1);
                expect(node.get("kanbanId")).toBeTruthy();
                const table = [...getTableRegistry(doc).values()][0];
                expect((table.get("doc") as Y.Doc).getText("schema").toString()).toBe(
                    preset.schemaSql("custom_source"),
                );
            });
            const { kanbanId: id } = createKanbanWithNewTable(item, {
                preset,
                name: "Custom",
                sqlName: "custom_source",
            }, allowed);
            expect(updates).toBe(1);
            const entry = getKanbanRegistry(doc).get(id)!;
            expect(readKanbanSettings(entry)).toMatchObject({
                query: preset.query("custom_source"),
                titleField: preset.key === "habits" ? "name" : "title",
            });
            expect(readKanbanSettings(entry).groupField).toBe(
                preset.key === "blank" ? undefined : preset.key === "tasks" ? "status" : "kind",
            );
            expect(entry.has("sourceTableId")).toBe(false);
            expect(entry.has("insertTargetTableId")).toBe(false);
            expect(doc.getMap("yjsGrids").size).toBe(0);
            const peer = new Y.Doc();
            Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
            expect(peer.getMap<Y.Map<unknown>>("nodes").get(item.key)?.get("kanbanId")).toBe(id);
            expect(getKanbanRegistry(peer).get(id)?.toJSON()).toEqual(entry.toJSON());
        });
    }
    it("seeds SQL transiently and shares existing IDs without changing sources", () => {
        const first = setup();
        const { kanbanId: a } = createKanbanWithNewTable(
            first.item,
            { preset: TASKS_PRESET, name: "Same", sqlName: "source_a" },
            allowed,
        );
        const table = listTables(first.doc)[0];
        const second = setup(first.doc);
        const b = createKanbanOverExistingTable(second.item, table.tableId, table.sqlName, allowed);
        expect(b).not.toBe(a);
        expect(readKanbanSettings(getKanbanRegistry(first.doc).get(b)!)).toMatchObject({
            query: "SELECT * FROM source_a",
        });
        expect(getKanbanRegistry(first.doc).get(b)?.has("groupField")).toBe(false);
        const beforeTables = getTableRegistry(first.doc).toJSON();
        const third = setup(first.doc);
        expect(bindExistingKanban(third.item, b, allowed)).toBe(b);
        updateKanban(first.doc, b, { query: "SELECT id, title FROM outline_items", titleField: "title" });
        expect(third.node.get("kanbanId")).toBe(second.node.get("kanbanId"));
        expect(getTableRegistry(first.doc).toJSON()).toEqual(beforeTables);
        expect(getKanbanRegistry(first.doc).size).toBe(2);
    });
    it("refuses stale sources and stale or denied targets with zero updates", () => {
        const first = setup();
        createKanbanWithNewTable(first.item, { preset: TASKS_PRESET, name: "Tasks", sqlName: "tasks" }, allowed);
        const table = listTables(first.doc)[0];
        const pending = setup(first.doc);
        setTableSqlName(first.doc, table.tableId, "renamed");
        const actions = [
            () => createKanbanOverExistingTable(pending.item, table.tableId, "tasks", allowed),
            () => bindExistingKanban(pending.item, "missing", allowed),
            () =>
                createKanbanWithNewTable(
                    pending.item,
                    { preset: TASKS_PRESET, name: "Bad", sqlName: "renamed" },
                    allowed,
                ),
            () =>
                createKanbanWithNewTable(
                    pending.item,
                    { preset: TASKS_PRESET, name: "Bad", sqlName: "outline_items" },
                    allowed,
                ),
            () => bindExistingKanban(pending.item, "missing", () => ({ projectAccess: false, surfaceWritable: true })),
            () => bindExistingKanban(pending.item, "missing", () => ({ projectAccess: true, surfaceWritable: false })),
        ];
        for (const action of actions) {
            const before = snapshot(first.doc);
            let updates = 0;
            const changed = () => updates++;
            first.doc.on("update", changed);
            expect(action).toThrow();
            expect(updates).toBe(0);
            expect(snapshot(first.doc)).toEqual(before);
            first.doc.off("update", changed);
        }
        removeTable(first.doc, table.tableId);
        expect(() => createKanbanOverExistingTable(pending.item, table.tableId, "renamed", allowed)).toThrow(
            "no longer",
        );
        pending.node.set("kanbanId", "peer");
        expect(() =>
            createKanbanWithNewTable(pending.item, { preset: TASKS_PRESET, name: "No", sqlName: "fresh" }, allowed)
        ).toThrow("already");
        expect(pending.node.get("kanbanId")).toBe("peer");
    });
    it("discards detached initialization and downstream failures without publishing or attaching subdocs", () => {
        for (const failure of ["initialization", "definition", "downstream"]) {
            const { doc, item } = setup();
            const before = snapshot(doc);
            const preset = {
                ...TASKS_PRESET,
                query: () => failure === "definition" ? 42 as unknown as string : TASKS_PRESET.query("tasks"),
                schemaSql: () =>
                    failure === "initialization" ? undefined as unknown as string : TASKS_PRESET.schemaSql("tasks"),
            };
            let checks = 0;
            expect(() =>
                createKanbanWithNewTable(item, { preset, name: "No", sqlName: "tasks" }, () => ({
                    projectAccess: true,
                    surfaceWritable: failure !== "downstream" || ++checks === 1,
                }))
            ).toThrow();
            expect(snapshot(doc)).toEqual(before);
        }
    });
});
