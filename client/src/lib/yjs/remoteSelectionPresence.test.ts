import { beforeEach, describe, expect, it } from "vitest";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { nodeBoundaryEndpoint, textEndpoint } from "../selection/selectionEndpoints";
import { yjsService } from "./service";

/**
 * Remote selections arrive as awareness payloads written by another client (#5025).
 *
 * They carry endpoints, so a collaborator's selection of a Grid renders with the same
 * semantics as a local one. Presence is ephemeral, so nothing is migrated: a payload this
 * build cannot read is dropped and the peer simply renders without a selection.
 */

/** Minimal awareness stand-in: `reapplyAllPresences` only reads the states and the client id. */
function awarenessWith(presence: unknown) {
    const states = new Map<number, unknown>([[
        2,
        { user: { userId: "remote-user", name: "Remote", color: "#123456" }, presence },
    ]]);
    return { clientID: 1, getStates: () => states } as unknown as Parameters<
        typeof yjsService.reapplyAllPresences
    >[0];
}

function remoteSelections() {
    return Object.values(editorOverlayStore.selections).filter(selection => selection.userId === "remote-user");
}

describe("remote selection presence", () => {
    beforeEach(() => {
        editorOverlayStore.selections = {};
        editorOverlayStore.cursors = {};
    });

    it("renders a remote selection that ends at a visual node's boundary", () => {
        yjsService.reapplyAllPresences(awarenessWith({
            selection: {
                start: { kind: "text", itemId: "text-a", offset: 4 },
                end: { kind: "node-boundary", itemId: "grid", side: "after" },
                isReversed: false,
            },
        }));

        const [selection] = remoteSelections();
        expect(selection.start).toEqual(textEndpoint("text-a", 4));
        expect(selection.end).toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(selection.color).toBe("#123456");
    });

    it("reads a peer that publishes only the flat text fields", () => {
        yjsService.reapplyAllPresences(awarenessWith({
            selection: { startItemId: "text-a", startOffset: 2, endItemId: "text-b", endOffset: 7 },
        }));

        const [selection] = remoteSelections();
        expect(selection.start).toEqual(textEndpoint("text-a", 2));
        expect(selection.end).toEqual(textEndpoint("text-b", 7));
    });

    it("drops a stale or malformed payload instead of rendering a guessed position", () => {
        for (
            const selection of [
                { startItemId: "text-a" },
                { start: { kind: "node-boundary", itemId: "grid" }, end: { kind: "text", itemId: "b", offset: 1 } },
                { start: "text-a:4", end: "text-b:1" },
                { startItemId: "text-a", startOffset: "4", endItemId: "text-b", endOffset: 1 },
                {},
            ]
        ) {
            editorOverlayStore.selections = {};
            expect(() => yjsService.reapplyAllPresences(awarenessWith({ selection }))).not.toThrow();
            expect(remoteSelections()).toHaveLength(0);
        }
    });
});
