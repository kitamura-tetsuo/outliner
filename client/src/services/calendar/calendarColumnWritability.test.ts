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

it("uses positional agreement across every UNION ALL branch", () => {
    const writable = analyzeCalendarColumnWritability(
        "SELECT start AS begins, tags AS lanes FROM first_source "
            + "UNION ALL SELECT start AS ignored_name, tags FROM second_source",
    );
    expect([...writable]).toEqual([["begins", "start"], ["lanes", "tags"]]);

    const differing = analyzeCalendarColumnWritability(
        "SELECT start AS begins, tags AS lanes FROM first_source "
            + "UNION ALL SELECT due, tags FROM second_source",
    );
    expect(differing.has("begins")).toBe(false);
    expect(differing.get("lanes")).toBe("tags");
});

it("refuses calculated later UNION branches and duplicate output names", () => {
    const calculated = analyzeCalendarColumnWritability(
        "SELECT start AS begins, tags AS lanes FROM first_source "
            + "UNION ALL SELECT start + interval '1 day', tags FROM second_source",
    );
    expect(calculated.has("begins")).toBe(false);
    expect(calculated.get("lanes")).toBe("tags");

    const duplicate = analyzeCalendarColumnWritability(
        "SELECT start AS role, upper(tags) AS role, duration FROM source",
    );
    expect(duplicate.has("role")).toBe(false);
    expect(duplicate.get("duration")).toBe("duration");
});

it("uses PostgreSQL lexical rules for comments, dollar strings, and Unicode names", () => {
    const writable = analyzeCalendarColumnWritability(
        'SELECT /* from, join */ "開始" AS "始まり", start AS begins FROM source WHERE note <> $tag$from, join$tag$',
    );
    expect(writable.get("始まり")).toBe("開始");
    expect(writable.get("begins")).toBe("start");
});

it("returns no authority for malformed, multiple, joined, or CTE queries", () => {
    for (
        const query of [
            "SELECT start FROM",
            "SELECT start FROM source; SELECT start FROM source",
            "SELECT a.start FROM a JOIN b ON true",
            "WITH source AS (SELECT start FROM real_source) SELECT start FROM source",
        ]
    ) expect(analyzeCalendarColumnWritability(query).size, query).toBe(0);
});
