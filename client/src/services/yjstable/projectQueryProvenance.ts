import { loadModule, parseSync } from "libpg-query";
import type { ProjectSelectEvidence } from "./projectSelectSession";
import type { RelationEvidence } from "./relationProvider";

await loadModule();

type Node = Record<string, unknown>;

export interface ProvenanceRelation {
    kind: RelationEvidence["kind"];
    id: string;
    sqlName: string;
    schemaRevision: string;
}

export interface ProvenanceColumnWrite {
    outputColumn: string;
    physicalColumn: string;
    source: ProvenanceRelation;
}

export interface ProvenanceBranch {
    source: ProvenanceRelation;
    /** Output columns which are unchanged physical fields for this branch. */
    columns: readonly ProvenanceColumnWrite[];
    /** True only when this branch carries a verified source_kind/source_id pair. */
    routedIdentity: boolean;
    /** Literal source_kind emitted by this branch, including unverified claims. */
    claimedSourceKind?: string;
}

export interface ProjectQueryProvenance {
    status: "proven" | "unsupported" | "unknown";
    reason?: string;
    /** A successful execution proves this set even when it is empty. */
    dependencies: { status: "proven" | "unknown"; relations: readonly ProvenanceRelation[]; };
    suppliers: readonly ProvenanceRelation[];
    branches: readonly ProvenanceBranch[];
    /** Present only for a single supplier carrying its unchanged id. */
    bareIdSource?: ProvenanceRelation;
    queryId: string;
    queryRevision: number;
    executionGeneration: number;
    catalogGeneration: number;
    catalogRevision?: string;
    fingerprint: string;
}

interface BranchShape {
    relation: RelationEvidence;
    targets: readonly Node[];
    alias?: string;
}

/**
 * Built-in PostgreSQL aggregate and ordered-set aggregate names available to
 * Project queries. Project catalogs cannot define functions, so recognizing
 * this complete built-in family is sufficient while still allowing ordinary
 * scalar functions to coexist with independently proven physical columns.
 */
const AGGREGATES = new Set([
    "any_value",
    "array_agg",
    "avg",
    "bit_and",
    "bit_or",
    "bit_xor",
    "bool_and",
    "bool_or",
    "corr",
    "count",
    "covar_pop",
    "covar_samp",
    "cume_dist",
    "dense_rank",
    "every",
    "json_agg",
    "json_agg_strict",
    "json_arrayagg",
    "json_object_agg",
    "json_object_agg_strict",
    "json_object_agg_unique",
    "json_object_agg_unique_strict",
    "json_objectagg",
    "jsonb_agg",
    "jsonb_agg_strict",
    "jsonb_object_agg",
    "jsonb_object_agg_strict",
    "jsonb_object_agg_unique",
    "jsonb_object_agg_unique_strict",
    "max",
    "min",
    "mode",
    "percent_rank",
    "percentile_cont",
    "percentile_disc",
    "rank",
    "range_agg",
    "range_intersect_agg",
    "regr_avgx",
    "regr_avgy",
    "regr_count",
    "regr_intercept",
    "regr_r2",
    "regr_slope",
    "regr_sxx",
    "regr_sxy",
    "regr_syy",
    "stddev",
    "stddev_pop",
    "stddev_samp",
    "string_agg",
    "sum",
    "var_pop",
    "var_samp",
    "variance",
    "xmlagg",
]);

/**
 * Prove the deliberately bounded row and write lineage of a completed Project
 * SELECT. The result contains identities and revisions, never provider/write
 * handles; admission, capabilities and live row/field checks remain callers'
 * responsibility.
 */
