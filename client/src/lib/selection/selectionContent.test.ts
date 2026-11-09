import { describe, expect, it } from "vitest";
import {
    endpointOffsetInText,
    getItemSelectionInterval,
    isVisualNodeSelected,
    resolveSelectionFragments,
    type SelectionFragment,
    selectionFragmentsToPlainText,
    type SelectionRangeItem,
} from "./selectionContent";
import { nodeBoundaryEndpoint, normalizeSelectionEndpoints, textEndpoint } from "./selectionEndpoints";

/** Outline order backed by an explicit item list, so nothing here needs a layout engine. */
function orderedBy(itemIds: string[]) {
    return (a: string, b: string) => itemIds.indexOf(a) - itemIds.indexOf(b);
}

/** A Text node of `textLength` characters. */
function text(itemId: string, textLength: number, parentItemId?: string): SelectionRangeItem {
    return { itemId, isVisual: false, textLength, parentItemId };
}

/** A Grid, Calendar or Layout node: no text of its own (#5015). */
function visual(itemId: string, parentItemId?: string): SelectionRangeItem {
    return { itemId, isVisual: true, textLength: 0, parentItemId };
}

/** The outline every mixed case below is resolved against. */
const MIXED_ORDER = ["a", "grid", "calendar", "b"];
const MIXED_ITEMS = [text("a", 10), visual("grid"), visual("calendar"), text("b", 20)];
/** The same outline, spanned only as far as the Grid - what a caller passes for such a range. */
const UP_TO_GRID = MIXED_ITEMS.slice(0, 2);
/** The same outline, spanned from the Grid onwards. */
const FROM_GRID = MIXED_ITEMS.slice(1);

function normalize(
    start: Parameters<typeof normalizeSelectionEndpoints>[0],
    end: Parameters<typeof normalizeSelectionEndpoints>[1],
    order: string[] = MIXED_ORDER,
) {
    return normalizeSelectionEndpoints(start, end, orderedBy(order));
}

function fragmentsFor(
    start: Parameters<typeof normalizeSelectionEndpoints>[0],
    end: Parameters<typeof normalizeSelectionEndpoints>[1],
    items: SelectionRangeItem[] = MIXED_ITEMS,
    order: string[] = MIXED_ORDER,
): SelectionFragment[] {
    return resolveSelectionFragments(items, normalize(start, end, order));
}

describe("endpointOffsetInText", () => {
    it("clamps a text endpoint to the text it addresses", () => {
        expect(endpointOffsetInText(textEndpoint("a", 4), 10)).toBe(4);
        expect(endpointOffsetInText(textEndpoint("a", 40), 10)).toBe(10);
        expect(endpointOffsetInText(textEndpoint("a", -3), 10)).toBe(0);
    });

    it("maps a node boundary onto the matching edge of the text", () => {
        expect(endpointOffsetInText(nodeBoundaryEndpoint("grid", "before"), 10)).toBe(0);
        expect(endpointOffsetInText(nodeBoundaryEndpoint("grid", "after"), 10)).toBe(10);
        // The visual node the boundary belongs to owns no text at all.
        expect(endpointOffsetInText(nodeBoundaryEndpoint("grid", "after"), 0)).toBe(0);
    });
});

