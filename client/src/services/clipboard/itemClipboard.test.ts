import { describe, expect, it } from "vitest";
import { clipboardPlainText, deserializeClipboardItems, serializeClipboardItems } from "./itemClipboard";

function item(text: string, fields: Record<string, unknown>) {
    return {
        text,
        key: text || "block",
        tree: { getNodeValueFromKey: () => ({ get: (key: string) => fields[key] }) },
    };
}

describe("item clipboard", () => {
    it("round-trips text, table, and calendar items with their bindings", () => {
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

    it("uses a meaningful fallback for an empty block host", () => {
        const decoded = deserializeClipboardItems(serializeClipboardItems("project-a", [
            { item: item("", { componentType: "yjstable", yjsTableId: "table-1" }), depth: 0, fallbackText: "Sales" },
        ]));
        expect(decoded?.items[0].text).toBe("Sales");
    });

    it("rejects malformed clipboard data", () => {
        expect(deserializeClipboardItems("not json")).toBeUndefined();
        expect(deserializeClipboardItems('{"version":1,"sourceProjectId":"p","items":[{}]}')).toBeUndefined();
    });
});
