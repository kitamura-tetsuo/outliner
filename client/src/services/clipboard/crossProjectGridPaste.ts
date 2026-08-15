import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { copyTableData, importTableStructures, type TableCloneOutcome } from "../yjstable/tableClone";
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
    /** Tables whose hosts the user selected; all other snapshots are closure additions. */
    requestedSourceTableIds: string[];
    operation?: "cut";
    /** Paste Special can deliberately create structure without resolving rows. */
    copyData?: boolean;
    /** Independent-copy variants always create a fresh clone, even after an earlier paste. */
    allowProvenanceReuse?: boolean;
    /** Explicit Paste Special choice, used to report the requested outcome. */
    requestedVariant?: "copy-with-data" | "copy-without-data";
    /** False once the user has navigated away from the destination page. */
    isDestinationCurrent: () => boolean;
}

export type GridPasteOutcome =
    | TableCloneOutcome
    | { type: "schedule-skipped"; sourceTableId: string; tableName: string; ruleName: string; }
    | { type: "source-data-unavailable"; tableNames: string[]; reason: string; }
    | { type: "cut-source-retained"; tableNames: string[]; };

interface SourceCopyResult {
    unavailableReason?: string;
    skippedSchedules: Array<{ sourceTableId: string; ruleName: string; }>;
    rowCounts: Record<string, number>;
}

export function formatGridPasteReport(outcomes: readonly GridPasteOutcome[]): string[] {
    const noteworthy = outcomes.some(outcome => outcome.type !== "cloned");
    if (!noteworthy) return [];

    const lines = outcomes
        .filter((outcome): outcome is Extract<GridPasteOutcome, { type: "cloned"; }> & { rowCount: number; } =>
            outcome.type === "cloned" && outcome.selected && outcome.rowCount !== undefined
        )
        .map(outcome =>
            `${outcome.tableName} pasted as an independent copy, with ${outcome.rowCount.toLocaleString()} `
            + `${outcome.rowCount === 1 ? "row" : "rows"}.`
        );
    const dependencies = outcomes.filter((
        outcome,
    ): outcome is Extract<GridPasteOutcome, { type: "dependency-added"; }> => outcome.type === "dependency-added");
    if (dependencies.length > 0) {
        lines.push(
            `Also copied ${dependencies.length} ${dependencies.length === 1 ? "table" : "tables"} `
                + `its query depends on: ${dependencies.map(outcome => outcome.tableName).join(", ")}.`,
        );
    }
    for (const outcome of outcomes) {
        switch (outcome.type) {
            case "renamed":
                lines.push(`${outcome.tableName} was renamed from ${outcome.from} to ${outcome.to} in this project.`);
                break;
            case "failed-group":
                lines.push(
                    `${outcome.tableNames.join(", ")} ${outcome.tableNames.length === 1 ? "was" : "were"} `
                        + `not pasted: ${outcome.reason}.`,
                );
                break;
            case "rebound":
                lines.push(`${outcome.tableName} now reads this project's ${outcome.relation}.`);
                break;
            case "schedule-skipped":
                lines.push(
                    `${outcome.tableName} has schedule rule ${outcome.ruleName} that was not copied \u2014 recreate it here if the rows should keep generating.`,
                );
                break;
            case "source-data-unavailable":
                lines.push(`${outcome.tableNames.join(", ")} pasted without rows: ${outcome.reason}`);
                break;
            case "cut-source-retained":
                lines.push(
                    `Cut left the source ${outcome.tableNames.length === 1 ? "table" : "tables"} in place: ${
                        outcome.tableNames.join(", ")
                    }.`,
                );
                break;
            case "reused":
                lines.push(
                    `${outcome.tableName} is already in this project — this copy shows the same table. `
                        + "Use Paste Special to paste an independent copy instead.",
                );
                break;
        }
    }
    return lines;
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
): Promise<
    {
        /** Tables this paste created. Only these may be rolled back or undone. */
        tableIdMap: Record<string, string>;
        /** Tables an earlier paste already created here, reused by this one. */
        reusedTableIdMap: Record<string, string>;
        skippedSourceTableIds: string[];
        outcomes: GridPasteOutcome[];
    } | undefined
