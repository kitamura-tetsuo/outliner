import { Project } from "$shared/app-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter, UndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry, removeGridWithPlacements } from "../yjstable/gridDocs";
import { appendGridPlacement, captureDuplicationPlacement } from "../yjstable/gridPlacement";
import { duplicateSelectedObjects, getObjects } from "./objectManagerController";

afterEach(() => {
    vi.restoreAllMocks();
    globalUndoRouter.clear();
});
async function settled() {
    await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
}
function peerReplace(project: Project, id: string) {
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(project.ydoc));
    const peer = Project.fromDoc(peerDoc);
    const router = new UndoRouter();
    // The supported delete action uses the application singleton. Route this
    // peer session's manual entry into its own real router, then deliver the
    // resulting Yjs update as a provider does.
    vi.spyOn(globalUndoRouter, "captureManual").mockImplementationOnce((fn, entry) => router.captureManual(fn, entry));
    expect(removeGridWithPlacements(peer, id)).toBe(true);
    router.undo();
    getGridRegistry(peerDoc).get(id)!.set("name", "Peer restored");
    Y.applyUpdate(project.ydoc, Y.encodeStateAsUpdate(peerDoc, Y.encodeStateVector(project.ydoc)), "peer-provider");
}
describe("duplication materialization ownership", () => {
    it("refuses the whole Undo after a peer Delete/Undo, preserving another copied object and placement", async () => {
        const project = Project.createInstance("ownership");
        const a = createGrid(project.ydoc, { query: "SELECT 1", name: "A" });
        const b = createGrid(project.ydoc, { query: "SELECT 2", name: "B" });
        const page = project.addPage("Page", "author");
        let sideUndo = 0;
        const result = await duplicateSelectedObjects(
            project.ydoc,
            project.ydoc,
            getObjects(project).filter(o => o.id === a || o.id === b),
            {
                afterMaterialize: result => {
                    const placement = appendGridPlacement(project.ydoc, page.id, result.createdObjects[0].id, "author");
                    return {
                        undo: () => {
                            sideUndo++;
                            placement.delete();
                        },
                        redo: () => {},
                    };
                },
            },
        );
        const copied = result!.createdObjects[0].id;
        const old = getGridRegistry(project.ydoc).get(copied);
        peerReplace(project, copied);
        const current = getGridRegistry(project.ydoc).get(copied);
        expect(current).not.toBe(old);
        const before = [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth];
        const baseline = project.ydoc.toJSON();
        globalUndoRouter.undo();
        await settled();
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
        expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual(before);
        expect(project.ydoc.toJSON()).toEqual(baseline);
        expect(current!.get("name")).toBe("Peer restored");
        expect(sideUndo).toBe(0);
        expect(result!.createdObjects.every(o => getGridRegistry(project.ydoc).has(o.id))).toBe(true);
    });

    it("preserves a peer incarnation delivered during final disposal and never invokes the placement callback", async () => {
        const project = Project.createInstance("final-admission");
        const grid = createGrid(project.ydoc, { query: "SELECT 1" });
        let copied: string | undefined;
        let delivered = false;
        const observe = () => {
            const id = [...getGridRegistry(project.ydoc).keys()].find(id => id !== grid);
            if (!id || copied) return;
            copied = id;
            // Materialization's real final disposal await yields after all
            // creation-time witnesses have been captured. Deliver a supported
            // peer Delete/Undo before the initial placement callback can run.
            queueMicrotask(() => {
                peerReplace(project, id);
                delivered = true;
            });
        };
        project.ydoc.on("afterTransaction", observe);
        let attached = false;
        const depth = globalUndoRouter.undoDepth;
        await expect(
            duplicateSelectedObjects(project.ydoc, project.ydoc, getObjects(project).filter(o => o.id === grid), {
                afterMaterialize: () => {
                    attached = true;
                },
            }),
        ).rejects.toThrow("replaced");
        project.ydoc.off("afterTransaction", observe);
        expect(delivered).toBe(true);
        expect(attached).toBe(false);
        expect(getGridRegistry(project.ydoc).get(copied!)?.get("name")).toBe("Peer restored");
        expect(globalUndoRouter.undoDepth).toBe(depth);
    });

    it("preflights a deleted destination Page before Redo creates anything", async () => {
        const project = Project.createInstance("deleted-page");
        const grid = createGrid(project.ydoc, { query: "SELECT 1" });
        const page = project.addPage("Page", "author");
        const result = await duplicateSelectedObjects(
            project.ydoc,
            project.ydoc,
            getObjects(project).filter(o => o.id === grid),
            captureDuplicationPlacement(project.ydoc, page.id, "author"),
        );
        for (let cycle = 0; cycle < 2; cycle++) {
            globalUndoRouter.undo();
            await settled();
            expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
            globalUndoRouter.redo();
            await settled();
            expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
        }
        globalUndoRouter.undo();
        await settled();
        project.ydoc.transact(() => page.delete(), "peer");
        const depth = [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth];
        globalUndoRouter.redo();
        await settled();
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
        expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual(depth);
        expect(getGridRegistry(project.ydoc).has(result!.createdObjects[0].id)).toBe(false);
    });
});
