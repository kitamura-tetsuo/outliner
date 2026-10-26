import { loadModule, parseSync } from "libpg-query";

await loadModule();

function node(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function selectExpression(expression: string): unknown {
    const parsed = parseSync(`SELECT ${expression}`) as { stmts?: { stmt?: Record<string, unknown>; }[]; };
    if (parsed.stmts?.length !== 1) return undefined;
    const select = node(parsed.stmts[0]?.stmt?.SelectStmt);
    const targets = select?.targetList;
    if (!select || !Array.isArray(targets) || targets.length !== 1 || select.fromClause || select.whereClause) {
        return undefined;
    }
    return node(node(targets[0])?.ResTarget)?.val;
}

/** Parse PostgreSQL's canonical CHECK (field IN (...)) expression. */
export function extractCheckInOptions(
    expression: string,
): { column: string; options: string[]; } | undefined {
    try {
        const expr = node(node(selectExpression(expression))?.A_Expr);
        const names = expr?.name;
        if (
            (expr?.kind !== "AEXPR_OP_ANY" && expr?.kind !== "AEXPR_OP")
            || !Array.isArray(names) || names.length !== 1
            || node(node(names[0])?.String)?.sval !== "="
        ) return undefined;
        const fields = node(node(expr.lexpr)?.ColumnRef)?.fields;
        if (!Array.isArray(fields) || fields.length !== 1) return undefined;
        const column = node(node(fields[0])?.String)?.sval;
        if (typeof column !== "string") return undefined;
        const elements = expr.kind === "AEXPR_OP"
            ? [expr.rexpr]
            : node(node(expr.rexpr)?.A_ArrayExpr)?.elements;
        if (!Array.isArray(elements) || elements.length === 0) return undefined;
        const options: string[] = [];
        for (const element of elements) {
            const cast = node(node(element)?.TypeCast);
            const typeNames = node(cast?.typeName)?.names;
            const lastTypeName = Array.isArray(typeNames)
                ? node(node(typeNames[typeNames.length - 1])?.String)?.sval
                : undefined;
            const constant = node(node(cast?.arg)?.A_Const);
            const value = node(constant?.sval)?.sval;
            if (!constant || constant.isnull || lastTypeName !== "text" || typeof value !== "string") {
                return undefined;
            }
            options.push(value);
        }
        return { column, options };
    } catch {
        return undefined;
    }
}
