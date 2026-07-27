import { describe, expect, it } from "vitest";
import {
    assertWriteAllowed,
    ITEMS_RELATION_CAPABILITIES,
    type RelationCapabilities,
    type RelationWrite,
    RelationWriteError,
    TABLE_RELATION_CAPABILITIES,
} from "./relationProvider";

const UPDATE: RelationWrite = { op: "UPDATE", rowId: "r1", column: "due", value: "2026-08-01" };
const INSERT: RelationWrite = { op: "INSERT", values: { due: "2026-08-01" } };
const DELETE: RelationWrite = { op: "DELETE", rowId: "r1" };

describe("declared capabilities", () => {
    it("lets a table accept every operation without a decision from the caller", () => {
        expect(TABLE_RELATION_CAPABILITIES).toEqual({
            update: true,
            insert: { requiresDestination: false },
            delete: { requiresDisposition: false },
        });
        for (const write of [UPDATE, INSERT, DELETE]) {
            expect(() => assertWriteAllowed(TABLE_RELATION_CAPABILITIES, write, "tasks")).not.toThrow();
        }
    });

    it("makes the items relation demand a destination and a disposition", () => {
        expect(ITEMS_RELATION_CAPABILITIES).toEqual({
            update: true,
            insert: { requiresDestination: true },
            delete: { requiresDisposition: true },
        });
    });
});

describe("assertWriteAllowed", () => {
    it("refuses an INSERT into the items relation without an explicit destination", () => {
        expect(() => assertWriteAllowed(ITEMS_RELATION_CAPABILITIES, INSERT, "outline_items"))
            .toThrow(RelationWriteError);
        expect(() => assertWriteAllowed(ITEMS_RELATION_CAPABILITIES, INSERT, "outline_items"))
            .toThrow(/explicit destination/);

        expect(() =>
            assertWriteAllowed(
                ITEMS_RELATION_CAPABILITIES,
                { ...INSERT, destination: { parentKey: "page-1" } } as RelationWrite,
                "outline_items",
            )
        ).not.toThrow();
    });

    it("refuses a DELETE from the items relation without an explicit choice", () => {
        expect(() => assertWriteAllowed(ITEMS_RELATION_CAPABILITIES, DELETE, "outline_items"))
            .toThrow(/deleting the item and clearing its date/);

        for (const disposition of ["delete-source", "clear-projected-field"] as const) {
            expect(() =>
                assertWriteAllowed(
                    ITEMS_RELATION_CAPABILITIES,
                    { ...DELETE, disposition },
                    "outline_items",
                )
            ).not.toThrow();
        }
    });

    it("refuses operations a relation does not declare at all", () => {
        const readOnly: RelationCapabilities = { update: false };
        expect(() => assertWriteAllowed(readOnly, UPDATE, "report")).toThrow(/does not accept UPDATE/);
        expect(() => assertWriteAllowed(readOnly, INSERT, "report")).toThrow(/does not accept INSERT/);
        expect(() => assertWriteAllowed(readOnly, DELETE, "report")).toThrow(/does not accept DELETE/);
    });
});
