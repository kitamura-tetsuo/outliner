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
