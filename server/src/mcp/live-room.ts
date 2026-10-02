import type { Hocuspocus } from "@hocuspocus/server";
import type * as Y from "yjs";
import { McpReadError } from "./mcp-error.js";

/**
 * Direct-connection handling for authoritative server-side mutations that
 * must act on a room's live Document (standalone Table creation, Grid
 * presentation updates).
 *
 * Hocuspocus can hand an open that races a room unload the Document being
 * destroyed; the next open loads a fresh one. State read from, or written to,
 * that orphan would not be the live state, and its normal disconnect would
 * store its stale state over the live room's. Such a handle is therefore
 * released without storing, and the room reopened.
 */

export type DirectConnection = Awaited<ReturnType<Hocuspocus["openDirectConnection"]>>;
export type LiveRoomHost = Pick<Hocuspocus, "openDirectConnection" | "documents">;

export function isLiveRoom(hocuspocus: LiveRoomHost, room: string, doc: Y.Doc): boolean {
    return hocuspocus.documents.get(room) === (doc as unknown);
}

/** Open a direct connection whose Document is the room's live one. */
export async function openLiveRoom(
    hocuspocus: LiveRoomHost,
    room: string,
    uid: string,
    failureDebug: Record<string, unknown>,
): Promise<DirectConnection> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const connection = await hocuspocus.openDirectConnection(room, { context: { uid } });
        if (isLiveRoom(hocuspocus, room, connection.document as unknown as Y.Doc)) return connection;
        releaseWithoutStore(connection);
    }
    throw new McpReadError("internal_failure", "Room could not be opened", failureDebug);
}

/** Disconnect normally, unless the handle was orphaned and would store stale state. */
export async function closeLiveRoom(hocuspocus: LiveRoomHost, connection: DirectConnection): Promise<void> {
    const doc = connection.document;
    if (doc && !isLiveRoom(hocuspocus, doc.name, doc as unknown as Y.Doc)) releaseWithoutStore(connection);
    else await connection.disconnect();
}

/** Drop an orphaned Document handle without Hocuspocus storing its stale state. */
export function releaseWithoutStore(connection: DirectConnection): void {
    connection.document?.removeDirectConnection();
    connection.document = null;
}
