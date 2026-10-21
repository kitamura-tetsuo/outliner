import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry } from "../../../../services/yjstable/gridDocs";
import { createKanban, getKanbanRegistry } from "../../../../services/yjstable/kanbanDocs";
import { createTable, getTableRegistry } from "../../../../services/yjstable/tableDocs";
import {
    createTableFromPreset,
    createTableOnlyFromPreset,
    TABLE_PRESETS,
} from "../../../../services/yjstable/tablePresets";

function snapshotRegistry(registry: Y.Map<Y.Map<unknown>>): unknown {
    return registry.toJSON();
}

describe("preset SQL-name validation", () => {
    it.each(TABLE_PRESETS)("refuses system_user for $key before any project effect", preset => {
        const doc = new Y.Doc({ guid: `reserved-${preset.key}` });
        const existingTableId = createTable(doc, "Existing", "existing");
        createGrid(doc, {
            name: "Existing Grid",
            query: "SELECT id, title FROM existing ORDER BY title",
            components: {
                title: { type: "text", label: "Distinctive title", hidden: true },
            },
        });
        createKanban(doc, {
            name: "Existing Kanban",
            query: "SELECT id, title FROM existing",
        });

        const tablesBefore = snapshotRegistry(getTableRegistry(doc));
        const gridsBefore = snapshotRegistry(getGridRegistry(doc));
        const kanbansBefore = snapshotRegistry(getKanbanRegistry(doc));
        const subdocsBefore = [...doc.getSubdocs()];
        const stateVectorBefore = Y.encodeStateVector(doc);
        const history = new Y.UndoManager([
            getTableRegistry(doc),
            getGridRegistry(doc),
            getKanbanRegistry(doc),
        ]);
        let projectUpdates = 0;
        doc.on("update", () => projectUpdates++);

        expect(() => createTableOnlyFromPreset(doc, preset, "System user", "system_user"))
            .toThrow(/reserved/);
        expect(() => createTableFromPreset(doc, preset, "System user", "system_user"))
            .toThrow(/reserved/);

        expect(snapshotRegistry(getTableRegistry(doc))).toEqual(tablesBefore);
        expect(snapshotRegistry(getGridRegistry(doc))).toEqual(gridsBefore);
        expect(snapshotRegistry(getKanbanRegistry(doc))).toEqual(kanbansBefore);
        expect([...doc.getSubdocs()]).toEqual(subdocsBefore);
        expect(Y.encodeStateVector(doc)).toEqual(stateVectorBefore);
        expect(projectUpdates).toBe(0);
        expect(history.undoStack).toHaveLength(0);
        expect(history.redoStack).toHaveLength(0);
        history.destroy();
    });
});
