import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { clearRoomSyncStates, setRoomSyncState } from "../../../lib/yjs/roomSyncState";
import { Project } from "../../../schema/app-schema";
import { store } from "../../../stores/store.svelte";
import { yjsStore } from "../../../stores/yjsStore.svelte";

// The projectId used below maps to this room via projectRoomPath (see roomPath.ts).
const PROJECT_ID = "notify-test-project";
const ROOM = "projects/notify-test-project";

function makeFakeYjsClient(projectId: string) {
    const project = Project.fromDoc(new Y.Doc({ guid: projectId }));
    return {
        clientId: `client-${projectId}`,
        containerId: projectId,
        isContainerConnected: true,
        wsProvider: undefined,
        getProject: () => project,
    } as unknown as import("../../../yjs/YjsClient").YjsClient;
}

describe("yjsStore.notYetSynced", () => {
    beforeEach(() => {
        clearRoomSyncStates();
        yjsStore.reset();
    });

    it("reflects the room's sync state once a client is attached", () => {
        setRoomSyncState(ROOM, "pending");
        yjsStore.yjsClient = makeFakeYjsClient(PROJECT_ID);
        expect(yjsStore.notYetSynced).toBe(true);

        setRoomSyncState(ROOM, "synced");
        expect(yjsStore.notYetSynced).toBe(false);

        setRoomSyncState(ROOM, "timed-out");
        expect(yjsStore.notYetSynced).toBe(true);
    });

    it("stops listening to the previous room's sync state after reset", () => {
        yjsStore.yjsClient = makeFakeYjsClient(PROJECT_ID);
        yjsStore.reset();

        setRoomSyncState(ROOM, "timed-out");
        expect(yjsStore.notYetSynced).toBe(false);
    });

    it("swaps in the connected project even when the outgoing project already holds pages", () => {
        expect(store.project).toBeDefined();
        store.project?.addPage("Draft made before connecting", "tester");

        const client = makeFakeYjsClient(PROJECT_ID);
        yjsStore.yjsClient = client;

        expect(store.project?.ydoc).toBe(client.getProject().ydoc);
    });
});
