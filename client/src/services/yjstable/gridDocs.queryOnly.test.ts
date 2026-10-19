import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridSourceTableId, listGrids } from "./gridDocs";

describe("query-only Grid definitions", () => {
    it("retains identity and presentation without synthesizing a primary Table", () => {
        const doc = new Y.Doc();
        const gridId = createGrid(doc, undefined, {
            gridId: "query-grid",
            name: "Independent query",
            query: "SELECT 1 AS value",
            columnOrder: ["value"],
            components: { value: { label: "Result", widthPx: 180 } },
        });

        const handles = getGridHandles(doc, gridId);
        expect(gridId).toBe("query-grid");
        expect(getGridSourceTableId(doc, gridId)).toBeUndefined();
        expect(handles?.entry.has("sourceTableId")).toBe(false);
        expect(handles?.entry.get("query")).toBe("SELECT 1 AS value");
        expect(listGrids(doc)).toEqual([{
            gridId,
            name: "Independent query",
            sourceTableId: undefined,
            showAddRowButton: true,
            confirmRowDelete: false,
        }]);
    });
});
