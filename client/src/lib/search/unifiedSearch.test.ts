import { afterEach, describe, expect, it } from "vitest";
import type { GridCellReplacement, GridCellReplaceOutcome } from "./unifiedSearch";
import {
    applyGridReplaceToMatches,
    gridSearchMatches,
    gridValueText,
    navigateGridSearchMatch,
    registerGridSearchProvider,
    replaceGridMatch,
    replaceGridMatches,
} from "./unifiedSearch";

/** Only "name" is writable; "computed" mirrors a read-only/computed Grid column. */
const WRITABLE_COLUMNS = new Set(["name"]);

describe("unified Grid search", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

    function register(
        options: {
            selection?: import("../../services/yjstable/gridSelection").GridSelectionSnapshot;
            gridId?: string;
            placementId?: string;
        } = {},
    ) {
        const { selection, gridId = "grid-1", placementId = "placement-1" } = options;
        let navigated = "";
        const rows: Record<string, unknown>[] = [
            { id: "stable-b", name: "Alpha", computed: "READ ONLY" },
            { id: "stable-a", name: "beta alpha", computed: 42 },
        ];
        cleanups.push(registerGridSearchProvider({
            snapshot: () => ({
                pageId: "page-1",
                pageTitle: "Page",
                placementId,
                gridId,
                columns: ["name", "computed"],
                rows,
                selection,
                rowId: row => String(row.id),
            }),
            navigate: match => {
                navigated = `${match.rowId}:${match.columnId}`;
            },
            clearHighlight: () => {},
            isCellReplaceable: (_rowId, columnId) => WRITABLE_COLUMNS.has(columnId),
            replaceCells: (entries: readonly GridCellReplacement[]): GridCellReplaceOutcome[] =>
                entries.map(entry => {
                    if (!WRITABLE_COLUMNS.has(entry.columnId)) {
                        return { ...entry, applied: false, reason: "read-only" };
                    }
                    const row = rows.find(candidate => String(candidate.id) === entry.rowId);
                    if (!row) return { ...entry, applied: false, reason: "read-only" };
                    row[entry.columnId] = entry.newText;
                    return { ...entry, applied: true };
                }),
        }));
        return { navigated: () => navigated, rows };
    }

    it("searches logical rows in row-major visible-column order", () => {
        register();
        expect(gridSearchMatches("page-1", "alpha", {}).map(hit => [hit.rowId, hit.columnId])).toEqual([
            ["stable-b", "name"],
            ["stable-a", "name"],
        ]);
        expect(gridSearchMatches("page-1", "read", {}).map(hit => hit.columnId)).toEqual(["computed"]);
    });

    it("constrains Selection scope without expanding DOM ranges", () => {
        register({ selection: { regions: [{ kind: "columns", columnIds: ["computed"] }] } });
        expect(gridSearchMatches("page-1", "alpha", {}, true)).toEqual([]);
        expect(gridSearchMatches("page-1", "42", {}, true)).toHaveLength(1);
    });

    it("gives explicitly re-added cells precedence over broad exclusions", () => {
        register({
            selection: {
                regions: [
                    { kind: "columns", columnIds: ["computed"] },
                    { kind: "exclude-rows", rowIds: ["stable-a"] },
                    { kind: "include-cells", rowIds: ["stable-a"], columnIds: ["computed"] },
                ],
            },
        });
        expect(gridSearchMatches("page-1", "42", {}, true)).toHaveLength(1);
    });

    it("keeps stable row identity for navigation", () => {
        const { navigated } = register();
        const [match] = gridSearchMatches("page-1", "beta", {});
        navigateGridSearchMatch(match);
        expect(navigated()).toBe("stable-a:name");
    });

    it("uses deterministic visible value representations", () => {
        expect(gridValueText(new Date("2025-01-02T00:00:00Z"))).toBe("2025-01-02T00:00:00.000Z");
        expect(gridValueText(false)).toBe("false");
    });

    it("marks read-only/computed hits as searchable but not replaceable", () => {
        register();
        const hits = gridSearchMatches("page-1", "alpha", {});
        expect(hits.find(hit => hit.columnId === "name")?.replaceable).toBe(true);
        const computedHits = gridSearchMatches("page-1", "read", {});
        expect(computedHits[0]?.replaceable).toBe(false);
    });
});