describe("getItemSelectionInterval", () => {
    const normalized = normalize(textEndpoint("a", 4), textEndpoint("c", 6), ["a", "b", "c"]);

    it("clips the first item at its start offset", () => {
        expect(getItemSelectionInterval("a", normalized, 10)).toEqual({ startOffset: 4, endOffset: 10 });
    });

    it("selects middle items completely", () => {
        expect(getItemSelectionInterval("b", normalized, 12)).toEqual({ startOffset: 0, endOffset: 12 });
    });

    it("clips the last item at its end offset", () => {
        expect(getItemSelectionInterval("c", normalized, 20)).toEqual({ startOffset: 0, endOffset: 6 });
    });

    it("clamps offsets that exceed the item text length", () => {
        expect(getItemSelectionInterval("c", normalized, 3)).toEqual({ startOffset: 0, endOffset: 3 });
    });

    it("returns undefined for an empty interval", () => {
        expect(getItemSelectionInterval("a", normalized, 4)).toBeUndefined();
        expect(getItemSelectionInterval("b", normalized, 0)).toBeUndefined();
    });

    it("returns the ordered interval for a single-item selection", () => {
        const single = normalize(textEndpoint("a", 8), textEndpoint("a", 2), ["a"]);
        expect(getItemSelectionInterval("a", single, 30)).toEqual({ startOffset: 2, endOffset: 8 });
    });

    it("lets a node boundary clip a Text item at one of its edges", () => {
        const fromAfterGrid = normalize(nodeBoundaryEndpoint("grid", "after"), textEndpoint("b", 6));
        expect(getItemSelectionInterval("b", fromAfterGrid, 20)).toEqual({ startOffset: 0, endOffset: 6 });

        const toBeforeGrid = normalize(textEndpoint("a", 4), nodeBoundaryEndpoint("grid", "before"));
        expect(getItemSelectionInterval("a", toBeforeGrid, 10)).toEqual({ startOffset: 4, endOffset: 10 });
    });
});

describe("isVisualNodeSelected", () => {
    it("includes a node the range spans", () => {
        expect(isVisualNodeSelected("grid", normalize(textEndpoint("a", 4), textEndpoint("b", 6)))).toBe(true);
    });

    it("excludes a node the range stops before and includes one it reaches past", () => {
        expect(isVisualNodeSelected("grid", normalize(textEndpoint("a", 4), nodeBoundaryEndpoint("grid", "before"))))
            .toBe(false);
        expect(isVisualNodeSelected("grid", normalize(textEndpoint("a", 4), nodeBoundaryEndpoint("grid", "after"))))
            .toBe(true);
        expect(isVisualNodeSelected("grid", normalize(nodeBoundaryEndpoint("grid", "before"), textEndpoint("b", 6))))
            .toBe(true);
        expect(isVisualNodeSelected("grid", normalize(nodeBoundaryEndpoint("grid", "after"), textEndpoint("b", 6))))
            .toBe(false);
    });

    it("reads a legacy text endpoint on a visual node per the consumer's rule", () => {
        const stoppedAt = normalize(textEndpoint("grid", 0), textEndpoint("b", 6));
        // The overlay: a node the drag stopped at is not highlighted (#5022).
        expect(isVisualNodeSelected("grid", stoppedAt)).toBe(false);
        // The clipboard: a block has no interior to stop short of, so it travels whole.
        expect(isVisualNodeSelected("grid", stoppedAt, false)).toBe(true);
    });
});