export function analyzeProjectQueryProvenance(evidence: ProjectSelectEvidence): ProjectQueryProvenance {
    const dependencies = evidence.sources.map(relationIdentity);
    const base = {
        dependencies: { status: "proven" as const, relations: dependencies },
        queryId: evidence.queryId,
        queryRevision: evidence.queryRevision,
        executionGeneration: evidence.executionGeneration,
        catalogGeneration: evidence.catalogGeneration,
        catalogRevision: evidence.catalogRevision,
        fingerprint: evidenceFingerprint(evidence),
    };
    const refuse = (status: "unsupported" | "unknown", reason: string): ProjectQueryProvenance => ({
        ...base,
        status,
        reason,
        suppliers: [],
        branches: [],
    });

    let root: Node;
    try {
        const parsed = parseSync(evidence.query) as unknown;
        if (!isNode(parsed) || !Array.isArray(parsed.stmts) || parsed.stmts.length !== 1) {
            return refuse("unknown", "Query parse did not produce one statement");
        }
        const wrapper = parsed.stmts[0];
        const statement = isNode(wrapper) && isNode(wrapper.stmt) ? wrapper.stmt.SelectStmt : undefined;
        if (!isNode(statement)) return refuse("unsupported", "Only SELECT provenance is supported");
        root = statement;
    } catch (error) {
        return refuse("unknown", error instanceof Error ? error.message : "Query parsing failed");
    }

    const leaves: Node[] = [];
    if (containsWithClause(root)) {
        return refuse("unsupported", "CTE provenance is unsupported");
    }
    if (!collectUnionLeaves(root, leaves)) {
        return refuse("unsupported", "Only plain SELECT and UNION ALL provenance is supported");
    }
    const sourceByName = new Map(evidence.sources.map(source => [source.sqlName, source]));
    const shapes: BranchShape[] = [];
    for (const leaf of leaves) {
        const from = Array.isArray(leaf.fromClause) ? leaf.fromClause : [];
        if (from.length !== 1 || !isNode(from[0]) || !isNode(from[0].RangeVar)) {
            return refuse("unsupported", "A supplier branch must read exactly one plain relation");
        }
        if (unsupportedLeaf(leaf)) return refuse("unsupported", "The SELECT branch has unsupported row provenance");
        const range = from[0].RangeVar;
        if (isNode(range.alias) && Array.isArray(range.alias.colnames) && range.alias.colnames.length > 0) {
            return refuse("unsupported", "Relation column-alias provenance is unsupported");
        }
        const sqlName = typeof range.relname === "string" ? range.relname : undefined;
        const relation = sqlName === undefined ? undefined : sourceByName.get(sqlName);
        if (!relation) {
            return refuse("unknown", `Execution evidence has no current source identity for "${sqlName ?? "?"}"`);
        }
        const targets = Array.isArray(leaf.targetList)
            ? leaf.targetList.filter(isNode).map(target => target.ResTarget).filter(isNode)
            : [];
        if (targets.length === 0) return refuse("unknown", "The SELECT branch has no result targets");
        const alias = isNode(range.alias) && typeof range.alias.aliasname === "string"
            ? range.alias.aliasname
            : undefined;
        shapes.push({ relation, targets, alias });
    }

    const outputNames = evidence.columns.map(column => column.name);
    const duplicateNames = new Set(outputNames).size !== outputNames.length;
    const branches: ProvenanceBranch[] = shapes.map(shape => branchProvenance(shape, outputNames, duplicateNames));
    const suppliers = uniqueRelations(shapes.map(shape => relationIdentity(shape.relation)));
    const bareIdSource = branches.length === 1 && !duplicateNames
            && branches[0]!.columns.some(column => column.outputColumn === "id" && column.physicalColumn === "id")
        ? branches[0]!.source
        : undefined;
    return { ...base, status: "proven", suppliers, branches, bareIdSource };
}

/** Reject a proof after any execution/query/catalog/source/schema identity changes. */
export function isProjectQueryProvenanceCurrent(
    proof: ProjectQueryProvenance,
    evidence: ProjectSelectEvidence,
): boolean {
    return proof.fingerprint === evidenceFingerprint(evidence);
}

/**
 * Resolve a result column only when every branch which can produce the same
 * row identity agrees on its physical source column.
 *
 * A UNION can contain multiple occurrences of one source row. Since result
 * rows do not retain their branch index, a differing route cannot safely be
 * attributed to the occurrence selected by the user.
 */
export function unambiguousPhysicalColumn(
    proof: ProjectQueryProvenance,
    sourceKind: string,
    outputColumn: string,
): string | undefined {
    if (proof.status !== "proven") return undefined;
    const branches = proof.branches.length === 1
        ? proof.branches.filter(branch => branch.source.sqlName === sourceKind)
        : proof.branches.filter(branch =>
            branch.claimedSourceKind === sourceKind
            && branch.routedIdentity
            && branch.source.sqlName === sourceKind
        );
    if (branches.length === 0) return undefined;
    const routes = branches.map(branch =>
        branch.columns.find(column => column.outputColumn === outputColumn)?.physicalColumn
    );
    if (routes.some(route => route === undefined)) return undefined;
    const physicalColumns = new Set(routes);
    return physicalColumns.size === 1 ? routes[0] : undefined;
}

function branchProvenance(shape: BranchShape, outputNames: string[], duplicateNames: boolean): ProvenanceBranch {
    const source = relationIdentity(shape.relation);
    const columns: ProvenanceColumnWrite[] = [];
    const physicalColumns = new Set(shape.relation.columns);
    let outputIndex = 0;
    for (const target of shape.targets) {
        if (isSourceStar(target.val, shape.relation.sqlName, shape.alias)) {
            for (const physicalColumn of shape.relation.columns) {
                const outputColumn = outputNames[outputIndex++];
                if (outputColumn !== undefined && !duplicateNames) {
                    columns.push({ outputColumn, physicalColumn, source });
                }
            }
            continue;
        }
        const outputColumn = outputNames[outputIndex++];
        if (outputColumn === undefined || duplicateNames) continue;
        const physicalColumn = plainColumn(target.val, shape.relation.sqlName, shape.alias);
        if (physicalColumn && physicalColumns.has(physicalColumn)) {
            columns.push({ outputColumn, physicalColumn, source });
        }
    }
    const kindIndex = outputNames.indexOf("source_kind");
    const idIndex = outputNames.indexOf("source_id");
    const kind = kindIndex >= 0 ? stringConstant(targetAtOutputPosition(shape, kindIndex)?.val) : undefined;
    const id = idIndex >= 0
        ? plainColumn(targetAtOutputPosition(shape, idIndex)?.val, shape.relation.sqlName, shape.alias)
        : undefined;
    return {
        source,
        columns,
        routedIdentity: !duplicateNames && kind === shape.relation.sqlName && id === "id",
        claimedSourceKind: kind,
    };
}