describe("unified Grid replace", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

    function register(
        gridId: string,
        placementId: string,
        rows: Record<string, unknown>[],
        selection?: import("../../services/yjstable/gridSelection").GridSelectionSnapshot,
    ) {
        cleanups.push(registerGridSearchProvider({
            snapshot: () => ({
                pageId: "page-1",
                pageTitle: "Page",
                placementId,
                gridId,
                columns: ["name", "computed"],
                rows,
                selection,
                rowId: row => String(row.id),
            }),
            navigate: () => {},
            clearHighlight: () => {},
            isCellReplaceable: (_rowId, columnId) => WRITABLE_COLUMNS.has(columnId),
            replaceCells: (entries: readonly GridCellReplacement[]): GridCellReplaceOutcome[] =>
                entries.map(entry => {
                    if (!WRITABLE_COLUMNS.has(entry.columnId)) {
                        return { ...entry, applied: false, reason: "read-only" };
                    }
                    if (entry.columnId === "computed") return { ...entry, applied: false, reason: "read-only" };
                    const row = rows.find(candidate => String(candidate.id) === entry.rowId);
                    if (!row) return { ...entry, applied: false, reason: "read-only" };
                    row[entry.columnId] = entry.newText;
                    return { ...entry, applied: true };
                }),
        }));
    }

    it("replaces one located match against the live cell value", () => {
        const rows = [{ id: "row-1", name: "hello world", computed: 1 }];
        register("grid-1", "placement-1", rows);
        const [match] = gridSearchMatches("page-1", "world", {});
        const outcome = replaceGridMatch(match, "world", "there", {});
        expect(outcome?.applied).toBe(true);
        expect(rows[0].name).toBe("hello there");
    });

    it("leaves a read-only/computed hit unmutated and reports why", () => {
        const rows = [{ id: "row-1", name: "hello", computed: "world value" }];
        register("grid-1", "placement-1", rows);
        const [match] = gridSearchMatches("page-1", "world", {});
        const outcome = replaceGridMatch(match, "world", "there", {});
        expect(outcome?.applied).toBe(false);
        expect(outcome?.reason).toBe("read-only");
        expect(rows[0].computed).toBe("world value");
    });

    it("Replace All deduplicates the same Grid placed twice on a page", () => {
        const rows = [{ id: "row-1", name: "duplicate target", computed: 1 }];
        // Two placements of the same underlying Grid share `gridId`/`rows` but
        // register separately, mirroring two TableGrid instances on one page.
        register("grid-shared", "placement-a", rows);
        register("grid-shared", "placement-b", rows);
        expect(gridSearchMatches("page-1", "duplicate", {})).toHaveLength(2);

        const outcome = replaceGridMatches("page-1", "duplicate", "single", {});
        expect(outcome.appliedCells).toBe(1);
        expect(outcome.skippedReadOnly).toBe(0);
        expect(outcome.skippedInvalid).toBe(0);
        expect(outcome.applied).toEqual([
            {
                placementId: "placement-a",
                gridId: "grid-shared",
                rowId: "row-1",
                columnId: "name",
                newText: "single target",
            },
        ]);
        expect(rows[0].name).toBe("single target");
    });

    it("Replace All respects Selection scope and counts read-only hits separately", () => {
        const rows = [
            { id: "row-1", name: "match here", computed: "match too" },
            { id: "row-2", name: "no hit", computed: "also no hit" },
        ];
        register("grid-1", "placement-1", rows, {
            regions: [{ kind: "cells", rowIds: ["row-1"], columnIds: ["name", "computed"] }],
        });
        const outcome = replaceGridMatches("page-1", "match", "found", {}, true);
        expect(outcome.appliedCells).toBe(1);
        expect(outcome.skippedReadOnly).toBe(1);
        expect(outcome.skippedInvalid).toBe(0);
        expect(rows[0].name).toBe("found here");
        expect(rows[0].computed).toBe("match too");
    });

    it("never expands $&/$1-style patterns in the replacement text (matches outline Replace semantics)", () => {
        const rows = [{ id: "row-1", name: "hello world", computed: 1 }];
        register("grid-1", "placement-1", rows);
        replaceGridMatches("page-1", "world", "[$&]", {});
        expect(rows[0].name).toBe("hello [$&]");
    });

    it("applyGridReplaceToMatches patches a held match list from the write outcome, not the (possibly stale) query result", () => {
        const rows = [{ id: "row-1", name: "hello world", computed: 1 }];
        register("grid-1", "placement-1", rows);
        const stale = gridSearchMatches("page-1", "world", {});
        expect(stale).toHaveLength(1);

        // The cell is already mutated in the fake store, but `stale` was
        // captured before that -- exactly the debounced-query situation
        // `applyGridReplaceToMatches` exists for.
        rows[0].name = "hello there";
        const patched = applyGridReplaceToMatches(
            stale,
            [{
                placementId: "placement-1",
                gridId: "grid-1",
                rowId: "row-1",
                columnId: "name",
                newText: "hello there",
            }],
            "page-1",
            "Page",
            "world",
            {},
        );
        expect(patched).toEqual([]);
    });
});
