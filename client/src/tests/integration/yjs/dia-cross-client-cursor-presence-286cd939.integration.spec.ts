// Cross-client Diagram cursor presence over the real production transport
// (issue #5312, REQ-002/REQ-003/REQ-004/REQ-006). Two independent
// `createProjectConnection` calls join the same room through the actual
// local Yjs WebSocket server — not a hand-rolled doc merge — so the Diagram
// registry syncs exactly as it would between two browser tabs.
//
// Departure/disconnect-triggered withdrawal is covered separately in
// `diagramPresenceRemoval.spec.ts`, deterministically, via the same
// `y-protocols/awareness` removal primitive the production provider itself
// uses — real server disconnect/expiry timing is explicitly not a policy
// this feature owns (issue non-goals).

import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { yjsService } from "../../../lib/yjs/service";
import { encodeDiagramCursor } from "../../../services/diagram/diagramPresence";
import { createDiagram, getDiagramSourceYText } from "../../../services/diagram/diagramService";
import { diagramPresenceStore } from "../../../stores/DiagramPresenceStore.svelte";

async function waitForSynced(...connections: { provider: { isSynced: boolean; }; }[]): Promise<void> {
    for (let i = 0; i < 100; i++) {
        if (connections.every(c => c.provider.isSynced)) return;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error("Timed out waiting for project connections to sync");
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!check()) {
        if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
        await new Promise(r => setTimeout(r, 50));
    }
}

describe("Diagram cursor presence (#5312)", () => {
    it("reaches a peer through a different occurrence than the sender's, addressed by Diagram not page", async () => {
        const projectId = `p-dia-presence-${Date.now()}`;
        const c1 = await createProjectConnection(projectId);
        const c2 = await createProjectConnection(projectId);
        await waitForSynced(c1, c2);

        const project1 = Project.fromDoc(c1.doc);
        const project2 = Project.fromDoc(c2.doc);

        // Client 1 creates the Diagram through the real domain write path.
        const diagramId = createDiagram(project1, { initialSource: "ab" });
        await waitFor(() => !!getDiagramSourceYText(project2, diagramId));

        // Client 2 subscribes its own overlay/presence routing to its awareness —
        // exactly what a real browser tab does on connect.
        const unbind2 = yjsService.bindProjectPresence(c2.awareness!);

        try {
            // Client 1 places a logical cursor on the Diagram source and publishes
            // it — addressed by Diagram identity, never by page or occurrence id,
            // which client 2 need not (and does not) share.
            const source1 = getDiagramSourceYText(project1, diagramId)!;
            const wire = encodeDiagramCursor(diagramId, "cursor-1", source1, 1)!;
            c1.awareness!.setLocalStateField("user", { userId: "u1", name: "Alice" });
            c1.awareness!.setLocalStateField("presence", { diagramCursors: [wire] });

            await waitFor(() => diagramPresenceStore.hasLiveFor(diagramId));

            const resolved = diagramPresenceStore.resolvedEntriesFor(diagramId, project2);
            expect(resolved).toHaveLength(1);
            expect(resolved[0]).toMatchObject({ userId: "u1", cursorId: "cursor-1", offset: 1 });

            // The peer's cursor withdraws once its session stops publishing it.
            c1.awareness!.setLocalStateField("presence", { diagramCursors: [] });
            await waitFor(() => !diagramPresenceStore.hasLiveFor(diagramId));
            expect(diagramPresenceStore.resolvedEntriesFor(diagramId, project2)).toEqual([]);
        } finally {
            unbind2();
            await c1.dispose();
            await c2.dispose();
        }
    }, 20000);
});
