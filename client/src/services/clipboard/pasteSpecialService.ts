import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { store as generalStore } from "../../stores/store.svelte";
import { computeSnapshotClosure, copyTableData, importTableStructures } from "../yjstable/tableClone";
import { getTableHandles } from "../yjstable/tableDocs";
import { formatGridPasteReport } from "./crossProjectGridPaste";
import { GRID_PASTE_PROGRESS_EVENT } from "./gridPasteEvents";
import { type ItemClipboardPayloadV3 } from "./itemClipboard";
import { type PasteSpecialVariant } from "./pasteSpecialVariants";

const logger = getLogger("pasteSpecialService");

export async function executePasteSpecialVariant(
    variant: PasteSpecialVariant,
    structured: ItemClipboardPayloadV3,
    destinationDoc: Y.Doc,
): Promise<{ pastedTableIdMap?: Record<string, string>; pastedSkippedTableIds?: string[]; } | undefined> {
    const referencedTableIds = new Set(
        structured.items.flatMap(item =>
            item.componentType === "yjstable" && item.yjsTableId !== undefined ? [item.yjsTableId] : []
        ),
    );
    const closureTableIds = computeSnapshotClosure(structured.tables || {}, referencedTableIds);
    const referencedSnapshots = Object.fromEntries(
        [...closureTableIds].flatMap(sourceTableId => {
            const snapshot = structured.tables?.[sourceTableId];
            return snapshot === undefined ? [] : [[sourceTableId, snapshot]];
        }),
    );

    if (Object.keys(referencedSnapshots).length === 0) {
        return undefined;
    }

    if (variant === "another-view") {
        return { pastedTableIdMap: {}, pastedSkippedTableIds: [] };
    }

    if (variant === "values-only") {
        return undefined;
    }

    const isSameProject = structured.sourceProjectId === destinationDoc.guid;
    const sourceProjectId = structured.sourceProjectId;

    if (isSameProject && (variant === "independent-copy-with-data" || variant === "independent-copy-no-data")) {
        try {
            const cloneResult = await importTableStructures(
                destinationDoc,
                referencedSnapshots,
                sourceProjectId,
                referencedTableIds,
            );

            const rowCounts: Record<string, number> = {};
            if (variant === "independent-copy-with-data") {
                for (const [sourceId, destId] of Object.entries(cloneResult.tableIdMap)) {
                    const sourceHandles = getTableHandles(destinationDoc, sourceId);
                    const destHandles = getTableHandles(destinationDoc, destId);
                    if (sourceHandles && destHandles) {
                        copyTableData(sourceHandles, destHandles);
                        rowCounts[sourceId] = Array.from(destHandles.data.keys()).length;
                    }
                }
            }

            const outcomes = cloneResult.outcomes.map(outcome =>
                outcome.type === "cloned"
                    ? { ...outcome, rowCount: rowCounts[outcome.sourceTableId] ?? 0 }
                    : outcome
            );

            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(GRID_PASTE_PROGRESS_EVENT, {
                        detail: { state: "complete-with-data", report: formatGridPasteReport(outcomes) },
                    }),
                );
            }

            return {
                pastedTableIdMap: cloneResult.tableIdMap,
                pastedSkippedTableIds: cloneResult.skippedSourceTableIds,
            };
        } catch (e) {
            logger.error({ error: e }, "Failed to execute same-project paste special");
            return undefined;
        }
    } else if (!isSameProject && (variant === "independent-copy-with-data" || variant === "independent-copy-no-data")) {
        const { cloneGridTablesAcrossProjects } = await import(
            "./crossProjectGridPaste"
        );
        const cloneResult = await cloneGridTablesAcrossProjects({
            destinationDoc,
            sourceProjectId: structured.sourceProjectId,
            snapshots: referencedSnapshots,
            requestedSourceTableIds: [...referencedTableIds],
            operation: structured.operation,
            isDestinationCurrent: () => generalStore.project?.ydoc === destinationDoc,
            noData: variant === "independent-copy-no-data",
        } as any);

        if (cloneResult === undefined) return undefined;

        return {
            pastedTableIdMap: cloneResult.tableIdMap,
            pastedSkippedTableIds: cloneResult.skippedSourceTableIds,
        };
    }

    return undefined;
}
