import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { encodeDiagramCursor } from "../services/diagram/diagramPresence";
import { createDiagram } from "../services/diagram/diagramService";
import { DiagramPresenceStore } from "./DiagramPresenceStore.svelte";

describe("DiagramPresenceStore (#5312)", () => {
    let project: Project;
    let diagramId: string;
    let store: DiagramPresenceStore;

    beforeEach(() => {
        project = Project.createInstance("Diagrams");
        diagramId = createDiagram(project, { initialSource: "abcdef" });
        store = new DiagramPresenceStore();
    });

    function sourceText(): Y.Text {
        return project.diagrams.get(diagramId)!.get("source") as Y.Text;
    }

    it("resolves a session's cursor against the current project", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 3)!;
        store.applySession("session-a", { userId: "alice" }, [wire]);

        expect(store.hasLiveFor(diagramId)).toBe(true);
        expect(store.resolvedEntriesFor(diagramId, project)).toEqual([
            {
                sessionId: "session-a",
                cursorId: "cursor-1",
                userId: "alice",
                userName: undefined,
                color: undefined,
                offset: 3,
                selection: undefined,
            },
        ]);
    });

    it("keeps a pending entry out of resolvedEntriesFor but still live", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 3)!;
        // Addressed to a Diagram this store's project doesn't know about yet.
        const pending = { ...wire, diagramId: "not-yet-loaded" };
        store.applySession("session-a", { userId: "alice" }, [pending]);

        expect(store.hasLiveFor("not-yet-loaded")).toBe(true);
        expect(store.resolvedEntriesFor("not-yet-loaded", project)).toEqual([]);
    });

    it("withdraws a cursor missing from a session's next published set", () => {
        const wire1 = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;
        const wire2 = encodeDiagramCursor(diagramId, "cursor-2", sourceText(), 4)!;
        store.applySession("session-a", { userId: "alice" }, [wire1, wire2]);
        expect(store.resolvedEntriesFor(diagramId, project)).toHaveLength(2);

        // The session now only publishes cursor-2: cursor-1 left the source.
        store.applySession("session-a", { userId: "alice" }, [wire2]);
        const remaining = store.resolvedEntriesFor(diagramId, project);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].cursorId).toBe("cursor-2");
    });

    it("withdraws every cursor of a session on an empty publish", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;
        store.applySession("session-a", { userId: "alice" }, [wire]);
        store.applySession("session-a", { userId: "alice" }, []);
        expect(store.hasLiveFor(diagramId)).toBe(false);
    });

    it("withdraws every cursor of a session on departure (removeSession)", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;
        store.applySession("session-a", { userId: "alice" }, [wire]);
        store.removeSession("session-a");
        expect(store.hasLiveFor(diagramId)).toBe(false);
        expect(store.resolvedEntriesFor(diagramId, project)).toEqual([]);
    });

    it("does not affect another session's cursors on the same Diagram", () => {
        const wireA = encodeDiagramCursor(diagramId, "cursor-a", sourceText(), 1)!;
        const wireB = encodeDiagramCursor(diagramId, "cursor-b", sourceText(), 2)!;
        store.applySession("session-a", { userId: "alice" }, [wireA]);
        store.applySession("session-b", { userId: "bob" }, [wireB]);

        store.removeSession("session-a");
        const remaining = store.resolvedEntriesFor(diagramId, project);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].userId).toBe("bob");
    });

    it("clear() drops every session", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;
        store.applySession("session-a", { userId: "alice" }, [wire]);
        store.clear();
        expect(store.hasLiveFor(diagramId)).toBe(false);
    });

    it("notifies subscribers on every state change, and stops after unsubscribe", () => {
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;

        store.applySession("session-a", { userId: "alice" }, [wire]);
        store.removeSession("session-a");
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        store.applySession("session-a", { userId: "alice" }, [wire]);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("does not notify when removing a session that was never present", () => {
        const listener = vi.fn();
        store.subscribe(listener);
        store.removeSession("unknown");
        store.clear();
        expect(listener).not.toHaveBeenCalled();
    });

    it("returns an empty result with no project to resolve against", () => {
        const wire = encodeDiagramCursor(diagramId, "cursor-1", sourceText(), 1)!;
        store.applySession("session-a", { userId: "alice" }, [wire]);
        expect(store.resolvedEntriesFor(diagramId, undefined)).toEqual([]);
    });
});