> {
    const {
        destinationDoc,
        sourceProjectId,
        snapshots,
        requestedSourceTableIds,
        operation,
        copyData = true,
        allowProvenanceReuse = true,
        requestedVariant,
        isDestinationCurrent,
    } = options;

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
        const cloneResult = await importTableStructures(
            destinationDoc,
            snapshots,
            sourceProjectId,
            new Set(requestedSourceTableIds),
            allowProvenanceReuse,
        );
        tableIdMap = cloneResult.tableIdMap;
        const reusedTableIdMap = cloneResult.reusedTableIdMap;
        const skippedSourceTableIds = cloneResult.skippedSourceTableIds;
        if (cancelled()) {
            rollback();
            reportProgress({ state: "cancelled" });
            return undefined;
        }

        const sourceCopy = copyData
            ? sourceProjectId === destinationDoc.guid
                ? copyRowsFromSameProject(destinationDoc, tableIdMap)
                : await copyRowsFromSource(sourceProjectId, tableIdMap, destinationDoc, controller.signal, cancelled)
            : { skippedSchedules: [], rowCounts: {} };
        if (cancelled()) {
            rollback();
            reportProgress({ state: "cancelled" });
            return undefined;
        }

        const outcomes: GridPasteOutcome[] = cloneResult.outcomes.map(outcome =>
            outcome.type === "cloned"
                ? { ...outcome, rowCount: sourceCopy.rowCounts[outcome.sourceTableId] }
                : outcome
        );
        for (const schedule of sourceCopy.skippedSchedules) {
            outcomes.push({
                type: "schedule-skipped",
                sourceTableId: schedule.sourceTableId,
                tableName: snapshots[schedule.sourceTableId]?.name ?? schedule.sourceTableId,
                ruleName: schedule.ruleName,
            });
        }
        if (sourceCopy.unavailableReason !== undefined && Object.keys(tableIdMap).length > 0) {
            outcomes.push({
                type: "source-data-unavailable",
                tableNames: Object.keys(tableIdMap).map(id => snapshots[id]?.name ?? id),
                reason: sourceCopy.unavailableReason,
            });
        }
        if (operation === "cut") {
            outcomes.push({
                type: "cut-source-retained",
                tableNames: requestedSourceTableIds.map(id => snapshots[id]?.name ?? id),
            });
        }
        const report = formatGridPasteReport(outcomes);
        if (requestedVariant === "copy-with-data" && report.length === 0) {
            report.push("Pasted as an independent copy with data.");
        } else if (requestedVariant === "copy-without-data") {
            report.unshift("Pasted as an independent copy without data.");
        }
        reportProgress(
            sourceCopy.unavailableReason === undefined
                ? { state: "complete-with-data", report }
                : { state: "complete-without-data", reason: sourceCopy.unavailableReason, report },
        );
        return { tableIdMap, reusedTableIdMap, skippedSourceTableIds: skippedSourceTableIds ?? [], outcomes };
    } finally {
        if (typeof window !== "undefined") {
            window.removeEventListener(GRID_PASTE_CANCEL_EVENT, cancel);
        }
    }
}

function copyRowsFromSameProject(
    projectDoc: Y.Doc,
    tableIdMap: Record<string, string>,
): SourceCopyResult {
    const rowCounts: Record<string, number> = {};
    for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
        const source = getTableHandles(projectDoc, sourceTableId);
        const destination = getTableHandles(projectDoc, destinationTableId);
        if (!source || !destination) continue;
        copyTableData(source, destination);
        rowCounts[sourceTableId] = destination.data.size;
    }
    return { skippedSchedules: [], rowCounts };
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
): Promise<SourceCopyResult> {
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
        if (!acquired) {
            return {
                unavailableReason: "The source project is not available.",
                skippedSchedules: [],
                rowCounts: {},
            };
        }

        let unavailableReason: string | undefined;
        const rowCounts: Record<string, number> = {};
        for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
            if (cancelled()) return { skippedSchedules: [], rowCounts };

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
                    rowCounts[sourceTableId] = destinationHandles.data.size;
                } finally {
                    await connection.dispose();
                }
            } finally {
                // The source table's history belongs to the source project; it
                // must not linger in this workspace's undo router.
                destroyTableUndoManager(sourceHandles.doc);
            }
        }
        const skippedSchedules: SourceCopyResult["skippedSchedules"] = [];
        acquired.client.project.schedules.forEach((rule, ruleId) => {
            const targetTableId = rule.get("targetTableId");
            if (typeof targetTableId !== "string" || tableIdMap[targetTableId] === undefined) return;
            const name = rule.get("name");
            skippedSchedules.push({
                sourceTableId: targetTableId,
                ruleName: typeof name === "string" && name.length > 0 ? name : ruleId,
            });
        });
        return { unavailableReason, skippedSchedules, rowCounts };
    } catch (error) {
        logger.warn({ error, sourceProjectId }, "[cloneGridTablesAcrossProjects] source rows could not be read");
        return {
            unavailableReason: error instanceof Error ? error.message : "The source project is not available.",
            skippedSchedules: [],
            rowCounts: {},
        };
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
