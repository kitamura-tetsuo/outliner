import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getItemDiagramId, observeItemDiagramId, setItemDiagramId } from "./diagramBinding";

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

describe("diagramBinding (#5310)", () => {
    it("reads undefined when no Diagram is bound", () => {
        const doc = new Y.Doc();
        const { item } = makeItem(doc, "item1");
        expect(getItemDiagramId(item)).toBeUndefined();
    });

    it("round-trips a bound Diagram id", () => {
        const doc = new Y.Doc();
        const { item } = makeItem(doc, "item1");
        setItemDiagramId(item, "diagram-123");
        expect(getItemDiagramId(item)).toBe("diagram-123");
    });

    it("treats an empty string as unbound", () => {
        const doc = new Y.Doc();
        const { item, nodeValue } = makeItem(doc, "item1");
        nodeValue.set("diagramId", "");
        expect(getItemDiagramId(item)).toBeUndefined();
    });

    it("notifies observers when the binding changes, and only for that key", () => {
        const doc = new Y.Doc();
        const { item, nodeValue } = makeItem(doc, "item1");
        let notifications = 0;
        const unsubscribe = observeItemDiagramId(item, () => {
            notifications++;
        });

        setItemDiagramId(item, "diagram-1");
        expect(notifications).toBe(1);

        nodeValue.set("unrelatedField", "x");
        expect(notifications).toBe(1);

        unsubscribe();
        setItemDiagramId(item, "diagram-2");
        expect(notifications).toBe(1);
    });
});
