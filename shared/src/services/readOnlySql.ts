/** Remove comments and quoted values before inspecting SQL control words. */
export function stripSqlNoise(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
}

/** SQL identifiers, excluding comments and string literals. */
export function parseSqlIdentifiers(sql: string): Set<string> {
    const withoutNoise = sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/'(?:[^']|'')*'/g, "''");
    const identifiers = new Set<string>();
    const regex = /"((?:[^"]|"")+)"|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(withoutNoise))) {
        identifiers.add(match[1]?.replace(/""/g, '"') ?? match[2]!.toLowerCase());
    }
    return identifiers;
}

/** Return the destination of the top-level INSERT, including WITH-prefixed statements. */
export function parseTopLevelInsertTarget(sql: string): string | undefined {
    let depth = 0;
    let quote: "'" | '"' | undefined;
    for (let index = 0; index < sql.length;) {
        const current = sql[index]!;
        const next = sql[index + 1];
        if (quote) {
            if (current === quote && next === quote) {
                index += 2;
                continue;
            }
            if (current === quote) quote = undefined;
            index++;
            continue;
        }
        if (current === "-" && next === "-") {
            index = sql.indexOf("\n", index + 2);
            if (index < 0) return undefined;
            continue;
        }
        if (current === "/" && next === "*") {
            const end = sql.indexOf("*/", index + 2);
            if (end < 0) return undefined;
            index = end + 2;
            continue;
        }
        if (current === "'" || current === '"') {
            quote = current;
            index++;
            continue;
        }
        if (current === "(") depth++;
        else if (current === ")") depth--;
        else if (depth === 0 && /[A-Za-z_]/.test(current)) {
            const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(index))![0];
            if (word.toLowerCase() === "insert") {
                const target = /^\s+into\s+(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_]*))/i.exec(
                    sql.slice(index + word.length),
                );
                return target?.[1]?.replace(/""/g, '"') ?? target?.[2]?.toLowerCase();
            }
            index += word.length;
            continue;
        }
        index++;
    }
    return undefined;
}

/** Validate the single, read-only SELECT contract shared by views and MCP. */
export function validateReadOnlySelect(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) throw new Error("Query is empty");
    const stripped = stripSqlNoise(trimmed);
    if (!/^\s*(select|with)\b/i.test(stripped)) throw new Error("Only SELECT queries are allowed");
    if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(stripped)) {
        throw new Error("Only read-only SELECT queries are allowed");
    }
    if (stripped.replace(/;\s*$/, "").includes(";")) throw new Error("Query must contain exactly one statement");
    return trimmed;
}
