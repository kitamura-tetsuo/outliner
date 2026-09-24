// Cross-client Diagram cursor presence (issue #5312).
//
// `resolveDiagramCursor` cares only about decoding a Yjs relative position
// against whatever a project's current document contains — it makes no
// distinction between "this edit came from a peer" and "this edit happened
// locally since the position was captured". So a single `Project` exercises
// the same relative-position decode path a genuine second client would hit,
// without needing to hand-roll a second `Y.Doc` and merge updates into it in
// a unit test (that would drag in `yjs-orderedtree`'s outline-tree
// bookkeeping for content this suite never touches). The real two-client,
// two-transport story is the E2E suite's job (dia-cross-client-cursor-sync);
// per the issue's own implementation notes, direct Y.Text-level coverage
// like this is supplementary, not the primary oracle.

import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { encodeDiagramCursor, parseDiagramCursorsWire, resolveDiagramCursor } from "./diagramPresence";
import { createDiagram, setDiagramSource } from "./diagramService";

describe("diagramPresence (#5312)", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.fromDoc(new Y.Doc());
    });

    function sourceOf(diagramId: string): Y.Text {
        return project.diagrams.get(diagramId)!.get("source") as Y.Text;
    }

    it("resolves a cursor against the current source", () => {
        const diagramId = createDiagram(project, { initialSource: "abc" });
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 2);
        expect(wire).toBeDefined();
        expect(resolveDiagramCursor(project, wire!)).toEqual({ offset: 2, selection: undefined });
    });

    it("is pending (undefined) for a Diagram that does not exist locally", () => {
        const other = createDiagram(project, { initialSource: "abc" });
        const wire = encodeDiagramCursor(other, "cursor-1", sourceOf(other), 2)!;
        const emptyProject = Project.fromDoc(new Y.Doc());
        expect(resolveDiagramCursor(emptyProject, wire)).toBeUndefined();
    });

    it("resolves once the Diagram becomes available, with no new position needed (REQ-005)", () => {
        // Encode against a throwaway source first, addressed to a diagramId
        // that does not exist in `project` yet: exactly the shape of a
        // presence record that arrived before its Diagram synced.
        const laterDiagramId = "diagram-not-yet-created";
        const doc = new Y.Doc();
        const stagingText = doc.getText("staging");
        stagingText.insert(0, "abc");
        const wire = encodeDiagramCursor(laterDiagramId, "cursor-1", stagingText, 2)!;

        expect(resolveDiagramCursor(project, wire)).toBeUndefined();
    });

    it("rebases across an insertion strictly before the anchor (REQ-005)", () => {
        const diagramId = createDiagram(project, { initialSource: "abc" });
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 2)!;

        // An edit — indistinguishable here from a remote peer's — lands
        // before the captured anchor. Yjs's own relative-position semantics,
        // not manual offset math, must carry the caret forward.
        sourceOf(diagramId).insert(0, "XY");
        expect(sourceOf(diagramId).toString()).toBe("XYabc");
        expect(resolveDiagramCursor(project, wire)).toEqual({ offset: 4, selection: undefined });
    });

    it("does not shift for an edit strictly after the anchor", () => {
        const diagramId = createDiagram(project, { initialSource: "hello world" });
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 11)!; // end of string

        setDiagramSource(project, diagramId, "hello world!");
        expect(resolveDiagramCursor(project, wire)).toEqual({ offset: 11, selection: undefined });
    });

    it("round-trips a non-collapsed selection", () => {
        const diagramId = createDiagram(project, { initialSource: "abcdef" });
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 5, {
            start: 1,
            end: 4,
            isReversed: true,
        })!;
        expect(resolveDiagramCursor(project, wire)).toEqual({ offset: 5, selection: { start: 1, end: 4 } });
    });

    it("rejects a wire whose position belongs to a different Diagram's source", () => {
        const diagramA = createDiagram(project, { initialSource: "abc" });
        const diagramB = createDiagram(project, { initialSource: "xyz" });

        // Forged/corrupted: claims to target diagramB but carries diagramA's position.
        const wire = encodeDiagramCursor(diagramA, "cursor-1", sourceOf(diagramA), 1)!;
        const forged = { ...wire, diagramId: diagramB };
        expect(resolveDiagramCursor(project, forged)).toBeUndefined();
    });

    it("clamps an out-of-range offset instead of throwing", () => {
        const diagramId = createDiagram(project, { initialSource: "ab" });
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 999)!;
        expect(resolveDiagramCursor(project, wire)).toEqual({ offset: 2, selection: undefined });
    });

    it("returns undefined for a source not yet part of any document", () => {
        const detached = new Y.Text("orphan");
        expect(encodeDiagramCursor("diagram-1", "cursor-1", detached, 0)).toBeUndefined();
    });

    describe("parseDiagramCursorsWire", () => {
        it("accepts a well-formed list", () => {
            const diagramId = createDiagram(project, { initialSource: "abc" });
            const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 1)!;
            expect(parseDiagramCursorsWire([wire])).toEqual([wire]);
        });

        it("drops entries missing required fields rather than throwing", () => {
            expect(parseDiagramCursorsWire([{ diagramId: "d1" }])).toEqual([]);
            expect(parseDiagramCursorsWire([{ cursorId: "c1", position: {} }])).toEqual([]);
            expect(parseDiagramCursorsWire([{ diagramId: "d1", cursorId: "c1", position: "not-an-object" }])).toEqual(
                [],
            );
        });

        it("returns undefined for non-array input, including null and objects", () => {
            expect(parseDiagramCursorsWire(undefined)).toBeUndefined();
            expect(parseDiagramCursorsWire(null)).toBeUndefined();
            expect(parseDiagramCursorsWire({})).toBeUndefined();
            expect(parseDiagramCursorsWire("garbage")).toBeUndefined();
        });

        it("drops a selection missing either endpoint but keeps the position", () => {
            const diagramId = createDiagram(project, { initialSource: "abc" });
            const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceOf(diagramId), 1)!;
            const malformed = { ...wire, selection: { anchor: wire.position } };
            const [parsed] = parseDiagramCursorsWire([malformed])!;
            expect(parsed.selection).toBeUndefined();
            expect(parsed.position).toEqual(wire.position);
        });
    });
});
