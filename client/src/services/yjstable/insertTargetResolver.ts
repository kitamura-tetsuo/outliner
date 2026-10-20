import type * as Y from "yjs";
import {
    resolveInsertTarget as resolvePolicy,
    validateInsertTargetPreference as validatePolicy,
} from "../../../../shared/src/services/insertTargetPolicy";
import type { SharedInsertResolverOptions } from "../../../../shared/src/services/insertTargetPolicy";
import type { ProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
export type {
    EffectiveInsertTarget,
    InsertPreferenceDiagnostic,
    InsertTargetMode,
    InsertTargetResolution,
} from "../../../../shared/src/services/insertTargetPolicy";
import type { ProjectSelectEvidence, ProjectSelectSession } from "./projectSelectSession";
import type { RelationProvider } from "./relationProvider";
import { getTableSqlName } from "./tableDocs";
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

function adapt(options: InsertTargetResolverOptions): SharedInsertResolverOptions {
    return {
        ...options,
        isEvidenceCurrent: () => options.session.isEvidenceCurrent(options.evidence),
        resolveLiveInsertCandidate: async supplier => {
            if (supplier.kind === "table" && getTableSqlName(options.projectDoc, supplier.id) !== supplier.sqlName) {
                return undefined;
            }
            const provider = await options.resolveRelation(supplier.sqlName);
            return provider?.evidence ? { source: provider.evidence, insert: provider.capabilities.insert } : undefined;
        },
    };
}
export function resolveInsertTarget(options: InsertTargetResolverOptions) {
    return resolvePolicy(adapt(options));
}
export function validateInsertTargetPreference(
    options: Omit<InsertTargetResolverOptions, "insertTargetTableId">,
    tableId: string | undefined,
) {
    return validatePolicy(adapt(options), tableId);
}
