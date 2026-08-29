import { afterEach, describe, expect, it } from "vitest";
import { gridSearchMatches, gridValueText, navigateGridSearchMatch, registerGridSearchProvider } from "./unifiedSearch";

describe("unified Grid search", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

    function register(selection?: import("../../services/yjstable/gridSelection").GridSelectionSnapshot) {
        let navigated = "";
        cleanups.push(registerGridSearchProvider({
            snapshot: () => ({
                pageId: "page-1",
                pageTitle: "Page",
                placementId: "placement-1",
                gridId: "grid-1",
                columns: ["name", "computed"],
                rows: [
                    { id: "stable-b", name: "Alpha", computed: "READ ONLY" },
                    { id: "stable-a", name: "beta alpha", computed: 42 },
                ],
                selection,
                rowId: row => String(row.id),
            }),
            navigate: match => {
                navigated = `${match.rowId}:${match.columnId}`;
            },
            clearHighlight: () => {},
        }));
        return () => navigated;
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
        register({ regions: [{ kind: "columns", columnIds: ["computed"] }] });
        expect(gridSearchMatches("page-1", "alpha", {}, true)).toEqual([]);
        expect(gridSearchMatches("page-1", "42", {}, true)).toHaveLength(1);
    });

    it("gives explicitly re-added cells precedence over broad exclusions", () => {
        register({
            regions: [
                { kind: "columns", columnIds: ["computed"] },
                { kind: "exclude-rows", rowIds: ["stable-a"] },
                { kind: "include-cells", rowIds: ["stable-a"], columnIds: ["computed"] },
            ],
        });
        expect(gridSearchMatches("page-1", "42", {}, true)).toHaveLength(1);
    });

    it("keeps stable row identity for navigation", () => {
        const navigated = register();
        const [match] = gridSearchMatches("page-1", "beta", {});
        navigateGridSearchMatch(match);
        expect(navigated()).toBe("stable-a:name");
    });

    it("uses deterministic visible value representations", () => {
        expect(gridValueText(new Date("2025-01-02T00:00:00Z"))).toBe("2025-01-02T00:00:00.000Z");
        expect(gridValueText(false)).toBe("false");
    });
});
