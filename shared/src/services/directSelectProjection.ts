import { loadModule, parseSync } from "libpg-query";

await loadModule();

type Node = Record<string, unknown>;
interface LeafProjection {
    columns: Array<string | undefined>;
    outputNames: Array<string | undefined>;
}

/** Prove unchanged output-to-source fields in a simple SELECT or every UNION ALL leaf. */
export function analyzeDirectSelectProjection(
    query: string,
    expandedStarColumns: readonly string[] = [],
): Map<string, string> {
    try {
        const parsed = parseSync(query) as unknown;
        if (!isNode(parsed) || !Array.isArray(parsed.stmts) || parsed.stmts.length !== 1) return new Map();
        const wrapper = parsed.stmts[0];
        const root = isNode(wrapper) && isNode(wrapper.stmt) ? wrapper.stmt.SelectStmt : undefined;
        if (!isNode(root) || containsWithClause(root)) return new Map();
        const leaves: Node[] = [];
        if (!collectUnionLeaves(root, leaves)) return new Map();
        const projections = leaves.map(leaf => leafProjection(leaf, expandedStarColumns));
        if (projections.some(projection => projection === undefined)) return new Map();
        const shapes = projections as LeafProjection[];
        const first = shapes[0];
        if (!first || shapes.some(shape => shape.columns.length !== first.columns.length)) return new Map();
        const candidates: Array<[string, string]> = [];
        for (let position = 0; position < first.columns.length; position++) {
            const outputName = first.outputNames[position];
            const physical = first.columns[position];
            if (outputName && physical && shapes.every(shape => shape.columns[position] === physical)) {
                candidates.push([outputName, physical]);
            }
        }
        const counts = new Map<string, number>();
        // Ambiguity is determined by the complete result shape, not merely by
        // the writable candidates. A calculated sibling with the same alias
        // must also suppress the otherwise-direct candidate.
        for (const output of first.outputNames) {
            if (output) counts.set(output, (counts.get(output) ?? 0) + 1);
        }
        return new Map(candidates.filter(([output]) => counts.get(output) === 1));
    } catch {
        return new Map();
    }
}

function leafProjection(select: Node, starColumns: readonly string[]): LeafProjection | undefined {
    if (select.distinctClause || select.groupClause || select.havingClause || select.windowClause) return undefined;
    const from = Array.isArray(select.fromClause) ? select.fromClause : [];
    if (from.length !== 1 || !isNode(from[0]) || !isNode(from[0].RangeVar)) return undefined;
    const range = from[0].RangeVar;
    if (range.schemaname !== undefined || !Array.isArray(select.targetList)) return undefined;
    if (isNode(range.alias) && Array.isArray(range.alias.colnames) && range.alias.colnames.length) return undefined;
    const relation = typeof range.relname === "string" ? range.relname : undefined;
    const alias = isNode(range.alias) && typeof range.alias.aliasname === "string" ? range.alias.aliasname : undefined;
    if (!relation) return undefined;
    const columns: Array<string | undefined> = [];
    const outputNames: Array<string | undefined> = [];
    for (const wrapped of select.targetList) {
        const target = isNode(wrapped) ? wrapped.ResTarget : undefined;
        if (!isNode(target)) return undefined;
        if (isSourceStar(target.val, relation, alias)) {
            for (const column of starColumns) {
                columns.push(column);
                outputNames.push(column);
            }
        } else {
            const column = plainColumn(target.val, relation, alias);
            columns.push(column);
            outputNames.push(typeof target.name === "string" ? target.name : column);
        }
    }
    return { columns, outputNames };
}

function collectUnionLeaves(select: Node, leaves: Node[]): boolean {
    if (select.op === undefined || select.op === "SETOP_NONE") {
        leaves.push(select);
        return true;
    }
    return select.op === "SETOP_UNION" && select.all === true && isNode(select.larg) && isNode(select.rarg)
        && collectUnionLeaves(select.larg, leaves) && collectUnionLeaves(select.rarg, leaves);
}
function plainColumn(value: unknown, relation: string, alias?: string): string | undefined {
    if (!isNode(value) || !isNode(value.ColumnRef) || !Array.isArray(value.ColumnRef.fields)) return undefined;
    const fields = value.ColumnRef.fields.map(stringValue);
    if (fields.some(field => field === undefined)) return undefined;
    if (fields.length === 1) return fields[0];
    return fields.length === 2 && (fields[0] === relation || fields[0] === alias) ? fields[1] : undefined;
}
function isSourceStar(value: unknown, relation: string, alias?: string): boolean {
    if (!isNode(value) || !isNode(value.ColumnRef) || !Array.isArray(value.ColumnRef.fields)) return false;
    const fields = value.ColumnRef.fields;
    if (fields.length === 1) return isNode(fields[0]) && isNode(fields[0].A_Star);
    return fields.length === 2 && (stringValue(fields[0]) === relation || stringValue(fields[0]) === alias)
        && isNode(fields[1]) && isNode(fields[1].A_Star);
}
function containsWithClause(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsWithClause);
    return isNode(value) && (value.withClause !== undefined || Object.values(value).some(containsWithClause));
}
function stringValue(value: unknown): string | undefined {
    return isNode(value) && isNode(value.String) && typeof value.String.sval === "string"
        ? value.String.sval
        : undefined;
}
function isNode(value: unknown): value is Node {
    return typeof value === "object" && value !== null;
}