describe("resolveSelectionFragments", () => {
    it("resolves a text-to-text range exactly as before", () => {
        expect(fragmentsFor(textEndpoint("a", 4), textEndpoint("b", 6), [text("a", 10), text("b", 20)], ["a", "b"]))
            .toEqual([
                { kind: "text", itemId: "a", startOffset: 4, endOffset: 10 },
                { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
            ]);
    });

    it("stops at a Grid the range ends before", () => {
        expect(fragmentsFor(textEndpoint("a", 4), nodeBoundaryEndpoint("grid", "before"), UP_TO_GRID))
            .toEqual([{ kind: "text", itemId: "a", startOffset: 4, endOffset: 10 }]);
    });

    it("includes a Grid the range ends after", () => {
        expect(fragmentsFor(textEndpoint("a", 4), nodeBoundaryEndpoint("grid", "after"), UP_TO_GRID)).toEqual([
            { kind: "text", itemId: "a", startOffset: 4, endOffset: 10 },
            { kind: "node", itemId: "grid" },
        ]);
    });

    it("includes a Grid the range starts before", () => {
        expect(fragmentsFor(nodeBoundaryEndpoint("grid", "before"), textEndpoint("b", 6), FROM_GRID)).toEqual([
            { kind: "node", itemId: "grid" },
            { kind: "node", itemId: "calendar" },
            { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
        ]);
    });

    it("leaves out a Grid the range starts after", () => {
        expect(fragmentsFor(nodeBoundaryEndpoint("grid", "after"), textEndpoint("b", 6), FROM_GRID)).toEqual([
            { kind: "node", itemId: "calendar" },
            { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
        ]);
    });

    it("selects exactly one Grid between its own boundaries", () => {
        expect(
            fragmentsFor(nodeBoundaryEndpoint("grid", "before"), nodeBoundaryEndpoint("grid", "after"), [
                visual("grid"),
            ], ["grid"]),
        ).toEqual([{ kind: "node", itemId: "grid" }]);
    });

    it("selects a run of visual nodes with no text endpoint at all", () => {
        expect(
            fragmentsFor(nodeBoundaryEndpoint("grid", "before"), nodeBoundaryEndpoint("calendar", "after"), [
                visual("grid"),
                visual("calendar"),
            ], ["grid", "calendar"]),
        ).toEqual([
            { kind: "node", itemId: "grid" },
            { kind: "node", itemId: "calendar" },
        ]);
    });

    it("traverses a mixed Text/Grid/Calendar/Text range", () => {
        expect(fragmentsFor(textEndpoint("a", 4), textEndpoint("b", 6))).toEqual([
            { kind: "text", itemId: "a", startOffset: 4, endOffset: 10 },
            { kind: "node", itemId: "grid" },
            { kind: "node", itemId: "calendar" },
            { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
        ]);
    });

    it("never gives a visual node text offsets", () => {
        const fragments = fragmentsFor(textEndpoint("a", 4), nodeBoundaryEndpoint("calendar", "after"));
        for (const fragment of fragments.filter(f => f.kind === "node")) {
            expect(fragment).toEqual({ kind: "node", itemId: fragment.itemId });
        }
    });

    it("resolves a reversed range to the same fragments as the forward one", () => {
        expect(fragmentsFor(nodeBoundaryEndpoint("calendar", "after"), textEndpoint("a", 4)))
            .toEqual(fragmentsFor(textEndpoint("a", 4), nodeBoundaryEndpoint("calendar", "after")));
    });

    it("resolves a selected Layout as one container, not as its children", () => {
        const items = [
            text("a", 10),
            visual("layout"),
            visual("grid", "layout"),
            visual("calendar", "layout"),
            text("b", 20),
        ];

        expect(fragmentsFor(textEndpoint("a", 4), textEndpoint("b", 6), items, ["a", "layout", "b"])).toEqual([
            { kind: "text", itemId: "a", startOffset: 4, endOffset: 10 },
            { kind: "node", itemId: "layout" },
            { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
        ]);
    });

    it("leaves a Layout and its children out when the range stops at it", () => {
        const items = [visual("layout"), visual("grid", "layout"), text("a", 10)];

        expect(fragmentsFor(nodeBoundaryEndpoint("layout", "after"), textEndpoint("a", 6), items, ["layout", "a"]))
            .toEqual([{ kind: "text", itemId: "a", startOffset: 0, endOffset: 6 }]);
    });

    it("skips text items whose selected interval is empty", () => {
        const items = [text("a", 10), text("empty", 0), text("b", 20)];

        expect(fragmentsFor(textEndpoint("a", 4), textEndpoint("b", 6), items, ["a", "empty", "b"])).toEqual([
            { kind: "text", itemId: "a", startOffset: 4, endOffset: 10 },
            { kind: "text", itemId: "b", startOffset: 0, endOffset: 6 },
        ]);
    });
});

describe("selectionFragmentsToPlainText", () => {
    const texts: Record<string, string> = { a: "first item", b: "second item text" };

    it("skips textless visual nodes without inventing a label or a blank line", () => {
        const fragments = fragmentsFor(textEndpoint("a", 6), textEndpoint("b", 6));

        expect(selectionFragmentsToPlainText(fragments, id => texts[id] ?? "")).toBe("item\nsecond");
    });

    it("returns nothing for a range made only of visual nodes", () => {
        const fragments = fragmentsFor(
            nodeBoundaryEndpoint("grid", "before"),
            nodeBoundaryEndpoint("calendar", "after"),
            [visual("grid"), visual("calendar")],
            ["grid", "calendar"],
        );

        expect(selectionFragmentsToPlainText(fragments, id => texts[id] ?? "")).toBe("");
    });
});
