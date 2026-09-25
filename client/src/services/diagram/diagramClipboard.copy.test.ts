// Structural Copy/Paste of Diagram transclusions duplicates the Diagram (#5314).
// Runs against a real Y.Doc project; payloads come from the production
// serializer and snapshotter, never from hand-written JSON (except the
// explicitly negative validation cases).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    addDiagram,
    addOccurrence,
    addText,
    copyPayload,
    createFixture,
    diagramIdOf,
    type Fixture,
    outline,
    pasteContext,
} from "../../tests/fixtures/diagramClipboardFixture";
import { deserializeClipboardItems, serializeClipboardItems } from "../clipboard/itemClipboard";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { pasteDiagramPayload } from "./diagramClipboard";
import { getDiagram, listDiagrams, setDiagramSource } from "./diagramService";

describe("Diagram structural Copy/Paste (#5314)", () => {
    let fx: Fixture;
    beforeEach(() => {
        fx = createFixture();
    });
    afterEach(() => fx.dispose());

    it("pastes an independent Diagram with a fresh identity and equal source (REQ-002, REQ-004)", () => {
        const source = "graph TD\n  A-->B  \n\t%% ünïcødé 🚀\n";
        const d = addDiagram(fx.project, source);
        const occurrence = addOccurrence(fx.page, d);
        const anchor = addText(fx.page, "anchor");
        const payload = copyPayload(fx, [occurrence]);

        const result = pasteDiagramPayload(payload, pasteContext(fx, anchor));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.diagramIdMap![d];
        expect(e).toBeDefined();
        expect(e).not.toBe(d);
        expect(getDiagram(fx.project, e)?.source).toBe(source);
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "anchor", `diagram:${e}`]);
        const pasted = [...fx.page.items][2];
        expect(pasted.id).not.toBe(occurrence.id);

        // Independent collaborative source: edits to either side stay there.
        setDiagramSource(fx.project, e, "graph LR");
        expect(getDiagram(fx.project, d)?.source).toBe(source);
        setDiagramSource(fx.project, d, "flowchart");
        expect(getDiagram(fx.project, e)?.source).toBe("graph LR");
    });

    it("preserves empty and invalid source exactly", () => {
        for (const source of ["", "not mermaid ((("]) {
            const d = addDiagram(fx.project, source);
            const payload = copyPayload(fx, [addOccurrence(fx.page, d)]);
            const result = pasteDiagramPayload(payload, pasteContext(fx, undefined));
            expect(result.ok && getDiagram(fx.project, result.diagramIdMap![d])?.source).toBe(source);
        }
    });

    it("shares one new Diagram per original within a Paste, and allocates afresh per Paste (REQ-003)", () => {
        const d = addDiagram(fx.project, "copy-time");
        const other = addDiagram(fx.project, "other");
        const root = addText(fx.page, "root");
        addOccurrence(root, d);
        addOccurrence(root, other);
        addOccurrence(root, d);
        const anchor = addText(fx.page, "anchor");
        const payload = copyPayload(fx, [root]);
        // Changing D after Copy does not change the copy-time snapshot.
        setDiagramSource(fx.project, d, "changed later");

        const first = pasteDiagramPayload(payload, pasteContext(fx, anchor));
        const second = pasteDiagramPayload(payload, pasteContext(fx, anchor));
        if (!first.ok || !second.ok) throw new Error("paste failed");
        const e = first.diagramIdMap![d];
        const f = second.diagramIdMap![d];
        expect(new Set([d, e, f]).size).toBe(3);
        expect(first.diagramIdMap![other]).not.toBe(e);
        expect(getDiagram(fx.project, e)?.source).toBe("copy-time");
        expect(getDiagram(fx.project, f)?.source).toBe("copy-time");

        // Each pasted group keeps its hierarchy and its own shared Diagram.
        const firstRoot = fx.page.items.at(3)!;
        expect(outline(firstRoot)).toEqual([
            `diagram:${e}`,
            `diagram:${first.diagramIdMap![other]}`,
            `diagram:${e}`,
        ]);
        expect(outline(fx.page.items.at(2)!)).toEqual([
            `diagram:${f}`,
            `diagram:${second.diagramIdMap![other]}`,
            `diagram:${f}`,
        ]);
    });

    it("keeps Diagram objects out of the placement history and the history as one command (REQ-009)", () => {
        const d = addDiagram(fx.project, "src");
        const occurrence = addOccurrence(fx.page, d);
        const anchor = addText(fx.page, "anchor");
        const depth = globalUndoRouter.undoDepth;
        const result = pasteDiagramPayload(copyPayload(fx, [occurrence]), pasteContext(fx, anchor));
        if (!result.ok) throw new Error(result.reason);
        const e = result.diagramIdMap![d];
        expect(globalUndoRouter.undoDepth).toBe(depth + 1);

        const pastedId = [...fx.page.items][2].id;
        // A peer edits E's source; it is not part of local history.
        fx.peer(peer => setDiagramSource(peer, e, "remote"));

        globalUndoRouter.undo();
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "anchor"]);
        expect(listDiagrams(fx.project).map(x => x.id)).toContain(e);
        expect(getDiagram(fx.project, e)?.source).toBe("remote");

        globalUndoRouter.redo();
        const restored = [...fx.page.items][2];
        expect(restored.id).toBe(pastedId);
        expect(diagramIdOf(restored)).toBe(e);
        expect(listDiagrams(fx.project)).toHaveLength(2);
        expect(getDiagram(fx.project, e)?.source).toBe("remote");
    });
});

