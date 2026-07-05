import { describe, expect, it } from "vitest";
import { isSelectOnly } from "../services/sqlService";

describe("isSelectOnly", () => {
    it("allows valid SELECT queries", () => {
        expect(isSelectOnly("SELECT * FROM a;")).toBe(true);
        expect(isSelectOnly("WITH cte AS (SELECT 1) SELECT * FROM cte;")).toBe(true);
        expect(isSelectOnly("-- DELETE \n SELECT * FROM a;")).toBe(true);
        expect(isSelectOnly("SELECT * FROM a WHERE x='update';")).toBe(true);
    });

    it("blocks restricted queries", () => {
        expect(isSelectOnly("UPDATE a SET x=1;")).toBe(false);
        expect(isSelectOnly("SELECT * FROM a; DROP TABLE b;")).toBe(false);
        expect(isSelectOnly("INSERT INTO a VALUES (1);")).toBe(false);
        expect(isSelectOnly("PRAGMA table_info(a);")).toBe(false);
    });
});
