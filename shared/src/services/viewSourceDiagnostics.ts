import type { InsertTargetResolution } from "./insertTargetPolicy.js";
import type { ProjectQueryProvenance } from "./projectQueryProvenance.js";
import type { SelectProvenanceEvidence } from "./viewSourceEvidence.js";

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
        relations: ProjectQueryProvenance["dependencies"]["relations"];
        count?: number;
        truncated: boolean;
    };
    provenance: Pick<ProjectQueryProvenance, "status" | "reason" | "suppliers" | "branches" | "bareIdSource"> & {
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
            relations: proof.dependencies.relations.slice(0, 100),
            count: proof.dependencies.relations.length,
            truncated: proof.dependencies.relations.length > 100,
        },
        provenance: {
            status: proof.status,
            supplierCount: proof.suppliers.length,
            branchCount: proof.branches.length,
            truncated: proof.suppliers.length > 100 || proof.branches.length > 100
                || proof.branches.some(branch => branch.columns.length > 100),
            reason: proof.reason,
            suppliers: proof.suppliers.slice(0, 100),
            branches: proof.branches.slice(0, 100).map(branch => ({
                ...branch,
                columns: branch.columns.slice(0, 100),
            })),
            bareIdSource: proof.bareIdSource,
        },
        insert,
    };
}
