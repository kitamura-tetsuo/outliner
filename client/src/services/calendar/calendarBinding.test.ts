import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getItemCalendarId, observeItemCalendarId, setItemCalendarId } from "./calendarBinding";

function makeItem(doc: Y.Doc, key: string) {
    const nodeValue = doc.getMap<unknown>(`node-${key}`);
    return {
        item: {
            tree: { getNodeValueFromKey: (_k: string) => nodeValue },
            key,
        },
        nodeValue,
    };
}

describe("calendarBinding", () => {
    it("reads undefined when no calendar is bound", () => {
        const doc = new Y.Doc();
        const { item } = makeItem(doc, "item1");
        expect(getItemCalendarId(item)).toBeUndefined();
    });

    it("round-trips a bound calendar id", () => {
        const doc = new Y.Doc();
        const { item } = makeItem(doc, "item1");
        setItemCalendarId(item, "cal-123");
        expect(getItemCalendarId(item)).toBe("cal-123");
    });

    it("treats an empty string as unbound", () => {
        const doc = new Y.Doc();
        const { item, nodeValue } = makeItem(doc, "item1");
        nodeValue.set("calendarId", "");
        expect(getItemCalendarId(item)).toBeUndefined();
    });

    it("notifies observers when the binding changes, and only for that key", () => {
        const doc = new Y.Doc();
        const { item, nodeValue } = makeItem(doc, "item1");
        let notifications = 0;
        const unsubscribe = observeItemCalendarId(item, () => {
            notifications++;
        });

        setItemCalendarId(item, "cal-1");
        expect(notifications).toBe(1);

        nodeValue.set("unrelatedField", "x");
        expect(notifications).toBe(1);

        unsubscribe();
        setItemCalendarId(item, "cal-2");
        expect(notifications).toBe(1);
    });
});
