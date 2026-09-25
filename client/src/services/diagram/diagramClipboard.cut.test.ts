// Structural Cut/Paste of Diagram transclusions moves live nodes (#5314).
// Runs against a real Y.Doc project with the production outline UndoManager
// registered in the global router.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    addDiagram,
    addOccurrence,
    addText,
    createFixture,
    cutPayload,
    diagramIdOf,
    type Fixture,
    outline,
    pasteContext,
} from "../../tests/fixtures/diagramClipboardFixture";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { pasteDiagramPayload } from "./diagramClipboard";
import { invalidatePendingCut, pendingCutState } from "./diagramClipboardTransfer";
import { getDiagram, listDiagrams, setDiagramSource } from "./diagramService";

describe("Diagram structural Cut/Paste (#5314)", () => {
    let fx: Fixture;
    beforeEach(() => {
        fx = createFixture();
    });
    afterEach(() => {
        invalidatePendingCut();
        fx.dispose();
    });

    it("stages without removing, then moves the live nodes once (REQ-005, REQ-006)", () => {
        const d = addDiagram(fx.project, "v1");
        const text = addText(fx.page, "subtree");
        const occurrence = addOccurrence(text, d);
        const target = addText(fx.page, "target");
        const depth = globalUndoRouter.undoDepth;
        const payload = cutPayload(fx, [text]);

        // Pending: nothing moved, nothing allocated, no history entry.
        expect(outline(fx.page)).toEqual([["subtree", [`diagram:${d}`]], "target"]);
        expect(globalUndoRouter.undoDepth).toBe(depth);
        expect(pendingCutState(payload.transferId!)).toBe("pending");

        // Content-only edits accepted while pending travel with the move.
        text.updateText("subtree edited");
        fx.peer(peer => setDiagramSource(peer, d, "v2 remote"));
        expect(pendingCutState(payload.transferId!)).toBe("pending");

        const result = pasteDiagramPayload(payload, pasteContext(fx, target));
        expect(result).toMatchObject({ ok: true, itemIds: [text.id] });
        expect(outline(fx.page)).toEqual(["target", ["subtree edited", [`diagram:${d}`]]]);
        expect([...fx.page.items.at(1)!.items][0].id).toBe(occurrence.id);
        expect(listDiagrams(fx.project)).toHaveLength(1);
        expect(getDiagram(fx.project, d)?.source).toBe("v2 remote");
        expect(globalUndoRouter.undoDepth).toBe(depth + 1);

        // Consumed exactly once — Undo/Redo never reactivates it.
        const again = () => pasteDiagramPayload(payload, pasteContext(fx, fx.page.items.at(0)!));
        expect(again()).toMatchObject({ ok: false, reason: "already-consumed" });
        globalUndoRouter.undo();
        expect(outline(fx.page)).toEqual([["subtree edited", [`diagram:${d}`]], "target"]);
        expect(again()).toMatchObject({ ok: false, reason: "already-consumed" });
        globalUndoRouter.redo();
        expect(outline(fx.page)).toEqual(["target", ["subtree edited", [`diagram:${d}`]]]);
        expect(again()).toMatchObject({ ok: false, reason: "already-consumed" });
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });

    it("keeps a Cut pending across a rejected or denied Paste and retries without another Cut", () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const text = addText(fx.page, "text");
        const layout = fx.page.items.addNode("tester");
        layout.componentType = "layout";
        const layoutChild = addOccurrence(layout, d);
        const payload = cutPayload(fx, [occurrence, text]);
        const before = JSON.stringify(outline(fx.page));

        // Text cannot enter a Layout: the whole move is refused.
        expect(pasteDiagramPayload(payload, pasteContext(fx, layoutChild))).toMatchObject({
            reason: "invalid-destination",
        });
        const denied = {
            ...pasteContext(fx, layout),
            auth: { ...pasteContext(fx, layout).auth, surfaceWritable: false },
        };
        expect(pasteDiagramPayload(payload, denied)).toMatchObject({ reason: "capability-denied" });
        // Anchored on a node it carries along.
        expect(pasteDiagramPayload(payload, pasteContext(fx, text))).toMatchObject({ reason: "invalid-destination" });
        expect(JSON.stringify(outline(fx.page))).toBe(before);
        expect(pendingCutState(payload.transferId!)).toBe("pending");

        expect(pasteDiagramPayload(payload, pasteContext(fx, layout)).ok).toBe(true);
        expect(outline(fx.page)).toEqual([["layout", [`diagram:${d}`]], `diagram:${d}`, "text"]);
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });

    it("refuses to move a subtree beneath itself", () => {
        const d = addDiagram(fx.project, "x");
        const parent = addText(fx.page, "parent");
        const child = addText(parent, "child");
        addOccurrence(parent, d);
        const payload = cutPayload(fx, [parent]);
        expect(pasteDiagramPayload(payload, pasteContext(fx, child))).toMatchObject({
            reason: "invalid-destination",
        });
        expect(pendingCutState(payload.transferId!)).toBe("pending");
    });

    it("invalidates on structural change for good, but not on content edits (REQ-014)", () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const other = addText(fx.page, "other");
        const payload = cutPayload(fx, [occurrence]);
        const originalIndex = occurrence.indexInParent();

        // A peer moves the occurrence away and back: same visible position, still stale.
        fx.peer(peer => {
            const page = peer.items.at(0)!;
            const moved = [...page.items][originalIndex];
            const peerOther = [...page.items][1];
            peer.tree.moveChildToParent(moved.key, peerOther.key);
            peer.tree.recomputeParentsAndChildren();
            peer.tree.moveChildToParent(moved.key, page.key);
            peer.tree.recomputeParentsAndChildren();
            peer.tree.setNodeBefore(moved.key, peerOther.key);
        });
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "other"]);
        expect(pendingCutState(payload.transferId!)).toBe("invalid");
        expect(pasteDiagramPayload(payload, pasteContext(fx, other))).toMatchObject({ reason: "stale-transfer" });
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "other"]);

        // A fresh Cut of the current selection succeeds.
        const fresh = cutPayload(fx, [occurrence]);
        expect(pasteDiagramPayload(fresh, pasteContext(fx, other)).ok).toBe(true);
        expect(outline(fx.page)).toEqual(["other", `diagram:${d}`]);
    });

    it("invalidates when subtree membership changes or the transfer is replaced", () => {
        const d = addDiagram(fx.project, "x");
        const parent = addText(fx.page, "parent");
        addOccurrence(parent, d);
        const payload = cutPayload(fx, [parent]);
        addText(parent, "new descendant");
        expect(pendingCutState(payload.transferId!)).toBe("invalid");

        const second = cutPayload(fx, [parent]);
        invalidatePendingCut(); // e.g. a subsequent Copy in this editor
        expect(pasteDiagramPayload(second, pasteContext(fx, undefined))).toMatchObject({ reason: "stale-transfer" });
        const forged = { ...second, transferId: "forged" };
        expect(pasteDiagramPayload(forged, pasteContext(fx, undefined))).toMatchObject({
            reason: "unknown-transfer",
        });
    });

    it("refuses replay of the move while unauthorized, leaving both stacks unchanged (REQ-012)", () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const target = addText(fx.page, "target");
        expect(pasteDiagramPayload(cutPayload(fx, [occurrence]), pasteContext(fx, target)).ok).toBe(true);
        const undo = globalUndoRouter.undoDepth;
        const redo = globalUndoRouter.redoDepth;

        fx.surface.writable = false;
        globalUndoRouter.undo();
        expect(outline(fx.page)).toEqual(["target", `diagram:${d}`]);
        expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual([undo, redo]);

        fx.surface.writable = true;
        globalUndoRouter.undo();
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "target"]);
    });

    it("replays with native selective inverse after a peer moved the node on (REQ-015)", () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const b = addText(fx.page, "B");
        const c = addText(fx.page, "C");
        expect(pasteDiagramPayload(cutPayload(fx, [occurrence]), pasteContext(fx, b)).ok).toBe(true);
        expect(outline(fx.page)).toEqual(["B", `diagram:${d}`, "C"]);

        // A peer moves it under C and edits its source.
        fx.peer(peer => {
            peer.tree.moveChildToParent(occurrence.key, c.key);
            setDiagramSource(peer, d, "peer");
        });
        expect(outline(fx.page)).toEqual(["B", ["C", [`diagram:${d}`]]]);

        // Undo inverts only the local edge change; the peer's later edge wins.
        globalUndoRouter.undo();
        expect(outline(fx.page)).toEqual(["B", ["C", [`diagram:${d}`]]]);
        expect(getDiagram(fx.project, d)?.source).toBe("peer");
        expect(diagramIdOf([...c.items][0])).toBe(d);
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });
});
