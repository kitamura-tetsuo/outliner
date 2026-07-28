import { describe, expect, it } from "vitest";
import { analyzeCalendarColumnWritability } from "./calendarColumnWritability";

describe("analyzeCalendarColumnWritability", () => {
    it("resolves bare columns with an implicit alias", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT id, start_at, duration FROM outline_items",
        );
        expect(map.get("id")).toBe("id");
        expect(map.get("start_at")).toBe("start_at");
        expect(map.get("duration")).toBe("duration");
    });

    it("resolves a bare column aliased with AS to the underlying column, not the alias", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT text AS title, start_at AS begins FROM outline_items",
        );
        expect(map.get("title")).toBe("text");
        expect(map.get("begins")).toBe("start_at");
        expect(map.has("start_at")).toBe(false);
    });

    it("resolves a table-qualified bare column to its unqualified name", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT i.start_at AS begins FROM outline_items i",
        );
        expect(map.get("begins")).toBe("start_at");
    });

    it("does not mark a calculated expression as writable", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT 'item' AS source_kind, id AS source_id, "
                + "COALESCE(start_on::text, start_at::text) AS start FROM outline_items",
        );
        expect(map.has("start")).toBe(false);
        expect(map.get("source_id")).toBe("id");
        // A string literal has no underlying column at all.
        expect(map.has("source_kind")).toBe(false);
    });

    it("does not mark a CASE expression or function call as writable", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT CASE WHEN done THEN 'done' ELSE 'open' END AS status, "
                + "upper(text) AS loud FROM outline_items",
        );
        expect(map.size).toBe(0);
    });

    it("handles a query with no top-level FROM by yielding no writable columns", () => {
        const map = analyzeCalendarColumnWritability("SELECT 1");
        expect(map.size).toBe(0);
    });

    it("ignores commas nested inside function-call arguments when splitting the select list", () => {
        const map = analyzeCalendarColumnWritability(
            "SELECT id, coalesce(a, b) AS merged, duration FROM outline_items",
        );
        expect(map.get("id")).toBe("id");
        expect(map.has("merged")).toBe(false);
        expect(map.get("duration")).toBe("duration");
    });

    it("handles double-quoted identifiers", () => {
        const map = analyzeCalendarColumnWritability(
            'SELECT "start_at" AS "begins" FROM outline_items',
        );
        expect(map.get("begins")).toBe("start_at");
    });
});