describe("Diagram Copy payload refusals (#5314, REQ-007)", () => {
    let fx: Fixture;
    beforeEach(() => {
        fx = createFixture();
    });
    afterEach(() => fx.dispose());

    it("refuses a cross-project, a denied or an invalid destination before any write", () => {
        const d = addDiagram(fx.project, "x");
        const text = addText(fx.page, "text");
        addOccurrence(text, d);
        const payload = copyPayload(fx, [text]);
        const layout = fx.page.items.addNode("tester");
        layout.componentType = "layout";
        const layoutChild = addOccurrence(layout, d);
        const before = JSON.stringify(outline(fx.page));
        const diagrams = listDiagrams(fx.project).length;

        const foreign = { ...payload, sourceProjectId: "another-project" };
        expect(pasteDiagramPayload(foreign, pasteContext(fx, text))).toMatchObject({ reason: "cross-project" });
        const denied = { ...pasteContext(fx, text), auth: { ...pasteContext(fx, text).auth, surfaceWritable: false } };
        expect(pasteDiagramPayload(payload, denied)).toMatchObject({ reason: "capability-denied" });
        // A Text root cannot become a Layout child.
        expect(pasteDiagramPayload(payload, pasteContext(fx, layoutChild))).toMatchObject({
            reason: "invalid-destination",
        });
        expect(JSON.stringify(outline(fx.page))).toBe(before);
        expect(listDiagrams(fx.project)).toHaveLength(diagrams);
    });

    it("accepts a lone transclusion as a Layout visual-leaf child", () => {
        const d = addDiagram(fx.project, "x");
        const payload = copyPayload(fx, [addOccurrence(fx.page, d)]);
        const layout = fx.page.items.addNode("tester");
        layout.componentType = "layout";
        const child = addOccurrence(layout, d);
        const result = pasteDiagramPayload(payload, pasteContext(fx, child));
        expect(result.ok).toBe(true);
        expect(outline(layout)).toEqual([`diagram:${d}`, `diagram:${result.ok && result.diagramIdMap![d]}`]);
    });

    it("rejects a Copy payload whose snapshot is missing or corrupt", () => {
        const d = addDiagram(fx.project, "x");
        const payload = copyPayload(fx, [addOccurrence(fx.page, d)]);
        expect(deserializeClipboardItems(JSON.stringify({ ...payload, diagrams: {} }))).toBeUndefined();
        expect(deserializeClipboardItems(JSON.stringify({ ...payload, diagrams: { [d]: { format: "mermaid" } } })))
            .toBeUndefined();
        // A Diagram item never travels in a pre-Diagram payload version.
        expect(deserializeClipboardItems(JSON.stringify({ ...payload, version: 3, diagrams: undefined })))
            .toBeUndefined();
        expect(() => serializeClipboardItems(fx.project.ydoc.guid, [{ item: [...fx.page.items][0], depth: 0 }]))
            .toThrow();
    });
});
