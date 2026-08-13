import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { copyTableData, importTableStructures } from "../yjstable/tableClone";
import { destroyTableUndoManager, getTableHandles, removeTable } from "../yjstable/tableDocs";
import {
    GRID_PASTE_CANCEL_EVENT,
    GRID_PASTE_PROGRESS_EVENT,
    GRID_PASTE_WRITE_CHECK_EVENT,
    type GridPasteProgress,
} from "./gridPasteEvents";
import type { GridTableSnapshot } from "./itemClipboard";

const logger = getLogger("crossProjectGridPaste");

/** A source room that stays silent this long is treated as unreachable. */
const SOURCE_SYNC_TIMEOUT_MS = 10000;

function reportProgress(detail: GridPasteProgress): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<GridPasteProgress>(GRID_PASTE_PROGRESS_EVENT, { detail }));
}

/**
 * Ask the mounted outline whether the destination accepts writes (spec §9.5).
 * A cross-project paste creates tables before it creates items, so a read-only
 * destination has to be refused before anything exists.
 */
function destinationAcceptsWrites(): boolean {
    if (typeof window === "undefined") return true;
    return window.dispatchEvent(new CustomEvent(GRID_PASTE_WRITE_CHECK_EVENT, { cancelable: true }));
}

export interface CrossProjectGridPasteOptions {
    destinationDoc: Y.Doc;
    /** Room id of the project the Grids were copied from. */
    sourceProjectId: string;
    /** Portable structure carried by the clipboard, keyed by source table id. */
    snapshots: Record<string, GridTableSnapshot>;
    /** False once the user has navigated away from the destination page. */
    isDestinationCurrent: () => boolean;
}

/**
 * Clone the copied Grids into the destination project and fill them with the
 * rows the source holds at paste time.
 *
 * The clipboard deliberately carries structure only (spec §5.1): the rows are
 * read from the live source room, so access stays enforced by the room rather
 * than by whoever holds the clipboard string, and no row data is ever written
 * to a system clipboard. Reachability is the only discriminator — a reachable
 * source with zero rows is a successful empty copy, an unreachable one yields a
 * structure-only clone and says why.
 *
 * Returns the source-table-id -> destination-table-id map, or `undefined` when
 * the paste must not proceed at all: a read-only destination, an explicit
 * cancel, or navigation away. In those cases every table this call created has
 * already been removed again (spec §9.6).
 */
export async function cloneGridTablesAcrossProjects(
    options: CrossProjectGridPasteOptions,
): Promise<Record<string, string> | undefined> {
    const { destinationDoc, sourceProjectId, snapshots, isDestinationCurrent } = options;

    if (!destinationAcceptsWrites()) {
        reportProgress({ state: "failed", reason: "The destination project is read-only." });
        return undefined;
    }

    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (typeof window !== "undefined") {
        window.addEventListener(GRID_PASTE_CANCEL_EVENT, cancel, { once: true });
    }
    const cancelled = () => controller.signal.aborted || !isDestinationCurrent();

    let tableIdMap: Record<string, string> = {};
    const rollback = () => {
        rollbackCrossProjectPaste(destinationDoc, Object.values(tableIdMap));
        tableIdMap = {};
    };

    try {
        reportProgress({ state: "copying", tableCount: Object.keys(snapshots).length });
        tableIdMap = (await importTableStructures(destinationDoc, sourceProjectId, snapshots)).tableIdMap;
        if (cancelled()) {
            rollback();
            reportProgress({ state: "cancelled" });
            return undefined;
        }

        const unavailableReason = await copyRowsFromSource(
            sourceProjectId,
            tableIdMap,
            destinationDoc,
            controller.signal,
            cancelled,
        );
        if (cancelled()) {
            rollback();
            reportProgress({ state: "cancelled" });
            return undefined;
        }

        reportProgress(
            unavailableReason === undefined
                ? { state: "complete-with-data" }
                : { state: "complete-without-data", reason: unavailableReason },
        );
        return tableIdMap;
    } finally {
        if (typeof window !== "undefined") {
            window.removeEventListener(GRID_PASTE_CANCEL_EVENT, cancel);
        }
    }
}

/**
 * Fill every freshly created destination table from its source table.
 * Returns the reason the rows could not be read, or `undefined` on success.
 */
async function copyRowsFromSource(
    sourceProjectId: string,
    tableIdMap: Record<string, string>,
    destinationDoc: Y.Doc,
    signal: AbortSignal,
    cancelled: () => boolean,
): Promise<string | undefined> {
    // Imported lazily: the provider stack and the project registry are only
    // needed by this one branch of paste, and a static edge from the key
    // handler to the Yjs service would drag both into every module that
    // reaches the key handler.
    const [{ acquireClientByProjectId }, { connectTableDoc }] = await Promise.all([
        import("../../lib/yjsService.svelte"),
        import("../../lib/yjs/connection"),
    ]);

    let acquired: Awaited<ReturnType<typeof acquireClientByProjectId>>;
    try {
        acquired = await acquireClientByProjectId(sourceProjectId, signal);
        if (!acquired) return "The source project is not available.";

        let unavailableReason: string | undefined;
        for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
            if (cancelled()) return undefined;

            const sourceHandles = getTableHandles(acquired.client.project.ydoc, sourceTableId);
            const destinationHandles = getTableHandles(destinationDoc, destinationTableId);
            if (!sourceHandles || !destinationHandles) {
                unavailableReason = `Source Grid ${sourceTableId} is not available.`;
                continue;
            }

            try {
                const connection = await connectTableDoc(sourceProjectId, sourceTableId, sourceHandles.doc);
                try {
                    const { synced } = await connection.waitForInitialSync(SOURCE_SYNC_TIMEOUT_MS);
                    if (!synced) {
                        unavailableReason = `Source Grid ${sourceTableId} could not be reached.`;
                        continue;
                    }
                    copyTableData(sourceHandles, destinationHandles);
                } finally {
                    await connection.dispose();
                }
            } finally {
                // The source table's history belongs to the source project; it
                // must not linger in this workspace's undo router.
                destroyTableUndoManager(sourceHandles.doc);
            }
        }
        return unavailableReason;
    } catch (error) {
        logger.warn({ error, sourceProjectId }, "[cloneGridTablesAcrossProjects] source rows could not be read");
        return error instanceof Error ? error.message : "The source project is not available.";
    } finally {
        acquired?.release();
    }
}

/** Remove the tables created by a paste that was cancelled or undone. */
export function rollbackCrossProjectPaste(destinationDoc: Y.Doc, createdTableIds: string[]): void {
    for (const destinationTableId of createdTableIds) {
        removeTable(destinationDoc, destinationTableId);
    }
}
