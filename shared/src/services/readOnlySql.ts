/** Remove comments and quoted values before inspecting SQL control words. */
export function stripSqlNoise(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
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
