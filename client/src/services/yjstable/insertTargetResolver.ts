import type * as Y from "yjs";
import type { ProjectQueryProvenance, ProvenanceRelation } from "./projectQueryProvenance";
import { isProjectQueryProvenanceCurrent } from "./projectQueryProvenance";
import type { ProjectSelectEvidence, ProjectSelectSession } from "./projectSelectSession";
import type { RelationProvider } from "./relationProvider";
import { getTableSqlName } from "./tableDocs";

export type InsertTargetMode =
    | "automatic"
    | "configured"
    | "selection-required"
    | "invalid-selection"
    | "unsupported"
    | "unavailable";

export interface EffectiveInsertTarget {
    kind: "table" | "system";
    /** Stable Table id, or the system relation's real identity. */
    id: string;
    sqlName: string;
    /** The extra decision a provider requires before accepting INSERT. */
    requiresDestination: boolean;
}

export interface InsertPreferenceDiagnostic {
    code: "not-a-supplier" | "unavailable";
    tableId: string;
    message: string;
}

export interface InsertTargetResolution {
    mode: InsertTargetMode;
    target?: EffectiveInsertTarget;
    /** A dormant saved-preference problem is independent of an automatic target. */
    preferenceDiagnostic?: InsertPreferenceDiagnostic;
    reason?: string;
}

export interface InsertTargetResolverOptions {
    projectDoc: Y.Doc;
    evidence: ProjectSelectEvidence;
    provenance: ProjectQueryProvenance;
    insertTargetTableId?: string;
    /** Live query/catalog authority which produced `evidence`. */
    session: Pick<ProjectSelectSession, "isEvidenceCurrent">;
    /** Resolves the live provider admitted to this Project; the caller retains ownership. */
    resolveRelation: (sqlName: string) => Promise<RelationProvider | undefined>;
}

/**
 * Decide the INSERT destination without mutating settings or applying a write.
 * The execution evidence, provenance proof, registry identity and live provider
 * must all describe the same relation before it can be returned as authority.
 */
export async function resolveInsertTarget(options: InsertTargetResolverOptions): Promise<InsertTargetResolution> {
    const { evidence, provenance, insertTargetTableId } = options;
    if (!options.session.isEvidenceCurrent(evidence) || !isProjectQueryProvenanceCurrent(provenance, evidence)) {
        return unavailable("The query or execution generation changed; run the query again");
    }
    if (provenance.status === "unsupported") {
        return { mode: "unsupported", reason: provenance.reason ?? "INSERT provenance is unsupported" };
    }
    if (provenance.status !== "proven") {
        return unavailable(provenance.reason ?? "INSERT supplier proof is unavailable");
    }
    if (provenance.suppliers.length === 0) return unavailable("The query proves no INSERT supplier");

    const selected = insertTargetTableId
        ? provenance.suppliers.find(supplier => supplier.kind === "table" && supplier.id === insertTargetTableId)
        : undefined;
    const diagnostic = insertTargetTableId && !selected
        ? invalidPreference(insertTargetTableId, "The saved Table is not a row supplier of the current query")
        : undefined;

    if (provenance.suppliers.length === 1) {
        const target = await liveTarget(options, provenance.suppliers[0]!);
        if (!target) {
            return {
                mode: "unavailable",
                preferenceDiagnostic: diagnostic ?? (insertTargetTableId
                    ? unavailablePreference(insertTargetTableId, "The saved Table is no longer available for INSERT")
                    : undefined),
                reason: "The sole supplier is not currently available and INSERT-capable",
            };
        }
        return { mode: "automatic", target, preferenceDiagnostic: diagnostic };
    }

    if (!insertTargetTableId) return { mode: "selection-required" };
    if (!selected) return { mode: "invalid-selection", preferenceDiagnostic: diagnostic };
    const target = await liveTarget(options, selected);
    if (!target) {
        return {
            mode: "unavailable",
            preferenceDiagnostic: unavailablePreference(
                insertTargetTableId,
                "The selected supplier is no longer available and INSERT-capable",
            ),
            reason: "The selected supplier cannot currently accept INSERT",
        };
    }
    return { mode: "configured", target };
}

/** Strictly validate a newly submitted preference; clearing it is always valid. */
export async function validateInsertTargetPreference(
    options: Omit<InsertTargetResolverOptions, "insertTargetTableId">,
    tableId: string | undefined,
): Promise<{ valid: boolean; resolution: InsertTargetResolution; }> {
    const resolution = await resolveInsertTarget({ ...options, insertTargetTableId: tableId });
    if (tableId === undefined) return { valid: true, resolution };
    const valid = resolution.preferenceDiagnostic === undefined
        && resolution.target?.kind === "table"
        && resolution.target.id === tableId;
    return { valid, resolution };
}

async function liveTarget(
    options: InsertTargetResolverOptions,
    supplier: ProvenanceRelation,
): Promise<EffectiveInsertTarget | undefined> {
    if (supplier.kind === "table" && getTableSqlName(options.projectDoc, supplier.id) !== supplier.sqlName) {
        return undefined;
    }
    const provider = await options.resolveRelation(supplier.sqlName);
    const live = provider?.evidence;
    if (
        !provider || !live || live.kind !== supplier.kind || live.id !== supplier.id
        || live.sqlName !== supplier.sqlName || live.schemaRevision !== supplier.schemaRevision
        || !provider.capabilities.insert
    ) return undefined;
    // Provider resolution can cross an async catalog/query invalidation.
    if (!options.session.isEvidenceCurrent(options.evidence)) return undefined;
    return {
        kind: live.kind,
        id: live.id,
        sqlName: live.sqlName,
        requiresDestination: provider.capabilities.insert.requiresDestination,
    };
}

function invalidPreference(tableId: string, message: string): InsertPreferenceDiagnostic {
    return { code: "not-a-supplier", tableId, message };
}

function unavailablePreference(tableId: string, message: string): InsertPreferenceDiagnostic {
    return { code: "unavailable", tableId, message };
}

function unavailable(reason: string): InsertTargetResolution {
    return { mode: "unavailable", reason };
}