function collectUnionLeaves(select: Node, leaves: Node[]): boolean {
    const op = select.op;
    if (op === "SETOP_NONE" || op === undefined) {
        leaves.push(select);
        return true;
    }
    if (op !== "SETOP_UNION" || select.all !== true || !isNode(select.larg) || !isNode(select.rarg)) return false;
    return collectUnionLeaves(select.larg, leaves) && collectUnionLeaves(select.rarg, leaves);
}

function containsWithClause(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsWithClause);
    if (!isNode(value)) return false;
    if (value.withClause !== undefined) return true;
    return Object.values(value).some(containsWithClause);
}

function unsupportedLeaf(select: Node): boolean {
    if (select.distinctClause || select.groupClause || select.havingClause || select.windowClause) return true;
    return containsAggregate(select.targetList);
}

function containsAggregate(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsAggregate);
    if (!isNode(value)) return false;
    if (isNode(value.FuncCall)) {
        const names = Array.isArray(value.FuncCall.funcname) ? value.FuncCall.funcname : [];
        const last = names.at(-1);
        if (
            isNode(last) && isNode(last.String) && typeof last.String.sval === "string"
            && AGGREGATES.has(last.String.sval)
        ) {
            return true;
        }
    }
    return Object.values(value).some(containsAggregate);
}

function plainColumn(value: unknown, relation: string, alias?: string): string | undefined {
    if (!isNode(value) || !isNode(value.ColumnRef) || !Array.isArray(value.ColumnRef.fields)) return undefined;
    const fields = value.ColumnRef.fields.map(stringValue);
    if (fields.some(field => field === undefined)) return undefined;
    if (fields.length === 1) return fields[0];
    if (fields.length === 2 && (fields[0] === relation || fields[0] === alias)) return fields[1];
    return undefined;
}

function isSourceStar(value: unknown, relation: string, alias?: string): boolean {
    if (!isNode(value) || !isNode(value.ColumnRef) || !Array.isArray(value.ColumnRef.fields)) return false;
    const fields = value.ColumnRef.fields;
    if (fields.length === 1) return isNode(fields[0]) && isNode(fields[0].A_Star);
    return fields.length === 2 && (stringValue(fields[0]) === relation || stringValue(fields[0]) === alias)
        && isNode(fields[1]) && isNode(fields[1].A_Star);
}

function targetAtOutputPosition(shape: BranchShape, position: number): Node | undefined {
    let outputIndex = 0;
    for (const target of shape.targets) {
        const width = isSourceStar(target.val, shape.relation.sqlName, shape.alias) ? shape.relation.columns.length : 1;
        if (position >= outputIndex && position < outputIndex + width) return width === 1 ? target : undefined;
        outputIndex += width;
    }
    return undefined;
}

function stringConstant(value: unknown): string | undefined {
    if (!isNode(value) || !isNode(value.A_Const) || !isNode(value.A_Const.sval)) return undefined;
    return typeof value.A_Const.sval.sval === "string" ? value.A_Const.sval.sval : undefined;
}

function stringValue(value: unknown): string | undefined {
    return isNode(value) && isNode(value.String) && typeof value.String.sval === "string"
        ? value.String.sval
        : undefined;
}

function relationIdentity(source: RelationEvidence): ProvenanceRelation {
    return { kind: source.kind, id: source.id, sqlName: source.sqlName, schemaRevision: source.schemaRevision };
}

function uniqueRelations(relations: ProvenanceRelation[]): ProvenanceRelation[] {
    const seen = new Set<string>();
    return relations.filter(relation =>
        !seen.has(`${relation.kind}:${relation.id}`) && !!seen.add(`${relation.kind}:${relation.id}`)
    );
}

function evidenceFingerprint(evidence: ProjectSelectEvidence): string {
    return JSON.stringify({
        queryId: evidence.queryId,
        queryRevision: evidence.queryRevision,
        query: evidence.query,
        executionGeneration: evidence.executionGeneration,
        catalogGeneration: evidence.catalogGeneration,
        catalogRevision: evidence.catalogRevision,
        columns: evidence.columns,
        sources: evidence.sources.map(source => ({
            kind: source.kind,
            id: source.id,
            sqlName: source.sqlName,
            schemaRevision: source.schemaRevision,
            columns: source.columns,
        })),
    });
}

function isNode(value: unknown): value is Node {
    return typeof value === "object" && value !== null;
}
