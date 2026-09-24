// Withdrawal of a peer's Diagram cursor presence on departure (issue #5312,
// REQ-006/REQ-007), exercised through the real `y-protocols/awareness`
// removal primitive rather than waiting on an actual network disconnect's
// timing — which server-side heartbeat/expiry owns, not this feature (see
// the issue's non-goals). `removeAwarenessStates`/`encodeAwarenessUpdate`/
// `applyAwarenessUpdate` are exactly what a real provider uses internally to
// propagate a closed connection to every other peer.

import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../../lib/yjs/service";
import { encodeDiagramCursor } from "../../../services/diagram/diagramPresence";
import { createDiagram, getDiagramSourceYText } from "../../../services/diagram/diagramService";
import { diagramPresenceStore } from "../../../stores/DiagramPresenceStore.svelte";

/** Propagate `from`'s current local state for its own clientID to `to`, as a real provider would relay it. */
function relay(from: Awareness, to: Awareness): void {
    applyAwarenessUpdate(to, encodeAwarenessUpdate(from, [from.clientID]), "relay");
}

describe("Diagram cursor presence withdrawal on departure (#5312)", () => {
    it("withdraws a peer's cursor when its awareness state is removed", () => {
        const project = Project.fromDoc(new Y.Doc());
        const diagramId = createDiagram(project, { initialSource: "abcdef" });
        const source = getDiagramSourceYText(project, diagramId)!;

        // Two independent awareness connections on two independent docs,
        // exactly like two browser tabs each with their own Y.Doc.
        const awarenessA = new Awareness(new Y.Doc());
        const awarenessB = new Awareness(new Y.Doc());
        const unbindB = yjsService.bindProjectPresence(awarenessB);

        try {
            awarenessA.setLocalStateField("user", { userId: "alice", name: "Alice" });
            const wire = encodeDiagramCursor(diagramId, "cursor-1", source, 3)!;
            awarenessA.setLocalStateField("presence", { diagramCursors: [wire] });
            relay(awarenessA, awarenessB);

            expect(diagramPresenceStore.hasLiveFor(diagramId, true)).toBe(true);
            expect(diagramPresenceStore.resolvedEntriesFor(diagramId, project, true)).toEqual([
                expect.objectContaining({ userId: "alice", cursorId: "cursor-1", offset: 3 }),
            ]);

            // A's connection is torn down: the production provider calls this
            // exact primitive (or the network peer does, on socket close) to
            // announce the departure to every other client.
            removeAwarenessStates(awarenessA, [awarenessA.clientID], "connection closed");
            relay(awarenessA, awarenessB);

            expect(diagramPresenceStore.hasLiveFor(diagramId, true)).toBe(false);
            expect(diagramPresenceStore.resolvedEntriesFor(diagramId, project, true)).toEqual([]);
        } finally {
            unbindB();
        }
    });

    it("leaves an unrelated session's cursor on the same Diagram untouched", () => {
        const project = Project.fromDoc(new Y.Doc());
        const diagramId = createDiagram(project, { initialSource: "abcdef" });
        const source = getDiagramSourceYText(project, diagramId)!;

        const awarenessA = new Awareness(new Y.Doc());
        const awarenessC = new Awareness(new Y.Doc());
        const awarenessB = new Awareness(new Y.Doc());
        const unbindB = yjsService.bindProjectPresence(awarenessB);

        try {
            awarenessA.setLocalStateField("user", { userId: "alice", name: "Alice" });
            awarenessA.setLocalStateField("presence", {
                diagramCursors: [encodeDiagramCursor(diagramId, "cursor-a", source, 1)!],
            });
            relay(awarenessA, awarenessB);

            awarenessC.setLocalStateField("user", { userId: "carol", name: "Carol" });
            awarenessC.setLocalStateField("presence", {
                diagramCursors: [encodeDiagramCursor(diagramId, "cursor-c", source, 2)!],
            });
            relay(awarenessC, awarenessB);

            expect(diagramPresenceStore.resolvedEntriesFor(diagramId, project, true)).toHaveLength(2);

            removeAwarenessStates(awarenessA, [awarenessA.clientID], "connection closed");
            relay(awarenessA, awarenessB);

            const remaining = diagramPresenceStore.resolvedEntriesFor(diagramId, project, true);
            expect(remaining).toHaveLength(1);
            expect(remaining[0].userId).toBe("carol");
        } finally {
            unbindB();
        }
    });
});
