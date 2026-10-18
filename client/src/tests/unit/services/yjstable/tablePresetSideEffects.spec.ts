import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    getGridHandles,
    getGridRegistry,
    setGridComponentField,
    setGridQuery,
} from "../../../../services/yjstable/gridDocs";
import { createKanban, getKanbanRegistry, listKanbans } from "../../../../services/yjstable/kanbanDocs";
import {
    addRecord,
    createTable,
    getTableHandles,
    getTableRegistry,
    setSchemaText,
    type TableHandles,
} from "../../../../services/yjstable/tableDocs";
import {
    BLANK_PRESET,
    createTableFromPreset,
    createTableOnlyFromPreset,
    TABLE_PRESETS,
} from "../../../../services/yjstable/tablePresets";

function projectWithKanban(): {
    doc: Y.Doc;
    existingTableId: string;
    existingTableHandles: TableHandles;
    existingTableEntry: Y.Map<unknown>;
    schemaBefore: string;
    recordsBefore: Record<string, unknown>;
    kanbanId: string;
    kanbanDefinitionBefore: Record<string, unknown>;
    kanbansBefore: ReturnType<typeof listKanbans>;
} {
    const doc = new Y.Doc({ guid: "preset-side-effects" });
    const existingTableId = createTable(doc, "Existing", "existing");
    const existingTableHandles = getTableHandles(doc, existingTableId)!;
    setSchemaText(
        existingTableHandles,
        "CREATE TABLE existing (id TEXT PRIMARY KEY, title TEXT NOT NULL, marker INTEGER NOT NULL)",
    );
    addRecord(existingTableHandles, { title: "Preserve me", marker: 73 }, "existing-record");
    const kanbanId = createKanban(doc, existingTableId, {
        name: "Existing board",
        query: "SELECT id FROM existing",
    });
    return {
        doc,
        existingTableId,
        existingTableHandles,
        existingTableEntry: getTableRegistry(doc).get(existingTableId)!,
        schemaBefore: existingTableHandles.schemaText.toString(),
        recordsBefore: existingTableHandles.data.toJSON(),
        kanbanId,
        kanbanDefinitionBefore: getKanbanRegistry(doc).get(kanbanId)!.toJSON(),
        kanbansBefore: listKanbans(doc),
    };
}

function expectNoInsertPreference(entry: Y.Map<unknown>): void {
    expect(entry.get("insertTargetTableId")).toBeUndefined();
    expect(entry.has("insertTargetTableId")).toBe(false);
}

function expectOnlyExistingKanban(
    doc: Y.Doc,
    existingTableId: string,
    existingTableHandles: TableHandles,
    existingTableEntry: Y.Map<unknown>,
    schemaBefore: string,
    recordsBefore: Record<string, unknown>,
    kanbanId: string,
    kanbanDefinitionBefore: Record<string, unknown>,
    kanbansBefore: ReturnType<typeof listKanbans>,
): void {
    expect(listKanbans(doc)).toEqual(kanbansBefore);
    expect(getKanbanRegistry(doc).size).toBe(1);
    expect([...getKanbanRegistry(doc).keys()]).toEqual([kanbanId]);
    expect(getKanbanRegistry(doc).get(kanbanId)?.toJSON()).toEqual(kanbanDefinitionBefore);
    expect(getTableRegistry(doc).get(existingTableId)).toBe(existingTableEntry);
    expect(getTableHandles(doc, existingTableId)?.doc).toBe(existingTableHandles.doc);
    expect(existingTableHandles.schemaText.toString()).toBe(schemaBefore);
    expect(existingTableHandles.data.toJSON()).toEqual(recordsBefore);
}

describe("preset creation side-effect boundaries", () => {
    it.each(TABLE_PRESETS)("preserves a customized existing Grid during standalone $key creation", preset => {
        const doc = new Y.Doc({ guid: `grid-preservation-${preset.key}` });
        const existingGridId = createTableFromPreset(
            doc,
            BLANK_PRESET,
            "Existing pair",
            "existing_pair",
        ).gridId;
        const handles = getGridHandles(doc, existingGridId)!;
        setGridQuery(handles, "SELECT id, title FROM existing_pair ORDER BY title DESC");
        setGridComponentField(handles, "title", "label", "Preserved custom label");
        setGridComponentField(handles, "done", "hidden", true);
        const existingGrid = getGridRegistry(doc).get(existingGridId)!;
        const definitionBefore = existingGrid.toJSON();

        createTableOnlyFromPreset(doc, preset, `${preset.name} only`, `${preset.key}_only`);

        expect(getGridRegistry(doc).size).toBe(1);
        expect(getGridRegistry(doc).get(existingGridId)).toBe(existingGrid);
        expect(existingGrid.toJSON()).toEqual(definitionBefore);
    });

    it.each(TABLE_PRESETS)("creates standalone $key without Kanban or INSERT preference", preset => {
        const fixture = projectWithKanban();
        const { doc, existingTableId, kanbanId, kanbanDefinitionBefore, kanbansBefore } = fixture;

        const tableId = createTableOnlyFromPreset(doc, preset, `${preset.name} only`, `${preset.key}_only`);
        const tableEntry = getTableRegistry(doc).get(tableId)!;

        expectOnlyExistingKanban(
            doc,
            existingTableId,
            fixture.existingTableHandles,
            fixture.existingTableEntry,
            fixture.schemaBefore,
            fixture.recordsBefore,
            kanbanId,
            kanbanDefinitionBefore,
            kanbansBefore,
        );
        expectNoInsertPreference(tableEntry);
        expect(getGridRegistry(doc).size).toBe(0);
    });

    it.each(TABLE_PRESETS)("composes $key without Kanban or inferred INSERT preference", preset => {
        const fixture = projectWithKanban();
        const { doc, existingTableId, kanbanId, kanbanDefinitionBefore, kanbansBefore } = fixture;
        const sqlName = `${preset.key}_composed`;

        const { tableId, gridId } = createTableFromPreset(doc, preset, `${preset.name} composed`, sqlName);
        const tableEntry = getTableRegistry(doc).get(tableId)!;
        const gridEntry = getGridRegistry(doc).get(gridId)!;

        expectOnlyExistingKanban(
            doc,
            existingTableId,
            fixture.existingTableHandles,
            fixture.existingTableEntry,
            fixture.schemaBefore,
            fixture.recordsBefore,
            kanbanId,
            kanbanDefinitionBefore,
            kanbansBefore,
        );
        expectNoInsertPreference(tableEntry);
        expectNoInsertPreference(gridEntry);
        expect(gridEntry.get("sourceTableId")).toBe(tableId);
        expect(gridEntry.get("query")).toBe(preset.query(sqlName));
        expect(gridEntry.get("components")).toBeInstanceOf(Y.Map);
    });
});
