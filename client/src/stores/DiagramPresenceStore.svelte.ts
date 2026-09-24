// Remote Diagram cursor presence, addressed by Diagram identity rather than
// page or occurrence (issue #5312, REQ-003/REQ-004/REQ-005/REQ-006).
//
// One entry per (peer editing session, logical cursor id) — a "session" is
// one awareness connection (one browser tab/connection), so a user with two
// independent tabs open on the same Diagram gets two independent entries,
// never collapsed into one durable "object is being edited" flag. A
// session's live set is replaced wholesale on every awareness update: a
// cursorId missing from the new set is withdrawn (REQ-006), and awareness's
// own per-client clock already discards a delayed/stale update before it
// ever reaches here, so an obsolete cursor cannot resurrect once superseded.
//
// Resolution against the current project doc happens on read, not on write:
// a Yjs relative position decodes to whatever the current document contains,
// so a pending (not-yet-loaded) entry starts resolving the moment its
// Diagram/source becomes available, and an already-resolved entry silently
// rebases across concurrent edits — no callback replay or manual rebasing
// needed (REQ-005).
//
// This mirrors the plain-Map + explicit-subscribe pattern EditorOverlayStore
// already uses for its own `cursorInstances` (a non-Yjs, per-tab volatile
// cache): nothing here is persisted or renders directly off Svelte $state,
// so consumers re-derive from a version counter bumped by `subscribe`.

import type { Project } from "$shared/app-schema";
import { getLogger } from "../lib/logger";
import { type DiagramCursorWire, resolveDiagramCursor } from "../services/diagram/diagramPresence";

const logger = getLogger("DiagramPresenceStore");

export interface RemoteDiagramPeer {
    userId: string;
    userName?: string;
    color?: string;
}

export interface RemoteDiagramCursor extends RemoteDiagramPeer {
    sessionId: string;
    cursorId: string;
    offset: number;
    selection?: { start: number; end: number; };
}

interface SessionEntry {
    peer: RemoteDiagramPeer;
    wires: Map<string, DiagramCursorWire>;
}

export class DiagramPresenceStore {
    /* eslint-disable svelte/prefer-svelte-reactivity -- Internal instance cache, not reactive state; consumers re-derive via `subscribe` */
    private sessions = new Map<string, SessionEntry>();
    private listeners = new Set<() => void>();
    /* eslint-enable svelte/prefer-svelte-reactivity */

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (e) {
                logger.error(e);
            }
        }
    }

    /**
     * Replace one peer session's live Diagram cursors wholesale. Every
     * cursorId absent from `wires` (including an empty or undefined list) is
     * withdrawn — this is how a peer's cursor leaving a source, or the
     * session disconnecting outright, propagates to every receiver.
     */
    applySession(sessionId: string, peer: RemoteDiagramPeer, wires: readonly DiagramCursorWire[] | undefined): void {
        if (!wires || wires.length === 0) {
            if (this.sessions.delete(sessionId)) this.notify();
            return;
        }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal instance cache, not reactive state
        this.sessions.set(sessionId, { peer, wires: new Map(wires.map(w => [w.cursorId, w])) });
        this.notify();
    }

    /** Withdraw every cursor of a session: departure, disconnect, or expiry (REQ-006/REQ-007). */
    removeSession(sessionId: string): void {
        if (this.sessions.delete(sessionId)) this.notify();
    }

    /** Drop every remote entry, e.g. when leaving the project entirely. */
    clear(): void {
        if (this.sessions.size === 0) return;
        this.sessions.clear();
        this.notify();
    }

    /**
     * Every live cursor addressed to `diagramId`, resolved against the
     * current project doc. An entry that cannot yet resolve (its Diagram or
     * referenced text is not locally available) is omitted here — it still
     * counts toward `hasLiveFor` — rather than painted at a fabricated
     * position (REQ-004/REQ-005).
     */
    resolvedEntriesFor(diagramId: string, project: Project | undefined): RemoteDiagramCursor[] {
        if (!project) return [];
        const out: RemoteDiagramCursor[] = [];
        for (const [sessionId, entry] of this.sessions) {
            for (const wire of entry.wires.values()) {
                if (wire.diagramId !== diagramId) continue;
                const resolved = resolveDiagramCursor(project, wire);
                if (!resolved) continue;
                out.push({
                    sessionId,
                    cursorId: wire.cursorId,
                    userId: entry.peer.userId,
                    userName: entry.peer.userName,
                    color: entry.peer.color,
                    offset: resolved.offset,
                    selection: resolved.selection,
                });
            }
        }
        return out;
    }

    /**
     * Whether any live cursor — resolved or still pending its source/text
     * evidence — targets `diagramId`. An authorized live record awaiting
     * evidence still forces source-mode presentation (REQ-004).
     */
    hasLiveFor(diagramId: string): boolean {
        for (const entry of this.sessions.values()) {
            for (const wire of entry.wires.values()) {
                if (wire.diagramId === diagramId) return true;
            }
        }
        return false;
    }
}

export const diagramPresenceStore = new DiagramPresenceStore();
