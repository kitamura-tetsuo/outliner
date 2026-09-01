import { loadModule, parseSync, scanSync, type ScanToken } from "libpg-query";

// Initialize once at module evaluation so every validation boundary can remain
// synchronous and can reject before mutating authoritative Yjs state.
await loadModule();

export const EXPLICIT_SELECT_ALIAS_POLICY_VERSION = 1;
export const IMPLICIT_SELECT_ALIAS_ERROR = "SELECT output aliases must use explicit AS";

type AstNode = Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
    return typeof value === "object" && value !== null;
}

function tokenDepths(tokens: ScanToken[]): number[] {
    let depth = 0;
    return tokens.map(token => {
        const before = depth;
        if (token.text === "(" || token.text === "[") depth++;
        else if (token.text === ")" || token.text === "]") depth--;
        return before;
    });
}

const TARGET_TERMINATORS = new Set([
    "FROM",
    "INTO",
    "WHERE",
    "GROUP",
    "HAVING",
    "WINDOW",
    "ORDER",
    "LIMIT",
    "OFFSET",
    "FETCH",
    "FOR",
    "UNION",
    "INTERSECT",
    "EXCEPT",
]);

/**
 * Enforce concrete `AS` syntax for every alias-bearing SELECT result target.
 * PostgreSQL's AST identifies real output aliases while its scanner proves
 * that the token immediately before the alias was the AS keyword.
 */
export function validateExplicitSelectAliases(sql: string): void {
    const ast = parseSync(sql) as unknown;
    const tokens = scanSync(sql).tokens.filter(token => !token.tokenName.endsWith("COMMENT"));
    const depths = tokenDepths(tokens);

    const inspectSelect = (select: AstNode): void => {
        const targets = Array.isArray(select.targetList) ? select.targetList : [];
        for (const wrapper of targets) {
            if (!isNode(wrapper) || !isNode(wrapper.ResTarget)) continue;
            const target = wrapper.ResTarget;
            if (typeof target.name !== "string" || typeof target.location !== "number") continue;

            const first = tokens.findIndex(token => token.start >= (target.location as number));
            if (first < 0) throw new Error(IMPLICIT_SELECT_ALIAS_ERROR);
            const depth = depths[first];
            let end = tokens.length;
            for (let index = first + 1; index < tokens.length; index++) {
                if (depths[index] !== depth) continue;
                const token = tokens[index]!;
                if (
                    token.text === "," || TARGET_TERMINATORS.has(token.text.toUpperCase()) || token.text === ")"
                    || token.text === ";"
                ) {
                    end = index;
                    break;
                }
            }
            const aliasIndex = end - 1;
            if (aliasIndex <= first || tokens[aliasIndex - 1]?.text.toUpperCase() !== "AS") {
                throw new Error(IMPLICIT_SELECT_ALIAS_ERROR);
            }
        }
    };

    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isNode(value)) return;
        if (isNode(value.SelectStmt)) inspectSelect(value.SelectStmt);
        Object.values(value).forEach(walk);
    };
    walk(ast);
}
