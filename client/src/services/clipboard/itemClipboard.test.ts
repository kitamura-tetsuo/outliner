import { describe, expect, it } from "vitest";
import {
    clipboardPlainText,
    deserializeClipboardItems,
    type GridTableSnapshot,
    serializeClipboardItems,
    structuredClipboardFromHtml,
    structuredClipboardHtml,
} from "./itemClipboard";

function item(text: string, fields: Record<string, unknown>) {
    return {
        text,
        key: text || "block",
        tree: { getNodeValueFromKey: () => ({ get: (key: string) => fields[key] }) },
    };
}

function tableSnapshot(sourceTableId = "table-1"): GridTableSnapshot {
    return {
        sourceTableId,
        name: "売上 📊",
        sqlName: "sales",
        schemaSql: "CREATE TABLE sales (id TEXT PRIMARY KEY, amount INTEGER)",
        ui: {
            query: "SELECT id, amount FROM sales ORDER BY amount",
            components: {
                amount: { type: "number", label: "金額 €", hidden: false },
                id: { hidden: true },
            },
            columnOrder: ["amount", "id"],
        },
    };
}

describe("item clipboard", () => {
    it("round-trips version 1 text, table, and calendar items with their bindings", () => {
        const encoded = serializeClipboardItems("project-a", [
            { item: item("note", {}), depth: 0 },
            { item: item("grid", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 1 },
            { item: item("calendar", { componentType: "calendar", calendarId: "calendar-1" }), depth: 0 },
        ]);
        const decoded = deserializeClipboardItems(encoded);

        expect(decoded).toEqual({
            version: 1,
            sourceProjectId: "project-a",
            items: [
                { text: "note", depth: 0 },
                // A visual node owns no outline text (#5015), so its own stale
                // text never travels on the clipboard.
                { text: "", depth: 1, componentType: "yjstable", yjsTableId: "table-1" },
                { text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            ],
        });
        expect(clipboardPlainText(decoded!)).toBe("note\n\n");
    });

    it("round-trips a deduplicated version 2 Grid structure snapshot", () => {
        const snapshot = tableSnapshot();
        const encoded = serializeClipboardItems(
            "project-a",
            [
                { item: item("first", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 },
                // Both at depth 0: a Grid is a leaf, so one can never be the
                // other's child (#5015).
                { item: item("second", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 },
            ],
            { "table-1": snapshot },
        );

        expect(deserializeClipboardItems(encoded)).toEqual({
            version: 2,
            sourceProjectId: "project-a",
            items: [
                { text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
                { text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
            ],
            tables: { "table-1": snapshot },
        });
        expect(Object.keys(JSON.parse(encoded).tables)).toEqual(["table-1"]);
        expect(encoded).not.toContain('"data"');
        expect(encoded).not.toContain("record");
    });

    it("round-trips version 2 Unicode and nested UI configuration through portable HTML", () => {
        const encoded = serializeClipboardItems(
            "プロジェクト-a",
            [{ item: item("グリッド", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 }],
            { "table-1": tableSnapshot() },
        );
        const html = structuredClipboardHtml(encoded, 'Sales & <Targets>\n"Q4"');

        expect(structuredClipboardFromHtml(html)).toBe(encoded);
        expect(deserializeClipboardItems(structuredClipboardFromHtml(html)!)).toEqual(
            deserializeClipboardItems(encoded),
        );
        expect(html).toContain("Sales &amp; &lt;Targets&gt;<br>&quot;Q4&quot;");
        expect(structuredClipboardFromHtml("<p>external content</p>")).toBeUndefined();
        expect(structuredClipboardFromHtml('<span data-outliner-items="not base64!" hidden></span>')).toBeUndefined();
    });

    it("round-trips version 3 with calendars", () => {
        const encoded = serializeClipboardItems(
            "project-a",
            [{ item: item("calendar", { componentType: "calendar", calendarId: "cal-1" }), depth: 0 }],
            undefined,
            {
                "cal-1": {
                    name: "My Cal",
                    query: "SELECT id FROM outline_items",
                    viewType: "week",
                    groupAxes: ["tags"],
                    laneOrder: [],
                } as unknown as import("../calendar/calendarService").CalendarSettings,
            },
        );
        const decoded = deserializeClipboardItems(encoded);
        expect(decoded).toMatchObject({
            version: 3,
            calendars: {
                "cal-1": {
                    name: "My Cal",
                    query: "SELECT id FROM outline_items",
                    viewType: "week",
                    groupAxes: ["tags"],
                    laneOrder: [],
                },
            },
        });
    });

    it("round-trips the private cut marker without adding it to ordinary copies", () => {
        const entries = [
            { item: item("grid", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 },
        ];
        const cut = serializeClipboardItems("project-a", entries, { "table-1": tableSnapshot() }, undefined, "cut");
        const copied = serializeClipboardItems("project-a", entries, { "table-1": tableSnapshot() }, undefined);

        expect(deserializeClipboardItems(cut)?.operation).toBe("cut");
        expect(deserializeClipboardItems(copied)?.operation).toBeUndefined();
    });

    it("never invents outline text for a copied block, even from stale item text", () => {
        const decoded = deserializeClipboardItems(serializeClipboardItems("project-a", [
            { item: item("stale caption", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 },
        ]));
        expect(decoded?.items[0].text).toBe("");
    });

    it("rejects a payload that gives a visual node outline text or children", () => {
        const withText = JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [{ text: "caption", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
        });
        expect(deserializeClipboardItems(withText)).toBeUndefined();

        const gridWithChild = JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [
                { text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
                { text: "child", depth: 1 },
            ],
        });
        expect(deserializeClipboardItems(gridWithChild)).toBeUndefined();

        const layoutWithTextChild = JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [
                { text: "", depth: 0, componentType: "layout" },
                { text: "heading", depth: 1 },
            ],
        });
        expect(deserializeClipboardItems(layoutWithTextChild)).toBeUndefined();

        const nestedLayout = JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [
                { text: "", depth: 0, componentType: "layout" },
                { text: "", depth: 1, componentType: "layout" },
            ],
        });
        expect(deserializeClipboardItems(nestedLayout)).toBeUndefined();

        const layoutWithBlock = JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [
                { text: "", depth: 0, componentType: "layout" },
                { text: "", depth: 1, componentType: "calendar", calendarId: "cal-1" },
            ],
        });
        expect(deserializeClipboardItems(layoutWithBlock)).not.toBeUndefined();
    });

    it("rejects malformed clipboard data and snapshots strictly", () => {
        expect(deserializeClipboardItems("not json")).toBeUndefined();
        expect(deserializeClipboardItems('{"version":1,"sourceProjectId":"p","items":[{}]}')).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [{ text: "text", depth: 0 }],
            tables: {},
        }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {},
        }))).toEqual({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {},
        });
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {
                "table-1": { ...tableSnapshot("different-id") },
            },
        }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {
                "table-1": {
                    ...tableSnapshot(),
                    data: { secret: { amount: 42 } },
                },
            },
        }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {
                "table-1": {
                    ...tableSnapshot(),
                    ui: { ...tableSnapshot().ui, components: { amount: { type: "script" } } },
                },
            },
        }))).toBeUndefined();
    });

    it("round-trips a copied Layout: the container, then its children with their spans", () => {
        // The Layout carries no binding of its own - it owns ordinary tree
        // children, which travel as the deeper items that follow it (#4997).
        const encoded = serializeClipboardItems("project-a", [
            { item: item("", { componentType: "layout" }), depth: 0 },
            { item: item("grid", { componentType: "yjstable", yjsTableId: "table-1", columnSpan: 4 }), depth: 1 },
            { item: item("cal", { componentType: "calendar", calendarId: "cal-1", columnSpan: 8 }), depth: 1 },
        ]);

        expect(deserializeClipboardItems(encoded)).toEqual({
            version: 1,
            sourceProjectId: "project-a",
            items: [
                { text: "", depth: 0, componentType: "layout" },
                { text: "", depth: 1, componentType: "yjstable", yjsTableId: "table-1", columnSpan: 4 },
                { text: "", depth: 1, componentType: "calendar", calendarId: "cal-1", columnSpan: 8 },
            ],
        });
    });

    it("normalizes a copied span into the 12-column range", () => {
        const encoded = serializeClipboardItems("project-a", [
            { item: item("wide", { componentType: "yjstable", yjsTableId: "t", columnSpan: 99 }), depth: 0 },
            { item: item("narrow", { componentType: "yjstable", yjsTableId: "t", columnSpan: 0 }), depth: 0 },
            { item: item("fractional", { componentType: "yjstable", yjsTableId: "t", columnSpan: 4.7 }), depth: 0 },
        ]);

        expect(deserializeClipboardItems(encoded)!.items.map(entry => entry.columnSpan)).toEqual([12, 1, 4]);
    });

    it("leaves a span off an ordinary text item, which has no layout width", () => {
        const encoded = serializeClipboardItems("project-a", [
            { item: item("note", { columnSpan: 6 }), depth: 0 },
        ]);

        expect(deserializeClipboardItems(encoded)!.items).toEqual([{ text: "note", depth: 0 }]);
    });

    it("rejects a payload whose span is outside the 12-column range", () => {
        expect(deserializeClipboardItems(JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "t", columnSpan: 13 }],
        }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "t", columnSpan: 2.5 }],
        }))).toBeUndefined();
    });

    it("rejects a Layout payload that claims a component binding", () => {
        expect(deserializeClipboardItems(JSON.stringify({
            version: 1,
            sourceProjectId: "p",
            items: [{ text: "", depth: 0, componentType: "layout", yjsTableId: "t" }],
        }))).toBeUndefined();
    });
});
