import { describe, expect, it } from "vitest";
import type { GridPhysicalColumnMetadata } from "../../services/yjstable/gridMetadataResolver";
import { textLineBreakPolicy } from "./textCellLineBreakPolicy";

const source = { kind: "table", id: "t1", sqlName: "tasks", schemaRevision: "v1" } as const;
function physical(dataType: string, overrides: Partial<GridPhysicalColumnMetadata> = {}): GridPhysicalColumnMetadata {
    return {
        outputIndex: 0,
        outputColumn: "value",
        physicalColumn: "body",
        source,
        field: { name: "body", dataType, kind: "text", isNullable: true, isPrimaryKey: false },
        ...overrides,
    };
}
const rowTarget = { row: {}, source: { sourceKind: "tasks", sourceId: "r1" } };

describe("textLineBreakPolicy", () => {
    it.each(["text", "character varying", "character"])("allows physical Table %s fields", dataType => {
        expect(textLineBreakPolicy({ grid: true, column: "value", rowTarget, physicalColumns: [physical(dataType)] }))
            .toEqual({ kind: "allowed" });
    });
    it("denies UUID, system, unavailable, and ambiguous destinations", () => {
        expect(
            textLineBreakPolicy({ grid: true, column: "value", rowTarget, physicalColumns: [physical("uuid")] }).kind,
        ).toBe("forbidden");
        expect(
            textLineBreakPolicy({
                grid: true,
                column: "value",
                rowTarget,
                physicalColumns: [physical("text", { source: { ...source, kind: "system" } })],
            }).kind,
        ).toBe("unavailable");
        expect(textLineBreakPolicy({ grid: true, column: "value", rowTarget, physicalColumns: [] }).kind).toBe(
            "unavailable",
        );
        expect(
            textLineBreakPolicy({
                grid: true,
                column: "value",
                rowTarget,
                physicalColumns: [physical("text"), physical("text", { physicalColumn: "other" })],
            }).kind,
        ).toBe("unavailable");
    });
    it("uses the applied schema only for an explicit raw Table browser", () => {
        expect(
            textLineBreakPolicy({
                grid: false,
                column: "body",
                physicalColumns: [],
                rawTableColumn: physical("text").field,
            }).kind,
        ).toBe("allowed");
        expect(
            textLineBreakPolicy({
                grid: false,
                column: "id",
                physicalColumns: [],
                rawTableColumn: physical("uuid").field,
            }).kind,
        ).toBe("forbidden");
    });
});
