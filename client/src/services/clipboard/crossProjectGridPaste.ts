import { Project } from "$shared/app-schema";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { getLoadedProjectDocById } from "../../lib/yjsService.svelte";
import { cloneScheduleRules } from "../schedule/scheduleRuleClone";
import { getGridInsertTargetTableId, getGridRegistry } from "../yjstable/gridDocs";
import { captureDuplicationAdmission } from "../yjstable/objectDuplication";
import { queryReadDependencies } from "../yjstable/queryReadDependencies";
import type { StructuralEnumAdmission } from "../yjstable/structuralEnumGuard";
import { copyTableData, importTableStructures, type TableCloneOutcome } from "../yjstable/tableClone";
import { destroyTableUndoManager, getTableHandles, getTableSqlName, removeTable } from "../yjstable/tableDocs";
import {
    GRID_PASTE_CANCEL_EVENT,
    GRID_PASTE_PROGRESS_EVENT,
    GRID_PASTE_WRITE_CHECK_EVENT,
    type GridPasteProgress,
} from "./gridPasteEvents";
import type { GridSnapshot, GridTableSnapshot, ItemClipboardPayloadV4 } from "./itemClipboard";
import type { TransferBindings } from "./transferBindings";

const logger = getLogger("crossProjectGridPaste");

/** A source room that stays silent this long is treated as unreachable. */
const SOURCE_SYNC_TIMEOUT_MS = 10000;
class StaleGridTransferError extends Error {}

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
    /** The destination project, which receives the copied schedule rules. */
    destinationProject: Project;
    /** Room id of the project the Grids were copied from. */
    sourceProjectId: string;
    /** Portable structure carried by the clipboard, keyed by source table id. */
    snapshots: Record<string, GridTableSnapshot>;
    grids?: Record<string, GridSnapshot>;
    catalog?: import("$shared/services/sqlCatalog").SqlCatalogSnapshot;
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
    /** Private preparation for a staged move has no user-visible completion yet. */
    silent?: boolean;
    /** The keyboard handler reports completion only after placements commit. */
    deferCompletion?: boolean;
}

export type GridPasteOutcome =
    | TableCloneOutcome
    | { type: "schedule-copied"; sourceTableId: string; tableName: string; ruleName: string; }
    | { type: "schedule-skipped"; sourceTableId: string; tableName: string; ruleName: string; }
    | { type: "source-data-unavailable"; tableNames: string[]; reason: string; }
    | { type: "cut-source-retained"; tableNames: string[]; };

interface ScheduleRuleOutcome {
    sourceTableId: string;
    ruleName: string;
}

