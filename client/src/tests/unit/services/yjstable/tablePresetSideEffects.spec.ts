import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getGridRegistry } from "../../../../services/yjstable/gridDocs";
import { createKanban, getKanbanRegistry, listKanbans } from "../../../../services/yjstable/kanbanDocs";
import { createTable, getTableRegistry } from "../../../../services/yjstable/tableDocs";
import {
    createTableFromPreset,
    createTableOnlyFromPreset,
    TABLE_PRESETS,
} from "../../../../services/yjstable/tablePresets";

function projectWithKanban(): {
    doc: Y.Doc;
    kanbanId: string;
    kanbansBefore: ReturnType<typeof listKanbans>;
} {
    const doc = new Y.Doc({ guid: "preset-side-effects" });
    const existingTableId = createTable(doc, "Existing", "existing");
    const kanbanId = createKanban(doc, existingTableId, {
        name: "Existing board",
        query: "SELECT id FROM existing",
    });
    return { doc, kanbanId, kanbansBefore: listKanbans(doc) };
}

function expectNoInsertPreference(entry: Y.Map<unknown>): void {
    expect(entry.get("insertTargetTableId")).toBeUndefined();
    expect(entry.has("insertTargetTableId")).toBe(false);
}

function expectOnlyExistingKanban(
    doc: Y.Doc,
    kanbanId: string,
    kanbansBefore: ReturnType<typeof listKanbans>,
    newTableId: string,
): void {
    expect(listKanbans(doc)).toEqual(kanbansBefore);
    expect(getKanbanRegistry(doc).size).toBe(1);
    expect([...getKanbanRegistry(doc).keys()]).toEqual([kanbanId]);
    expect(listKanbans(doc).some(kanban => kanban.sourceTableId === newTableId)).toBe(false);
}

describe("preset creation side-effect boundaries", () => {
    it.each(TABLE_PRESETS)("creates standalone $key without Kanban or INSERT preference", preset => {
        const { doc, kanbanId, kanbansBefore } = projectWithKanban();

        const tableId = createTableOnlyFromPreset(doc, preset, `${preset.name} only`, `${preset.key}_only`);
        const tableEntry = getTableRegistry(doc).get(tableId)!;

        expectOnlyExistingKanban(doc, kanbanId, kanbansBefore, tableId);
        expectNoInsertPreference(tableEntry);
        expect(getGridRegistry(doc).size).toBe(0);
    });

    it.each(TABLE_PRESETS)("composes $key without Kanban or inferred INSERT preference", preset => {
        const { doc, kanbanId, kanbansBefore } = projectWithKanban();
        const sqlName = `${preset.key}_composed`;

        const { tableId, gridId } = createTableFromPreset(doc, preset, `${preset.name} composed`, sqlName);
        const tableEntry = getTableRegistry(doc).get(tableId)!;
        const gridEntry = getGridRegistry(doc).get(gridId)!;

        expectOnlyExistingKanban(doc, kanbanId, kanbansBefore, tableId);
        expectNoInsertPreference(tableEntry);
        expectNoInsertPreference(gridEntry);
        expect(gridEntry.get("sourceTableId")).toBe(tableId);
        expect(gridEntry.get("query")).toBe(preset.query(sqlName));
        expect(gridEntry.get("components")).toBeInstanceOf(Y.Map);
    });
});
