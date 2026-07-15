import { describe, expect, it } from "vitest";
import { mapEdit } from "../services/editMapper";

describe("editMapper", () => {
    it("maps row and column to edit info", () => {
        const columns = [{ name: "val", table: "tbl", pkAlias: "tbl_pk" }];
        const row = { val: 1, tbl_pk: "id1" };
        const info = mapEdit(columns, row, "val");
        expect(info).toEqual({ table: "tbl", pk: "id1", column: "val" });
    });

    it("maps join row to correct table", () => {
        const columns = [
            { name: "a", table: "t1", pkAlias: "t1_pk" },
            { name: "b", table: "t2", pkAlias: "t2_pk" },
        ];
        const row = { a: 1, b: 2, t1_pk: "x1", t2_pk: "y1" };
        const info = mapEdit(columns, row, "b");
        expect(info).toEqual({ table: "t2", pk: "y1", column: "b" });
    });
});