interface SourceCopyResult {
    unavailableReason?: string;
    copiedSchedules: ScheduleRuleOutcome[];
    skippedSchedules: ScheduleRuleOutcome[];
    createdRuleIds: string[];
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
            case "view-omission":
                lines.push(`Grid ${outcome.gridId}: ${outcome.reason}.`);
                break;
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
            case "schedule-copied":
                lines.push(
                    `${outcome.tableName} came with schedule rule ${outcome.ruleName}, copied switched off \u2014 enable it here to keep the rows generating.`,
                );
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
export interface PreparedGridPaste {
    enumAdmission: StructuralEnumAdmission;
    bindings: TransferBindings;
    admit(): void;
    complete(): void;
    discard(reason?: string): void;
    /** Tables this paste created. Only these may be rolled back or undone. */
    tableIdMap: Record<string, string>;
    /** Grids this paste created alongside the tables. Pasted outline items bind here. */
    gridIdMap: Record<string, string>;
    /** Tables an earlier paste already created here, reused by this one. */
    reusedTableIdMap: Record<string, string>;
    /** Grids already present for reused Tables, so pasted items still bind to a live Grid. */
    reusedGridIdMap: Record<string, string>;
    /** Schedule rules this paste copied, disabled. Part of its undo unit. */
    createdRuleIds: string[];
    skippedSourceTableIds: string[];
    outcomes: GridPasteOutcome[];
}

export async function cloneGridTablesAcrossProjects(
    options: CrossProjectGridPasteOptions,
): Promise<PreparedGridPaste | undefined> {
    const progress = options.silent ? (_detail: GridPasteProgress) => {} : reportProgress;
    const {
        destinationDoc,
        destinationProject,
        sourceProjectId,
        snapshots,
        grids,
        catalog,
        requestedSourceTableIds,
        operation,
        copyData = true,
        allowProvenanceReuse = true,
        requestedVariant,
        isDestinationCurrent,
    } = options;

    if (!isDestinationCurrent()) {
        progress({ state: "cancelled" });
        return undefined;
    }
    if (!destinationAcceptsWrites()) {
        progress({ state: "failed", reason: "The destination project is read-only." });
        return undefined;
    }

    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (typeof window !== "undefined") {
        window.addEventListener(GRID_PASTE_CANCEL_EVENT, cancel, { once: true });
    }
    const cancelled = () => controller.signal.aborted || !isDestinationCurrent();

    let tableIdMap: Record<string, string>;
    let createdRuleIds: string[];
    let bindings: TransferBindings | undefined;
    let handedOff = false;
    let acquired: Awaited<ReturnType<typeof import("../../lib/yjsService.svelte").acquireClientByProjectId>>;
    let assertSource = () => {};
    let sourceCaptured = false;
    const captureSource = (source: Y.Doc, closed: () => boolean) => {
        try {
            for (const [id, grid] of Object.entries(grids ?? {})) {
                const entry = getGridRegistry(source).get(id);
                const reads = entry
                    ? queryReadDependencies(source, String(entry.get("query") ?? ""))
                    : undefined;
                if (
                    !entry || entry.get("query") !== grid.query
                    || getGridInsertTargetTableId({ entry }) !== grid.insertTargetTableId
                    || reads?.status !== "complete"
                    || JSON.stringify([...reads.tableIds].sort()) !== JSON.stringify([...grid.tableIds].sort())
                ) {
                    throw new Error("The source Grid no longer matches the captured transfer.");
                }
            }
            for (const [id, table] of Object.entries(snapshots)) {
                if (getTableSqlName(source, id) !== table.sqlName) {
                    throw new Error("The source Table no longer matches the captured transfer.");
                }
            }
            const current = captureDuplicationAdmission(source, [
                ...Object.keys(grids ?? {}).map(id => ({ type: "grid" as const, id })),
                ...Object.keys(snapshots).map(id => ({ type: "table" as const, id })),
            ]);
            assertSource = () => {
                try {
                    if (closed() || source.isDestroyed) {
                        throw new Error("The acquired source was closed.");
                    }
                    current();
                } catch (error) {
                    throw new StaleGridTransferError(String(error));
                }
            };
        } catch (error) {
            throw new StaleGridTransferError(String(error));
        }
        sourceCaptured = true;
    };
    const releaseSource = () => {
        const lease = acquired;
        acquired = undefined;
        lease?.release();
    };
    const releaseCancel = () => {
        if (typeof window !== "undefined") window.removeEventListener(GRID_PASTE_CANCEL_EVENT, cancel);
    };
    const admit = () => {
        if (cancelled() || !destinationAcceptsWrites()) {
            throw new StaleGridTransferError("The destination changed or no longer accepts writes.");
        }
        bindings?.assertCurrent();
        assertSource();
    };
    const rollback = () => {
        bindings?.cleanupOwned(id => removeTable(destinationDoc, id));
        createdRuleIds = [];
        tableIdMap = {};
    };

    try {
        // Capture loaded identity authority before SQL preparation, independently
        // of whether this operation acquires a source for copying rows.
        if (sourceProjectId !== destinationDoc.guid) {
            const source = getLoadedProjectDocById(sourceProjectId);
            if (source) captureSource(source, () => getLoadedProjectDocById(sourceProjectId) !== source);
        }
        admit();
        progress({ state: "copying", tableCount: Object.keys(snapshots).length });
        const cloneResult = await importTableStructures(
            destinationDoc,
            snapshots,
            sourceProjectId,
            new Set(requestedSourceTableIds),
            allowProvenanceReuse,
            grids,
            catalog,
            admit,
        );
        bindings = cloneResult.bindings;
        admit();
        tableIdMap = cloneResult.tableIdMap;
        const gridIdMap = cloneResult.gridIdMap;
        const reusedTableIdMap = cloneResult.reusedTableIdMap;
        const reusedGridIdMap = cloneResult.reusedGridIdMap;
        const skippedSourceTableIds = cloneResult.skippedSourceTableIds;
        if (cancelled()) {
            rollback();
            progress({ state: "cancelled" });
            return undefined;
        }

        // A relation may have been renamed on the way in (`deriveSqlName`), and
        // a copied schedule rule has to follow it.
        const sqlNameMap = new Map<string, string>();
        for (const [sourceTableId, destinationTableId] of Object.entries({ ...reusedTableIdMap, ...tableIdMap })) {
            const sourceSqlName = snapshots[sourceTableId]?.sqlName;
            const destinationSqlName = getTableSqlName(destinationDoc, destinationTableId);
            if (sourceSqlName !== undefined && destinationSqlName !== undefined) {
                sqlNameMap.set(sourceSqlName, destinationSqlName);
            }
        }

        // Keep the authorized room receiving updates until placement admission.
        // Unavailable acquisition still permits the documented structure fallback.
        if (copyData && sourceProjectId !== destinationDoc.guid) {
            const { acquireClientByProjectId } = await import("../../lib/yjsService.svelte");
            try {
                acquired = await acquireClientByProjectId(sourceProjectId, controller.signal);
            } catch (error) {
                logger.warn({ error, sourceProjectId }, "The source project could not be acquired");
            }
            if (acquired) {
                if (!sourceCaptured) {
                    const client = acquired.client;
                    captureSource(client.project.ydoc, () => client.isDestroyed);
                }
            }
        }
        admit();
        const sourceCopy = copyData
            ? sourceProjectId === destinationDoc.guid
                ? copyRowsFromSameProject(destinationDoc, destinationProject, tableIdMap, sqlNameMap, bindings, admit)
                : await copyRowsFromSource({
                    sourceProjectId,
                    sourceProject: acquired?.client.project,
                    destinationProject,
                    tableIdMap,
                    sqlNameMap,
                    destinationDoc,
                    cancelled,
                    bindings,
                    admit,
                })
            : { copiedSchedules: [], skippedSchedules: [], createdRuleIds: [], rowCounts: {} };
        createdRuleIds = sourceCopy.createdRuleIds;
        if (cancelled()) {
            rollback();
            progress({ state: "cancelled" });
            return undefined;
        }

        admit();
        const outcomes: GridPasteOutcome[] = cloneResult.outcomes.map(outcome =>
            outcome.type === "cloned"
                ? { ...outcome, rowCount: sourceCopy.rowCounts[outcome.sourceTableId] }
                : outcome
        );
        for (const schedule of sourceCopy.copiedSchedules) {
            outcomes.push({
                type: "schedule-copied",
                sourceTableId: schedule.sourceTableId,
                tableName: snapshots[schedule.sourceTableId]?.name ?? schedule.sourceTableId,
                ruleName: schedule.ruleName,
            });
        }
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
        const complete = () => {
            releaseCancel();
            releaseSource();
            progress(
                sourceCopy.unavailableReason === undefined
                    ? { state: "complete-with-data", report }
                    : { state: "complete-without-data", reason: sourceCopy.unavailableReason, report },
            );
        };
        const discard = (reason?: string) => {
            rollback();
            releaseCancel();
            releaseSource();
            progress(reason ? { state: "failed", reason } : { state: "cancelled" });
        };
        if (!options.deferCompletion) complete();
        else handedOff = true;
        return {
            enumAdmission: cloneResult.enumAdmission,
            bindings,
            admit,
            complete,
            discard,
            tableIdMap,
            gridIdMap,
            reusedTableIdMap,
            reusedGridIdMap,
            createdRuleIds,
            skippedSourceTableIds: skippedSourceTableIds ?? [],
            outcomes,
        };
    } catch (error) {
        rollback();
        if (cancelled()) {
            progress({ state: "cancelled" });
            return undefined;
        }
        progress({ state: "failed", reason: error instanceof Error ? error.message : String(error) });
        throw error;
    } finally {
        if (!handedOff) {
            releaseCancel();
            releaseSource();
        }
    }
}

function copyRowsFromSameProject(
    projectDoc: Y.Doc,
    project: Project,
    tableIdMap: Record<string, string>,
    sqlNameMap: ReadonlyMap<string, string>,
    bindings: TransferBindings,
    admit: () => void,
): SourceCopyResult {
    admit();
    const rowCounts: Record<string, number> = {};
    for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
        const source = getTableHandles(projectDoc, sourceTableId);
        const destination = getTableHandles(projectDoc, destinationTableId);
        if (!source || !destination) continue;
        copyTableData(source, destination);
        rowCounts[sourceTableId] = destination.data.size;
    }
    const schedules = cloneScheduleRules(
        project,
        project,
        tableIdMap,
        sqlNameMap,
        (id, entry) => bindings.capture("schedule", id, true, entry as Y.Map<unknown>),
    );
    return {
        copiedSchedules: schedules.copied,
        skippedSchedules: schedules.skipped,
        createdRuleIds: schedules.createdRuleIds,
        rowCounts,
    };
}

