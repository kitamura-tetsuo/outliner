// Shared fixture for the Diagram clipboard unit tests (#5314): a real Yjs
// project with one page, the production outline UndoManager registered with
// the global router, and a writable invoking surface. Test-only module.
import * as Y from "yjs";
import { type Item, Project } from "../../schema/app-schema";
import {
    deserializeClipboardItems,
    type ItemClipboardPayloadV4,
    serializeClipboardItems,
} from "../../services/clipboard/itemClipboard";
import type { DiagramAuthorization } from "../../services/diagram/diagramAuthorization";
import { setItemDiagramId } from "../../services/diagram/diagramBinding";
import {
    type DiagramPasteContext,
    snapshotDiagramsForCopy,
    stageDiagramCut,
    structuralSelectionRoots,
} from "../../services/diagram/diagramClipboard";
import { createDiagram } from "../../services/diagram/diagramService";
import { registerEditorSurface } from "../../services/editorSurface";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";

export const fullAuth = (): DiagramAuthorization => ({
    capabilities: { canRead: true, canWrite: true },
    surfaceWritable: true,
});

export interface Fixture {
    project: Project;
    page: Item;
    undo: Y.UndoManager;
    surface: { writable: boolean; };
    /**
     * Run `edit` on a peer replica and deliver it here the way a provider
     * does: as a remote transaction whose origin no local scope tracks.
     */
    peer: (edit: (peerProject: Project) => void) => void;
    dispose: () => void;
}

const REMOTE_ORIGIN = { name: "remote-provider" };

export function createFixture(): Fixture {
    const project = Project.createInstance("Diagram clipboard");
    const page = project.addPage("Page", "tester");
    // The production outline scope: the ordered tree, local (null) origins only.
    const undo = new Y.UndoManager(project.ydoc.getMap("orderedTree"), { trackedOrigins: new Set([null]) });
    globalUndoRouter.clear();
    globalUndoRouter.register(undo);
    const surface = { writable: true };
    const unregisterSurface = registerEditorSurface(() => surface.writable);
    return {
        project,
        page,
        undo,
        surface,
        peer: edit => {
            const peerDoc = new Y.Doc();
            Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(project.ydoc));
            edit(Project.fromDoc(peerDoc));
            Y.applyUpdate(
                project.ydoc,
                Y.encodeStateAsUpdate(peerDoc, Y.encodeStateVector(project.ydoc)),
                REMOTE_ORIGIN,
            );
        },
        dispose: () => {
            unregisterSurface();
            globalUndoRouter.unregister(undo);
            undo.destroy();
            globalUndoRouter.clear();
        },
    };
}

export function addText(parent: Item, text: string): Item {
    const item = parent.items.addNode("tester");
    item.updateText(text);
    return item;
}

export function addOccurrence(parent: Item, diagramId: string): Item {
    const item = parent.items.addNode("tester");
    item.componentType = "diagram";
    setItemDiagramId(item, diagramId);
    return item;
}

export function addDiagram(project: Project, source: string): string {
    return createDiagram(project, { initialSource: source });
}

/** Whole nodes in document order with their depth below `base`. */
export function wholeNodes(roots: Item[]): Array<{ item: Item; depth: number; }> {
    const out: Array<{ item: Item; depth: number; }> = [];
    const visit = (item: Item, depth: number) => {
        out.push({ item, depth });
        for (const child of item.items) visit(child, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    return out;
}

/** A structural Copy payload built by the production serializer and snapshotter. */
export function copyPayload(fixture: Fixture, roots: Item[]): ItemClipboardPayloadV4 {
    const nodes = wholeNodes(roots);
    const ids = nodes.flatMap(({ item }) => {
        const value = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
        const id = value.get("diagramId");
        return typeof id === "string" ? [id] : [];
    });
    const snapshots = snapshotDiagramsForCopy(fixture.project, ids, fullAuth());
    if (!snapshots.ok) throw new Error(snapshots.reason);
    const encoded = serializeClipboardItems(fixture.project.ydoc.guid, nodes, undefined, undefined, undefined, {
        diagrams: snapshots.diagrams,
    });
    return deserializeClipboardItems(encoded) as ItemClipboardPayloadV4;
}

/** A structural Cut: stages a pending transfer and returns its payload. */
export function cutPayload(fixture: Fixture, roots: Item[]): ItemClipboardPayloadV4 {
    const nodes = wholeNodes(roots);
    const rootKeys = structuralSelectionRoots(fixture.project, nodes.map(n => n.item.key), fixture.page.key);
    if (!rootKeys) throw new Error("not a structural selection");
    const staged = stageDiagramCut(fixture.project, rootKeys, fullAuth());
    if (!staged.ok) throw new Error(staged.reason);
    const encoded = serializeClipboardItems(fixture.project.ydoc.guid, nodes, undefined, undefined, "cut", {
        transferId: staged.transferId,
    });
    return deserializeClipboardItems(encoded) as ItemClipboardPayloadV4;
}

export function pasteContext(fixture: Fixture, anchor: Item | undefined): DiagramPasteContext {
    return { project: fixture.project, pageItem: fixture.page, anchor, author: "tester", auth: fullAuth() };
}

export function diagramIdOf(item: Item): string | undefined {
    const value = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
    const id = value.get("diagramId");
    return typeof id === "string" ? id : undefined;
}

/** The page's outline as nested [text-or-kind:diagramId, children]. */
export function outline(item: Item): unknown[] {
    return [...item.items].map(child => {
        const label = child.componentType === "diagram"
            ? `diagram:${diagramIdOf(child)}`
            : child.componentType ?? String(child.text);
        const children = outline(child);
        return children.length > 0 ? [label, children] : label;
    });
}
