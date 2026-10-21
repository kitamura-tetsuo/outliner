import { loadModule, parseSync, scanSync, type ScanToken } from "libpg-query";
import { validateExplicitSelectAliases } from "./explicitSelectAlias.js";

await loadModule();
type AstNode = Record<string, unknown>;
const node = (value: unknown): AstNode | undefined =>
    typeof value === "object" && value !== null ? value as AstNode : undefined;

function singleStatement(sql: string): AstNode {
    const parsed = parseSync(sql);
    if (parsed.stmts?.length !== 1) throw new Error("Query must contain exactly one statement");
    const statement = node(parsed.stmts[0]?.stmt);
    if (!statement) throw new Error("Query must contain exactly one statement");
    return statement;
}

function decodedIdentifier(token: ScanToken): string {
    return token.text.startsWith('"') ? token.text.slice(1, -1).replace(/""/g, '"') : token.text.toLowerCase();
}

/** Scanner-recognized SQL words; this is candidate discovery, not resolved dependency evidence. */
export function parseSqlIdentifiers(sql: string): Set<string> {
    const identifiers = new Set<string>();
    for (const token of scanSync(sql).tokens) {
        if (token.tokenName === "IDENT" || token.keywordKind !== 0) identifiers.add(decodedIdentifier(token));
    }
    return identifiers;
}

/** Compatibility utility whose lexical boundaries are defined by PostgreSQL's scanner. */
export function stripSqlNoise(sql: string): string {
    return scanSync(sql).tokens.map(token =>
        ["SCONST", "USCONST", "BCONST", "XCONST"].includes(token.tokenName) ? "''" : token.text
    ).join(" ");
}

export interface InsertTarget {
    readonly name: string;
    readonly schema?: string;
}

/** Return the relation owned by the one outer INSERT statement. */
export function parseTopLevelInsertRelation(sql: string): InsertTarget | undefined {
    const insert = node(singleStatement(sql).InsertStmt);
    if (!insert) return undefined;
    const relation = node(insert.relation);
    if (!relation || typeof relation.relname !== "string") return undefined;
    return {
        name: relation.relname,
        schema: typeof relation.schemaname === "string" ? relation.schemaname : undefined,
    };
}

export function parseTopLevelInsertTarget(sql: string): string | undefined {
    try {
        const relation = parseTopLevelInsertRelation(sql);
        return relation && relation.schema === undefined ? relation.name : undefined;
    } catch {
        return undefined;
    }
}

function validateSelectBody(select: AstNode): void {
    if (select.intoClause) throw new Error("SELECT INTO is not allowed");
    if (Array.isArray(select.lockingClause) && select.lockingClause.length) {
        throw new Error("Row-locking SELECT queries are not allowed");
    }
    // Set-operation operands are bare SelectStmt bodies rather than tagged
    // `{ SelectStmt: ... }` nodes, so validate them explicitly.
    const left = node(select.larg);
    const right = node(select.rarg);
    if (left) validateSelectBody(left);
    if (right) validateSelectBody(right);
}

function validateSelectTree(value: unknown): void {
    if (Array.isArray(value)) return void value.forEach(validateSelectTree);
    const wrapper = node(value);
    if (!wrapper) return;
    if (wrapper.InsertStmt || wrapper.UpdateStmt || wrapper.DeleteStmt || wrapper.MergeStmt) {
        throw new Error("Only read-only SELECT queries are allowed");
    }
    const select = node(wrapper.SelectStmt);
    if (select) validateSelectBody(select);
    Object.values(wrapper).forEach(validateSelectTree);
}

export interface ReadOnlySelectShape {
    readonly sql: string;
    readonly hasOuterWhere: boolean;
    readonly hasOuterOrderBy: boolean;
}

/** Validate and describe the outer SELECT without accumulating nested clauses. */
export function analyzeReadOnlySelect(sql: string, requireExplicitAliases = true): ReadOnlySelectShape {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) throw new Error("Query is empty");
    const statement = singleStatement(trimmed);
    const select = node(statement.SelectStmt);
    if (!select) throw new Error("Only SELECT queries are allowed");
    validateSelectTree(statement);
    if (requireExplicitAliases) validateExplicitSelectAliases(trimmed);
    return {
        sql: trimmed,
        hasOuterWhere: select.whereClause !== undefined,
        hasOuterOrderBy: Array.isArray(select.sortClause) && select.sortClause.length > 0,
    };
}

export function validateReadOnlySelect(sql: string, requireExplicitAliases = true): string {
    return analyzeReadOnlySelect(sql, requireExplicitAliases).sql;
}