interface SourceCopyOptions {
    sourceProjectId: string;
    sourceProject?: Project;
    destinationProject: Project;
    tableIdMap: Record<string, string>;
    sqlNameMap: ReadonlyMap<string, string>;
    destinationDoc: Y.Doc;
    cancelled: () => boolean;
    bindings: TransferBindings;
    admit: () => void;
}

function noScheduleRules(): Pick<SourceCopyResult, "copiedSchedules" | "skippedSchedules" | "createdRuleIds"> {
    return { copiedSchedules: [], skippedSchedules: [], createdRuleIds: [] };
}

/**
 * Fill every freshly created destination table from its source table, and bring
 * across the schedule rules that write into them.
 * Returns the reason the rows could not be read, or `undefined` on success.
 */
async function copyRowsFromSource(options: SourceCopyOptions): Promise<SourceCopyResult> {
    const { sourceProjectId, destinationProject, tableIdMap, sqlNameMap, destinationDoc, cancelled } = options;
    const { connectTableDoc } = await import("../../lib/yjs/connection");
    const sourceProject = options.sourceProject;
    try {
        if (!sourceProject) {
            return {
                unavailableReason: "The source project is not available.",
                ...noScheduleRules(),
                rowCounts: {},
            };
        }

        let unavailableReason: string | undefined;
        const rowCounts: Record<string, number> = {};
        for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
            if (cancelled()) return { ...noScheduleRules(), rowCounts };

            const sourceHandles = getTableHandles(sourceProject.ydoc, sourceTableId);
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
                    if (cancelled()) return { ...noScheduleRules(), rowCounts };
                    if (
                        getTableHandles(sourceProject.ydoc, sourceTableId)?.doc !== sourceHandles.doc
                        || getTableHandles(destinationDoc, destinationTableId)?.doc !== destinationHandles.doc
                    ) {
                        throw new StaleGridTransferError(
                            "The source or destination Table identity changed during synchronization.",
                        );
                    }
                    options.admit();
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
        options.admit();
        const schedules = cloneScheduleRules(
            sourceProject,
            destinationProject,
            tableIdMap,
            sqlNameMap,
            (id, entry) => options.bindings.capture("schedule", id, true, entry as Y.Map<unknown>),
        );
        return {
            unavailableReason,
            copiedSchedules: schedules.copied,
            skippedSchedules: schedules.skipped,
            createdRuleIds: schedules.createdRuleIds,
            rowCounts,
        };
    } catch (error) {
        if (error instanceof StaleGridTransferError) throw error;
        options.admit();
        logger.warn({ error, sourceProjectId }, "[cloneGridTablesAcrossProjects] source rows could not be read");
        return {
            unavailableReason: error instanceof Error ? error.message : "The source project is not available.",
            ...noScheduleRules(),
            rowCounts: {},
        };
    }
}

