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
                { text: "grid", depth: 1, componentType: "yjstable", yjsTableId: "table-1" },
                { text: "calendar", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            ],
        });
        expect(clipboardPlainText(decoded!)).toBe("note\ngrid\ncalendar");
    });

    it("round-trips a deduplicated version 2 Grid structure snapshot", () => {
        const snapshot = tableSnapshot();
        const encoded = serializeClipboardItems(
            "project-a",
            [
                { item: item("first", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0 },
                { item: item("second", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 1 },
            ],
            { "table-1": snapshot },
        );

        expect(deserializeClipboardItems(encoded)).toEqual({
            version: 2,
            sourceProjectId: "project-a",
            items: [
                { text: "first", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
                { text: "second", depth: 1, componentType: "yjstable", yjsTableId: "table-1" },
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
                } as any,
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

    it("uses a meaningful fallback for an empty block host", () => {
        const decoded = deserializeClipboardItems(serializeClipboardItems("project-a", [
            { item: item("", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0, fallbackText: "Sales" },
        ]));
        expect(decoded?.items[0].text).toBe("Sales");
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
            items: [{ text: "grid", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {},
        }))).toEqual({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "grid", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {},
        });
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "grid", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {
                "table-1": { ...tableSnapshot("different-id") },
            },
        }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({
            version: 2,
            sourceProjectId: "p",
            items: [{ text: "grid", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
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
            items: [{ text: "grid", depth: 0, componentType: "yjstable", yjsTableId: "table-1" }],
            tables: {
                "table-1": {
                    ...tableSnapshot(),
                    ui: { ...tableSnapshot().ui, components: { amount: { type: "script" } } },
                },
            },
        }))).toBeUndefined();
    });
});
