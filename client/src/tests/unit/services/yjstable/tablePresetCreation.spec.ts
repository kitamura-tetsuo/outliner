import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getGridRegistry } from "../../../../services/yjstable/gridDocs";
import {
    addRecord,
    createTable,
    getTableHandles,
    getTableRegistry,
    listTables,
} from "../../../../services/yjstable/tableDocs";
import {
    BLANK_PRESET,
    createTableFromPreset,
    createTableOnlyFromPreset,
    TABLE_PRESETS,
    type TablePreset,
} from "../../../../services/yjstable/tablePresets";

function project(guid: string = "preset-project"): Y.Doc {
    return new Y.Doc({ guid });
}

describe("standalone preset Table creation", () => {
    it.each(TABLE_PRESETS)("keeps the composed $key Table and Grid outcome", preset => {
        const doc = project();
        const sqlName = `${preset.key}_composed`;

        const { tableId, gridId } = createTableFromPreset(doc, preset, `${preset.name} composed`, sqlName);
        const grid = getGridRegistry(doc).get(gridId)!;
        const components = grid.get("components") as Y.Map<Y.Map<unknown>>;

        expect(listTables(doc)).toHaveLength(1);
        expect(getTableHandles(doc, tableId)?.schemaText.toString()).toBe(preset.schemaSql(sqlName));
        expect(grid.has("sourceTableId")).toBe(false);
        expect(grid.get("query")).toBe(preset.query(sqlName));
        expect(Object.fromEntries(
            [...components].map(([column, config]) => [column, { type: config.get("type") }]),
        )).toEqual(preset.components);
        expect(getGridRegistry(doc).size).toBe(1);
    });

    it.each(TABLE_PRESETS)("publishes a complete $key schema without view side effects", preset => {
        const doc = project();
        const existingTableId = createTable(doc, "Existing", "existing");
        addRecord(getTableHandles(doc, existingTableId)!, { title: "preserved" }, "record-1");
        const existingGridId = createTableFromPreset(doc, BLANK_PRESET, "Existing pair", "existing_pair").gridId;
        doc.getMap("calendars").set("calendar-1", "preserved");
        doc.getMap("placements").set("placement-1", "preserved");
        doc.getMap("sources").set("source-1", "preserved");
        const beforeSubdocs = new Set(doc.getSubdocs());
        let schemaAtPublication: string | undefined;
        getTableRegistry(doc).observe(event => {
            for (const id of event.keysChanged) {
                if (id !== existingTableId) schemaAtPublication = getTableHandles(doc, id)?.schemaText.toString();
            }
        });

        const sqlName = `${preset.key}_only`;
        const tableId = createTableOnlyFromPreset(doc, preset, `${preset.name} only`, sqlName);

        expect(schemaAtPublication).toBe(preset.schemaSql(sqlName));
        expect(getTableHandles(doc, tableId)?.schemaText.toString()).toBe(preset.schemaSql(sqlName));
        expect(listTables(doc).map(table => table.tableId)).toEqual([existingTableId, expect.any(String), tableId]);
        expect(getTableHandles(doc, existingTableId)?.data.get("record-1")?.get("title")).toBe("preserved");
        expect(getGridRegistry(doc).size).toBe(1);
        expect(getGridRegistry(doc).has(existingGridId)).toBe(true);
        expect(doc.getMap("calendars").toJSON()).toEqual({ "calendar-1": "preserved" });
        expect(doc.getMap("placements").toJSON()).toEqual({ "placement-1": "preserved" });
        expect(doc.getMap("sources").toJSON()).toEqual({ "source-1": "preserved" });
        expect([...doc.getSubdocs()].filter(subdoc => !beforeSubdocs.has(subdoc))).toHaveLength(1);
    });

    it("rejects invalid, reserved, occupied, and non-ASCII SQL names without effects", () => {
        const doc = project();
        createTableOnlyFromPreset(doc, BLANK_PRESET, "Existing", "occupied");
        const registryBefore = getTableRegistry(doc).size;
        const subdocsBefore = doc.getSubdocs().size;

        for (
            const sqlName of [
                "",
                "a".repeat(64),
                "HasCaps",
                "9starts_wrong",
                "café",
                "select",
                "outline_items",
                "occupied",
            ]
        ) {
            expect(() => createTableOnlyFromPreset(doc, BLANK_PRESET, "Rejected", sqlName)).toThrow();
            expect(() => createTableFromPreset(doc, BLANK_PRESET, "Rejected", sqlName)).toThrow();
        }

        expect(getTableRegistry(doc).size).toBe(registryBefore);
        expect(doc.getSubdocs().size).toBe(subdocsBefore);
        expect(getGridRegistry(doc).size).toBe(0);
    });

    it("leaves no orphan when schema initialization fails", () => {
        const doc = project();
        const broken: TablePreset = {
            ...BLANK_PRESET,
            schemaSql: () => {
                throw new Error("initializer failed");
            },
        };

        expect(() => createTableOnlyFromPreset(doc, broken, "Broken", "broken")).toThrow("initializer failed");
        expect(() => createTableFromPreset(doc, broken, "Broken", "broken")).toThrow("initializer failed");
        expect(listTables(doc)).toEqual([]);
        expect(getGridRegistry(doc).size).toBe(0);
        expect([...doc.getSubdocs()]).toEqual([]);
    });

    it("evaluates a composed preset query before publishing its Table", () => {
        const doc = project();
        const broken: TablePreset = {
            ...BLANK_PRESET,
            query: () => {
                throw new Error("query failed");
            },
        };

        expect(() => createTableFromPreset(doc, broken, "Broken", "broken")).toThrow("query failed");
        expect(listTables(doc)).toEqual([]);
        expect(getGridRegistry(doc).size).toBe(0);
        expect([...doc.getSubdocs()]).toEqual([]);
    });

    it("reconstructs the same standalone Table and schema without replaying creation", () => {
        const original = project("reconstruction-project");
        const tableId = createTableOnlyFromPreset(original, BLANK_PRESET, "Rebuilt", "rebuilt");
        const originalTable = getTableHandles(original, tableId)!;
        const projectUpdate = Y.encodeStateAsUpdate(original);
        const tableUpdate = Y.encodeStateAsUpdate(originalTable.doc);

        const reconstructed = project("reconstruction-project");
        Y.applyUpdate(reconstructed, projectUpdate);
        const reconstructedTable = getTableHandles(reconstructed, tableId)!;
        Y.applyUpdate(reconstructedTable.doc, tableUpdate);

        expect(listTables(reconstructed)).toEqual([{ tableId, name: "Rebuilt", sqlName: "rebuilt" }]);
        expect(reconstructedTable.doc.guid).toBe(originalTable.doc.guid);
        expect(reconstructedTable.schemaText.toString()).toBe(BLANK_PRESET.schemaSql("rebuilt"));
        expect(getGridRegistry(reconstructed).size).toBe(0);
    });
});