/** Cross-Project Cut composes the existing staged tree move, Table preparation
 * and async history. Preparation touches only a private document; the admitted
 * commit preserves keys/IDs and leaves source definitions and records alone. */
export async function moveGridPlacementsAcrossProjects(
    payload: ItemClipboardPayloadV4,
    context: import("../diagram/diagramClipboard").DiagramPasteContext,
    isDestinationCurrent: () => boolean,
    copyData = true,
): Promise<import("../diagram/diagramClipboard").DiagramClipboardResult> {
    const { currentDiagramAuthorization, resolveDestination, orderAt, subtreeKeys } = await import(
        "../diagram/diagramClipboard"
    );
    const { canMutateDiagrams } = await import("../diagram/diagramAuthorization");
    const { consumePendingCut, lookupCrossProjectGridCut, nodeExists, fingerprintSelection } = await import(
        "../diagram/diagramClipboardTransfer"
    );
    const { canAcceptChild } = await import("../layout/layoutModel");
    const { getTableRegistry, listTables } = await import("../yjstable/tableDocs");
    const { exportGridSlice, exportTableStructures } = await import("../yjstable/tableClone");
    const { captureDuplicationAdmission } = await import("../yjstable/objectDuplication");
    const { globalUndoRouter } = await import("../undo/undoRouter.svelte");
    const { readSqlCatalog } = await import("$shared/services/sqlCatalog");
    const { portableStructuralEnumsStillCompatible } = await import("../yjstable/structuralEnumGuard");
    const refused = (reason: import("../diagram/diagramClipboard").DiagramClipboardFailureReason) => ({
        ok: false as const,
        operation: "paste" as const,
        reason,
    });
    const transferId = payload.transferId;
    if (!transferId || payload.operation !== "cut") return refused("unsupported-payload");
    const transfer = lookupCrossProjectGridCut(transferId, payload.sourceProjectId);
    if (!transfer.ok) return refused(transfer.reason);
    const source = transfer.project;
    const destination = context.project;
    const location = resolveDestination(context);
    if (source.ydoc === destination.ydoc || !location) return refused("invalid-destination");
    const roots = transfer.rootKeys;
    const keys = roots.flatMap(key => subtreeKeys(source, key));
    const values = new Map(keys.map(key => [key, source.tree.getNodeValueFromKey(key) as Y.Map<unknown>]));
    const nodeIds = new Map(keys.map(key => [key, values.get(key)!.get("id")]));
    if (
        [...values.values()].some(value => ["kanban", "diagram"].includes(String(value.get("componentType"))))
    ) return refused("unsupported-selection");
    const calendarIds = [
        ...new Set(
            [...values.values()].flatMap(value =>
                typeof value.get("calendarId") === "string" ? [String(value.get("calendarId"))] : []
            ),
        ),
    ];
    const calendarSources = new Map(calendarIds.map(id => [id, source.calendars.get(id)]));
    const calendarEvidence = JSON.stringify(
        [...calendarSources].map(([id, entry]) => [id, entry?._item?.id, entry?.get("query")]),
    );
    const calendarsCurrent = () =>
        calendarEvidence === JSON.stringify(calendarIds.map(id => {
            const entry = source.calendars.get(id);
            return [id, entry?._item?.id, entry?.get("query")];
        }));
    if ([...calendarSources.values()].some(entry => !entry)) return refused("snapshot-unavailable");
    const gridIds = [
        ...new Set(
            [...values.values()].flatMap(value =>
                typeof value.get("yjsGridId") === "string" ? [String(value.get("yjsGridId"))] : []
            ),
        ),
    ];
    if (gridIds.length === 0) return refused("unsupported-selection");
    const sourceGrids = getGridRegistry(source.ydoc);
    const destinationGrids = getGridRegistry(destination.ydoc);
    const sourceEntries = new Map(gridIds.map(id => [id, sourceGrids.get(id)]));
    const destinationPage = destination.tree.getNodeValueFromKey(context.pageItem.key);
    const destinationParent = destination.tree.getNodeValueFromKey(location.parentKey);
    const destinationAnchor = location.afterKey ? destination.tree.getNodeValueFromKey(location.afterKey) : undefined;
    const sourceLocations = roots.map(key => {
        const parentKey = source.tree.getNodeParentFromKey(key)!;
        const siblings = source.tree.sortChildrenByOrder(source.tree.getNodeChildrenFromKey(parentKey), parentKey);
        return {
            key,
            parentKey,
            parent: source.tree.getNodeValueFromKey(parentKey),
            afterKey: siblings[siblings.indexOf(key) - 1],
        };
    });
    const namespaceOccupied = (project: Project, key: string, id: unknown) => {
        if (nodeExists(project, key)) return true;
        const raw = project.ydoc.getMap<Y.Map<unknown>>("orderedTree");
        let occupied = false;
        raw.forEach(node => {
            const value = node.get("value") as Y.Map<unknown> | undefined;
            if (value instanceof Y.Map && value.get("id") === id) occupied = true;
        });
        return occupied;
    };
    const collision = () =>
        gridIds.some(id => destinationGrids.has(id))
        || keys.some(key => namespaceOccupied(destination, key, nodeIds.get(key)));
    const permissions = () =>
        canMutateDiagrams(currentDiagramAuthorization(source))
        && canMutateDiagrams(currentDiagramAuthorization(destination));
    const locationCurrent = () => {
        const next = resolveDestination(context);
        return isDestinationCurrent() && next?.parentKey === location.parentKey && next.afterKey === location.afterKey
            && nodeExists(destination, context.pageItem.key)
            && destination.tree.getNodeValueFromKey(context.pageItem.key) === destinationPage
            && nodeExists(destination, location.parentKey)
            && destination.tree.getNodeValueFromKey(location.parentKey) === destinationParent
            && (!location.afterKey || (nodeExists(destination, location.afterKey)
                && destination.tree.getNodeValueFromKey(location.afterKey) === destinationAnchor));
    };
    const kindsAllowed = () =>
        roots.every(key =>
            canAcceptChild(location.parentKind, {
                componentType: values.get(key)?.get("componentType") as string | undefined,
            })
        );
    if (!permissions()) return refused("capability-denied");
    if (!locationCurrent() || !kindsAllowed()) return refused("invalid-destination");
    if (collision()) return refused("identity-collision");

    const grids = Object.fromEntries(gridIds.map(id => [id, exportGridSlice(source.ydoc, id)]));
    const tableIds = [...new Set(Object.values(grids).flatMap(grid => grid.tableIds))];
    const snapshots = exportTableStructures(source.ydoc, tableIds);
    const assertSource = captureDuplicationAdmission(source.ydoc, [
        ...gridIds.map(id => ({ type: "grid" as const, id })),
        ...tableIds.map(id => ({ type: "table" as const, id })),
    ]);
    const sourceCatalog = readSqlCatalog(source.ydoc.guid, source.ydoc);
    if (sourceCatalog.status !== "ready") return refused("snapshot-unavailable");
    const scratch = new Y.Doc({ guid: destination.ydoc.guid });
    // Preparation is private: its writes must never create user history or
    // clear an existing Redo branch, including writes in copied subdocuments.
    const markPrivate = (doc: Y.Doc) =>
        doc.on("beforeTransaction", transaction => {
            if (transaction.origin === null) transaction.origin = scratch;
        });
    markPrivate(scratch);
    scratch.on("subdocs", ({ added }) => added.forEach(markPrivate));
    let disposeCalendarPreparation = () => {};

    const cloneTableEntry = (
        entry: Y.Map<unknown>,
        snapshot: { guid: string; update: Uint8Array; },
    ): Y.Map<unknown> => {
        const copy = new Y.Map<unknown>();
        entry.forEach((value, key) => {
            if (value instanceof Y.Doc) {
                const doc = new Y.Doc({ guid: snapshot.guid, autoLoad: true });
                Y.applyUpdate(doc, snapshot.update);
                copy.set(key, doc);
            } else copy.set(key, value instanceof Y.AbstractType ? value.clone() : value);
        });
        return copy;
    };
    getTableRegistry(destination.ydoc).forEach((entry, id) => {
        const metadata = new Y.Map<unknown>();
        entry.forEach((value, key) => {
            if (key !== "doc") metadata.set(key, value);
        });
        getTableRegistry(scratch).set(id, metadata);
    });
    // Absence is a valid empty catalog. getMap on an absent root would
    // register an invalid, format-less catalog in the live destination.
    const destinationCatalog = readSqlCatalog(destination.ydoc.guid, destination.ydoc);
    if (destinationCatalog.status !== "ready") {
        scratch.destroy();
        return refused("snapshot-unavailable");
    }
    const catalogRoot = destination.ydoc.share.get("sqlCatalog");
    if (catalogRoot instanceof Y.Map) {
        catalogRoot.forEach((entry, id) =>
            scratch.getMap("sqlCatalog").set(id, entry instanceof Y.Map ? entry.clone() : entry)
        );
    }
    const destinationTables = new Map(
        listTables(destination.ydoc).map(
            table => [table.tableId, {
                entry: getTableRegistry(destination.ydoc).get(table.tableId),
                sqlName: table.sqlName,
            }],
        ),
    );
    let preparation: Awaited<ReturnType<typeof cloneGridTablesAcrossProjects>>;
    try {
        preparation = await cloneGridTablesAcrossProjects({
            destinationDoc: scratch,
            destinationProject: Project.fromDoc(scratch),
            sourceProjectId: source.ydoc.guid,
            snapshots,
            grids,
            catalog: sourceCatalog.snapshot,
            requestedSourceTableIds: tableIds,
            copyData,
            allowProvenanceReuse: true,
            silent: true,
            isDestinationCurrent: () =>
                locationCurrent() && permissions() && lookupCrossProjectGridCut(transferId, source.ydoc.guid).ok
                && !collision(),
        });
        if (!preparation) return refused(collision() ? "identity-collision" : "stale-transfer");
        if (preparation.outcomes.some(outcome => outcome.type === "failed-group")) {
            return refused("snapshot-unavailable");
        }
        assertSource();
        if (!calendarsCurrent()) return refused("stale-transfer");
        if (!lookupCrossProjectGridCut(transferId, source.ydoc.guid).ok || !locationCurrent()) {
            return refused("stale-transfer");
        }
        if (!permissions()) return refused("capability-denied");
        if (collision()) return refused("identity-collision");
        if (
            !portableStructuralEnumsStillCompatible(
                destination.ydoc,
                snapshots,
                source.ydoc,
                grids,
                payload.catalog,
                [],
                preparation.enumAdmission,
            )
        ) {
            return refused("stale-transfer");
        }
        const copiedTables = new Map(
            Object.values(preparation.tableIdMap).map(id => [id, getTableRegistry(scratch).get(id)!]),
        );
        // Destroying an integrated Y.Doc replaces its parent's subdocument
        // reference with an empty shell. Retain bytes, not that mutable handle,
        // so Redo restores the same schema and records after private teardown.
        const copiedTableStates = new Map([...copiedTables].map(([id, entry]) => {
            const doc = entry.get("doc");
            if (!(doc instanceof Y.Doc)) throw new StaleGridTransferError("Prepared Table is unavailable");
            return [id, { guid: doc.guid, update: Y.encodeStateAsUpdate(doc) }] as const;
        }));
        const copiedGrids = new Map(
            gridIds.map(id => [id, getGridRegistry(scratch).get(preparation!.gridIdMap[id])!]),
        );
        const copiedRules = new Map(
            preparation.createdRuleIds.map(id => [id, scratch.getMap<Y.Map<unknown>>("schedules").get(id)!]),
        );
        const { createCalendar, getCalendar, destroyCalendarUndoManager } = await import("../calendar/calendarService");
        disposeCalendarPreparation = () => destroyCalendarUndoManager(scratch);
        const { rewriteTableQuerySql } = await import("../yjstable/tableSqlRewrite");
        const sqlNames = new Map<string, string>();
        for (const [id, target] of Object.entries({ ...preparation.reusedTableIdMap, ...preparation.tableIdMap })) {
            const name = snapshots[id]?.sqlName;
            const targetName = listTables(scratch).find(table => table.tableId === target)?.sqlName;
            if (name && targetName) sqlNames.set(name, targetName);
        }
        const calendarMap = new Map(calendarIds.map(id => {
            const settings = getCalendar(source, id)!;
            return [
                id,
                createCalendar(Project.fromDoc(scratch), {
                    ...settings,
                    query: rewriteTableQuerySql(settings.query, sqlNames).sql,
                }),
            ];
        }));
        const copiedCalendars = new Map(
            [...calendarMap.values()].map(id => [id, Project.fromDoc(scratch).calendars.get(id)!]),
        );
        const reused = Object.values(preparation.reusedTableIdMap);
        const namesCurrent = () => {
            const tables = listTables(destination.ydoc);
            return [...copiedRules.keys()].every(id => !destination.ydoc.getMap("schedules").has(id))
                && [...copiedCalendars.keys()].every(id => !destination.calendars.has(id))
                && [...copiedTables].every(([id, entry]) =>
                    !getTableRegistry(destination.ydoc).has(id)
                    && !tables.some(table => table.sqlName === entry.get("sqlName"))
                )
                && reused.every(id =>
                    getTableRegistry(destination.ydoc).get(id) === destinationTables.get(id)?.entry
                    && tables.find(table => table.tableId === id)?.sqlName === destinationTables.get(id)?.sqlName
                );
        };
        if (!namesCurrent()) return refused("identity-collision");
        // Snapshot the live nodes only now, so content edits accepted during
        // preparation travel with them. Grid definitions remain Project-local.
        const nodeSnapshots = scratch.getMap<Y.Map<unknown>>("moveNodes");
        for (const key of keys) nodeSnapshots.set(key, values.get(key)!.clone());
        const children = new Map(
            keys.map(key => [key, source.tree.sortChildrenByOrder(source.tree.getNodeChildrenFromKey(key), key)]),
        );
        const insert = (project: Project, key: string, parentKey: string) => {
            const snapshot = nodeSnapshots.get(key)!.clone();
            const calendar = nodeSnapshots.get(key)!.get("calendarId");
            if (project === destination && typeof calendar === "string" && calendarMap.has(calendar)) {
                snapshot.set("calendarId", calendarMap.get(calendar)!);
            }
            project.tree.createNode(parentKey, key, snapshot as never);
            project.tree.recomputeParentsAndChildren();
            project.tree.setNodeOrderToEnd(key);
            for (const child of children.get(key) ?? []) insert(project, child, key);
        };
        const install = () => {
            for (const [id, entry] of copiedCalendars) destination.calendars.set(id, entry.clone());
            for (const [id, entry] of copiedTables) {
                getTableRegistry(destination.ydoc).set(id, cloneTableEntry(entry, copiedTableStates.get(id)!));
            }
            for (const [id, entry] of copiedGrids) destinationGrids.set(id, entry.clone());
            for (const [id, entry] of copiedRules) {
                destination.ydoc.getMap<Y.Map<unknown>>("schedules").set(id, entry.clone());
            }
            let after = location.afterKey;
            for (const key of roots) {
                insert(destination, key, location.parentKey);
                orderAt(destination, key, location.parentKey, after, location.append);
                after = key;
            }
            for (const key of roots) source.tree.deleteNodeAndDescendants(key);
        };
        const ownedState = () =>
            JSON.stringify({
                nodes: keys.map(key =>
                    nodeExists(destination, key)
                        ? (destination.tree.getNodeValueFromKey(key) as Y.Map<unknown>).toJSON()
                        : undefined
                ),
                placement: fingerprintSelection(destination, roots),
                calendars: [...copiedCalendars.keys()].map(id => ({
                    incarnation: destination.calendars.get(id)?._item?.id,
                    value: destination.calendars.get(id)?.toJSON(),
                })),
                grids: [...copiedGrids.keys()].map(id => ({
                    incarnation: destinationGrids.get(id)?._item?.id,
                    value: destinationGrids.get(id)?.toJSON(),
                })),
                tables: [...copiedTables.keys()].map(id => {
                    const entry = getTableRegistry(destination.ydoc).get(id);
                    const doc = entry?.get("doc");
                    return doc instanceof Y.Doc
                        ? {
                            incarnation: entry?._item?.id,
                            name: entry?.get("name"),
                            sqlName: entry?.get("sqlName"),
                            schema: doc.getText("schema").toString(),
                            data: doc.getMap("data").toJSON(),
                        }
                        : undefined;
                }),
                rules: [...copiedRules.keys()].map(id =>
                    destination.ydoc.getMap<Y.Map<unknown>>("schedules").get(id)?.toJSON()
                ),
            });
        let expectedDestination = "";
        let expectedSource = "";
        const sourceNodeState = () =>
            JSON.stringify({
                placement: fingerprintSelection(source, roots),
                nodes: keys.map(key =>
                    nodeExists(source, key)
                        ? (source.tree.getNodeValueFromKey(key) as Y.Map<unknown>).toJSON()
                        : undefined
                ),
            });
        const sourceDefinitionCurrent = () =>
            gridIds.every(id => sourceGrids.get(id) === sourceEntries.get(id))
            && calendarIds.every(id => source.calendars.get(id) === calendarSources.get(id));
        const both = (change: () => void) => source.ydoc.transact(() => destination.ydoc.transact(change));
        await globalUndoRouter.captureManualAsync(async () => {
            // Re-derive pending structural authority at the actual commit
            // boundary, after every asynchronous import and history setup.
            const currentTransfer = lookupCrossProjectGridCut(transferId, source.ydoc.guid);
            if (
                !currentTransfer.ok || currentTransfer.project !== source
                || JSON.stringify(currentTransfer.rootKeys) !== JSON.stringify(roots)
                || !portableStructuralEnumsStillCompatible(
                    destination.ydoc,
                    snapshots,
                    source.ydoc,
                    grids,
                    payload.catalog,
                    [],
                    preparation.enumAdmission,
                )
            ) {
                throw new StaleGridTransferError("Pending move changed");
            }
            // No await separates final admission from the first shared mutation.
            assertSource();
            if (!permissions() || !calendarsCurrent() || !locationCurrent() || collision() || !namesCurrent()) {
                throw new StaleGridTransferError("Move admission changed");
            }
            consumePendingCut(transferId);
            both(install);
            expectedDestination = ownedState();
        }, {
            type: "async",
            label: "Move Grid placements across Projects",
            projectId: destination.ydoc.guid,
            affectedObjectIds: keys,
            beforeSource: roots,
            afterSource: roots,
            isActive: () => !source.ydoc.isDestroyed && !destination.ydoc.isDestroyed,
            replay: async direction => {
                if (!permissions() || !sourceDefinitionCurrent()) {
                    return { status: "refused", reason: "Source view or access changed" };
                }
                if (direction === "undo") {
                    if (
                        ownedState() !== expectedDestination || keys.some(key =>
                            namespaceOccupied(source, key, nodeSnapshots.get(key)!.get("id"))
                        )
                        || sourceLocations.some(place =>
                            !nodeExists(source, place.parentKey)
                            || source.tree.getNodeValueFromKey(place.parentKey) !== place.parent
                            || (place.afterKey && !keys.includes(place.afterKey) && !nodeExists(source, place.afterKey))
                        )
                    ) return { status: "conflict", reason: "The move's objects or source location changed" };
                    both(() => {
                        for (const place of sourceLocations) {
                            insert(source, place.key, place.parentKey);
                            orderAt(source, place.key, place.parentKey, place.afterKey, false);
                        }
                        for (const key of roots) destination.tree.deleteNodeAndDescendants(key);
                        for (const id of copiedCalendars.keys()) destination.calendars.delete(id);
                        for (const id of copiedGrids.keys()) destinationGrids.delete(id);
                        for (const id of copiedTables.keys()) removeTable(destination.ydoc, id);
                        for (const id of copiedRules.keys()) destination.ydoc.getMap("schedules").delete(id);
                    });
                    expectedSource = sourceNodeState();
                } else {
                    try {
                        assertSource();
                        if (!calendarsCurrent()) return { status: "refused", reason: "Source Calendar changed" };
                    } catch {
                        return { status: "refused", reason: "Source query or dependency identity changed" };
                    }
                    if (sourceNodeState() !== expectedSource || collision() || !namesCurrent() || !locationCurrent()) {
                        return { status: "conflict", reason: "The destination or source placement changed" };
                    }
                    if (
                        !portableStructuralEnumsStillCompatible(
                            destination.ydoc,
                            snapshots,
                            source.ydoc,
                            grids,
                            payload.catalog,
                            [],
                            preparation.enumAdmission,
                        )
                    ) return { status: "refused", reason: "SQL ENUM admission changed" };
                    both(install);
                    expectedDestination = ownedState();
                }
                return { status: "applied" };
            },
        });
        reportProgress({
            state: "complete-with-data",
            report: [
                ...formatGridPasteReport(preparation.outcomes),
                "Moved placements with their original IDs; source Grids and Tables were retained.",
            ],
        });
        return {
            ok: true,
            operation: "paste",
            transferId,
            itemIds: roots.map(key => String(nodeSnapshots.get(key)!.get("id"))),
        };
    } catch (error) {
        logger.warn({ error }, "Cross-Project Grid move refused");
        return refused(collision() ? "identity-collision" : "stale-transfer");
    } finally {
        disposeCalendarPreparation();
        scratch.destroy();
    }
}
