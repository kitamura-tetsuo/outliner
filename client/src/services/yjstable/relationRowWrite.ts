// Write-back for a row whose identity survived a projection across several
// relations (a UNION of outline items with generated rows, say).
//
// `analyzeQueryEditability` decides *whether* such a row may be edited, and
// exposes `rowIdentity: "source"` when it is addressed by its `source_kind` +
// `source_id` pair rather than a bare `id`. This is the other half: given a
// cell edit, `source_kind` names the relation the row came from (a SQL name
// the query resolved through `RelationRegistryPort.resolveRelation`) and
// `source_id` is that relation's own row identity. Re-resolving the provider
// by name and applying the write is exactly how a cross-relation query
// materializes a sibling relation — see `tableSyncAdapter.ts`.

import type { RelationProvider, RelationValue } from "./relationProvider";
import { RelationWriteError } from "./relationProvider";

export interface RelationResolver {
    resolveRelation(sqlName: string): Promise<RelationProvider | undefined>;
}

/**
 * Apply an UPDATE to the relation named by `sourceKind`, addressing the row
 * by `sourceId`. Throws `RelationWriteError` when the project has no such
 * relation (a stale `source_kind`, say) or when the relation refuses the
 * write — the same error the caller would get editing that relation directly.
 */
export async function applyUnionedRowEdit(
    resolver: RelationResolver,
    sourceKind: string,
    sourceId: string,
    column: string,
    value: RelationValue,
): Promise<void> {
    const provider = await resolver.resolveRelation(sourceKind);
    if (!provider) {
        throw new RelationWriteError(`Unknown relation "${sourceKind}" for a unioned row edit`);
    }
    await provider.applyWrite({ op: "UPDATE", rowId: sourceId, column, value });
}
