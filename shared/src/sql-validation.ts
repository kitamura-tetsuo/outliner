export function validateRuleStatement(sql: string): string | undefined {
    if (!sql.trim()) return "Statement is required";
    const lower = sql.trim().toLowerCase();

    // Check if it is a mutating statement
    if (!lower.startsWith("insert") && !lower.startsWith("update") && !lower.startsWith("delete")) {
        return "Statement must be an INSERT, UPDATE, or DELETE";
    }

    return undefined; // Valid
}
