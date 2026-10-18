import type * as Y from "yjs";

// Remote Project connections bind their existing permission evidence once at
// admission. Views may end while their history remains, so replay must consult
// the owner connection rather than the active route or a mounted renderer.
const authorizers = new WeakMap<Y.Doc, () => boolean>();

export function bindProjectHistoryAuthorization(projectDoc: Y.Doc, authorize: () => boolean): void {
    authorizers.set(projectDoc, authorize);
}

export function canReplayProjectHistory(projectDoc: Y.Doc): boolean {
    if (projectDoc.isDestroyed) return false;
    // Standalone local documents have no remote admission lifecycle. Every
    // network Project is bound before its connection is exposed to consumers.
    return authorizers.get(projectDoc)?.() ?? true;
}
