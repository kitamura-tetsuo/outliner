import { describe, expect, it } from "vitest";
import { mapEdit } from "../services/editMapper";

describe("editMapper", () => {
    it("maps row and column to edit info", () => {
        const columns = [{ name: "val", table: "tbl", pkAlias: "tbl_uuid" }];
        const row = { val: 1, tbl_uuid: "id1" };
        const info = mapEdit(columns, row, "val");
        expect(info).toEqual({ table: "tbl", pk: "id1", column: "val" });
    });

    it("maps join row to correct table", () => {
        const columns = [
            { name: "a", table: "t1", pkAlias: "t1_uuid" },
            { name: "b", table: "t2", pkAlias: "t2_uuid" },
        ];
        const row = { a: 1, b: 2, t1_uuid: "x1", t2_uuid: "y1" };
        const info = mapEdit(columns, row, "b");
        expect(info).toEqual({ table: "t2", pk: "y1", column: "b" });
    });
});
