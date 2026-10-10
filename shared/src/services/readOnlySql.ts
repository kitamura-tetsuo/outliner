/**
 * Single-pass SQL noise scan shared by the helpers below. Line comments run
 * to the newline, string/identifier quotes honor their doubled escapes, and
 * block comments nest the way PostgreSQL parses them (`/* outer /* inner *\/`
 * stays a comment through the second terminator). A regex-only strip stops
 * at the inner terminator and leaks trailing comment text — such as a comma
 * joining a second FROM source — back into the inspected SQL (issue #5547).
 * Comment markers inside quotes never open a comment, and quotes inside a
 * comment never open a quoted value. An unterminated opener is left in place,
 * matching the previous behavior for SQL the engine itself would reject.
 */
function scanSqlNoise(sql: string, keepDoubleQuoted: boolean): string {
    let out = "";
    let index = 0;
    while (index < sql.length) {
        const char = sql[index]!;
        const next = sql[index + 1];
        if (char === "-" && next === "-") {
            // PostgreSQL ends a `--` line comment at a newline, where CR
            // counts: `-- c\r, b` hides nothing from the engine (issue #5547).
            const lf = sql.indexOf("\n", index + 2);
            const cr = sql.indexOf("\r", index + 2);
            const end = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
            out += " ";
            index = end < 0 ? sql.length : end;
            continue;
        }
        if (char === "/" && next === "*") {
            let depth = 1;
            let cursor = index + 2;
            let closed = false;
            while (cursor < sql.length) {
                if (sql[cursor] === "/" && sql[cursor + 1] === "*") {
                    depth++;
                    cursor += 2;
                } else if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
                    depth--;
                    cursor += 2;
                    if (depth === 0) {
                        closed = true;
                        break;
                    }
                } else {
                    cursor++;
                }
            }
            if (!closed) {
                out += sql.slice(index);
                index = sql.length;
            } else {
                out += " ";
                index = cursor;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            let cursor = index + 1;
            let closed = false;
            while (cursor < sql.length) {
                if (sql[cursor] === char) {
                    if (sql[cursor + 1] === char) {
                        cursor += 2;
                    } else {
                        closed = true;
                        cursor++;
                        break;
                    }
                } else {
                    cursor++;
                }
            }
            if (!closed) {
                out += sql.slice(index);
                index = sql.length;
            } else if (keepDoubleQuoted && char === '"') {
                out += sql.slice(index, cursor);
                index = cursor;
            } else {
                out += char === "'" ? "''" : '""';
                index = cursor;
            }
            continue;
        }
        out += char;
        index++;
    }
    return out;
}

/** Remove comments and quoted values before inspecting SQL control words. */
export function stripSqlNoise(sql: string): string {
    return scanSqlNoise(sql, false);
}

/** SQL identifiers, excluding comments and string literals. */
export function parseSqlIdentifiers(sql: string): Set<string> {
    const withoutNoise = scanSqlNoise(sql, true);
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
            const lf = sql.indexOf("\n", index + 2);
            const cr = sql.indexOf("\r", index + 2);
            index = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
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
export function validateReadOnlySelect(sql: string, requireExplicitAliases = true): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) throw new Error("Query is empty");
    const stripped = stripSqlNoise(trimmed);
    if (!/^\s*(select|with)\b/i.test(stripped)) throw new Error("Only SELECT queries are allowed");
    if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(stripped)) {
        throw new Error("Only read-only SELECT queries are allowed");
    }
    if (stripped.replace(/;\s*$/, "").includes(";")) throw new Error("Query must contain exactly one statement");
    if (requireExplicitAliases) validateExplicitSelectAliases(trimmed);
    return trimmed;
}
import { validateExplicitSelectAliases } from "./explicitSelectAlias.js";
