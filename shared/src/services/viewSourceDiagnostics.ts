import type { InsertTargetResolution } from "./insertTargetPolicy.js";
import type { ProjectQueryProvenance } from "./projectQueryProvenance.js";
import type { SelectProvenanceEvidence } from "./viewSourceEvidence.js";

export interface ViewSourceRelation {
    kind: "table" | "system";
    id: string;
    sqlName: string;
}
export interface ViewSourceColumn {
    outputColumn: string;
    physicalColumn: string;
    source: ViewSourceRelation;
}
export interface ViewSourceBranch {
    source: ViewSourceRelation;
    columns: readonly ViewSourceColumn[];
    routedIdentity: boolean;
    claimedSourceKind?: string;
}
export interface ViewSourceDiagnostics {
    execution: {
        status: "completed" | "loading" | "error" | "unavailable";
        current: boolean;
        queryId?: string;
        executionGeneration?: number;
        catalogRevision?: string;
    };
    dependencies: {
        status: "proven" | "unknown";
        relations: readonly ViewSourceRelation[];
        count?: number;
        truncated: boolean;
    };
    provenance: {
        status: ProjectQueryProvenance["status"];
        reason?: string;
        suppliers: readonly ViewSourceRelation[];
        branches: readonly ViewSourceBranch[];
        bareIdSource?: ViewSourceRelation;
        supplierCount?: number;
        branchCount?: number;
        truncated: boolean;
    };
    insert: InsertTargetResolution;
}

export function unavailableViewSources(
    status: "loading" | "error" | "unavailable" = "unavailable",
): ViewSourceDiagnostics {
    return {
        execution: { status, current: false },
        dependencies: { status: "unknown", relations: [], truncated: false },
        provenance: {
            status: "unknown",
            truncated: false,
            reason: "Current SELECT evidence is unavailable",
            suppliers: [],
            branches: [],
        },
        insert: { mode: "unavailable", reason: "Current SELECT evidence is unavailable" },
    };
}

/** Bound only after policy decisions have used the complete execution evidence. */
export function describeViewSources(
    evidence: SelectProvenanceEvidence,
    proof: ProjectQueryProvenance,
    insert: InsertTargetResolution,
): ViewSourceDiagnostics {
    return {
        execution: {
            status: "completed",
            current: true,
            queryId: evidence.queryId,
            executionGeneration: evidence.executionGeneration,
            catalogRevision: evidence.catalogRevision,
        },
        dependencies: {
            status: proof.dependencies.status,
            relations: proof.dependencies.relations.slice(0, 100).map(publicRelation),
            count: proof.dependencies.relations.length,
            truncated: proof.dependencies.relations.length > 100,
        },
        provenance: {
            status: proof.status,
            supplierCount: proof.suppliers.length,
            branchCount: proof.branches.length,
            truncated: proof.suppliers.length > 100 || proof.branches.length > 100
                || proof.branches.some(branch => branch.columns.length > 100),
            reason: publicText(proof.reason),
            suppliers: proof.suppliers.slice(0, 100).map(publicRelation),
            branches: proof.branches.slice(0, 100).map(branch => ({
                source: publicRelation(branch.source),
                routedIdentity: branch.routedIdentity,
                claimedSourceKind: publicText(branch.claimedSourceKind),
                columns: branch.columns.slice(0, 100).map(column => ({
                    outputColumn: column.outputColumn,
                    physicalColumn: column.physicalColumn,
                    source: publicRelation(column.source),
                })),
            })),
            bareIdSource: proof.bareIdSource && publicRelation(proof.bareIdSource),
        },
        insert: {
            mode: insert.mode,
            target: insert.target && {
                kind: insert.target.kind,
                id: insert.target.id,
                sqlName: insert.target.sqlName,
                requiresDestination: insert.target.requiresDestination,
            },
            reason: publicText(insert.reason),
            preferenceDiagnostic: insert.preferenceDiagnostic && {
                code: insert.preferenceDiagnostic.code,
                tableId: insert.preferenceDiagnostic.tableId,
                message: publicText(insert.preferenceDiagnostic.message)!,
            },
        },
    };
}

/** Internal schema equality evidence never crosses this public boundary. */
function publicRelation(source: ViewSourceRelation): ViewSourceRelation {
    return { kind: source.kind, id: source.id, sqlName: source.sqlName };
}
function publicText(value: string | undefined): string | undefined {
    const marker = "… [truncated]";
    return value && value.length > 512 ? value.slice(0, 512 - marker.length) + marker : value;
}
