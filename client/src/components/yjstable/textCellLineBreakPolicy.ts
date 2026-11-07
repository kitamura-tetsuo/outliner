import type { GridPhysicalColumnMetadata } from "../../services/yjstable/gridMetadataResolver";
import type { GridCommandRowTarget } from "../../services/yjstable/gridSelectionCommands";
import type { TableColumnSchema } from "../../services/yjstable/schemaIntrospection";

export type TextLineBreakPolicy = { kind: "allowed"; } | { kind: "forbidden" | "unavailable"; reason: string; };
const TYPES = new Set(["text", "character varying", "character"]);
const REASON = "This destination does not accept line breaks.";

/** Restricts hard breaks from physical provenance; it never grants write authority. */
export function textLineBreakPolicy(options: {
    grid: boolean;
    column: string;
    rowTarget?: GridCommandRowTarget;
    physicalColumns: readonly GridPhysicalColumnMetadata[];
    rawTableColumn?: TableColumnSchema;
}): TextLineBreakPolicy {
    if (!options.grid) {
        return options.rawTableColumn && TYPES.has(options.rawTableColumn.dataType.toLowerCase())
            ? { kind: "allowed" }
            : { kind: "forbidden", reason: REASON };
    }
    if (!options.rowTarget?.source) return { kind: "unavailable", reason: REASON };
    const candidates = options.physicalColumns.filter(candidate =>
        candidate.outputColumn === options.column
        && candidate.source.sqlName === options.rowTarget?.source?.sourceKind
    );
    const first = candidates[0];
    if (
        !first?.field || first.source.kind !== "table" || candidates.some(candidate =>
            !candidate.field
            || candidate.source.kind !== first.source.kind || candidate.source.id !== first.source.id
            || candidate.source.sqlName !== first.source.sqlName
            || candidate.source.schemaRevision !== first.source.schemaRevision
            || candidate.physicalColumn !== first.physicalColumn
        )
    ) return { kind: "unavailable", reason: REASON };
    return TYPES.has(first.field.dataType.toLowerCase()) ? { kind: "allowed" } : { kind: "forbidden", reason: REASON };
}

export const draftHasLineBreak = (value: unknown): boolean => typeof value === "string" && /[\r\n]/.test(value);
