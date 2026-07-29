// Shallow, textual analysis of a calendar query's SELECT list: which output
// columns are a bare passthrough of an underlying relation column (so have a
// writable origin), and which are calculated expressions.
//
// A calendar has no schema of its own (calendarEditability.ts), so it cannot
// reuse queryAnalysis.ts's `analyzeQueryEditability`, which validates a
// column against a table's applied schema. This performs the equivalent
// alias -> writable-origin resolution directly against the query text, in
// the same deliberately shallow spirit as the range-injection warning
// (docs/crdt-sql-architecture.md §6.4): a false negative (an expression this
// fails to recognize as bare) costs treating a genuinely writable column as
// read-only, which is the safe direction to err — never the reverse.
//
// The resolved value is not the output alias but the *underlying* column
// name (e.g. `t.start_at AS begins_at` resolves alias `begins_at` to column
// `start_at`), because a write addresses the source relation's own column,
// never the calendar query's alias (relationRowWrite.ts).

/** A bare, optionally table-qualified column reference — no operators, no calls. */
const BARE_COLUMN_RE = /^"?[A-Za-z_][\w$]*"?(?:\."?[A-Za-z_][\w$]*"?)?$/;
const IDENT_RE = /^"?[A-Za-z_][\w$]*"?$/;

function stripQuotes(ident: string): string {
    return ident.replace(/^"(.*)"$/, "$1");
}

function bareColumnName(expr: string): string | undefined {
    const trimmed = expr.trim();
    if (!BARE_COLUMN_RE.test(trimmed)) return undefined;
    const parts = trimmed.split(".");
    return stripQuotes(parts[parts.length - 1]);
}

/** Split a SELECT list on top-level commas, ignoring parens and quoted strings. */
function splitTopLevel(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (inSingle) {
            if (c === "'") inSingle = false;
            continue;
        }
        if (inDouble) {
            if (c === '"') inDouble = false;
            continue;
        }
        if (c === "'") {
            inSingle = true;
            continue;
        }
        if (c === '"') {
            inDouble = true;
            continue;
        }
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === "," && depth === 0) {
            parts.push(list.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(list.slice(start));
    return parts;
}

/**
 * Extract the top-level SELECT list text of a single-statement query.
 * Deliberately naive: only the outermost `select ... from` is located, via
 * the first top-level `from` keyword. A query this cannot parse (a bare
 * subquery with no top-level FROM, say) yields no writable columns, which is
 * the safe direction.
 */
function extractSelectList(query: string): string | undefined {
    const trimmed = query.trim();
    const selectMatch = /^\s*select\s+(?:distinct\s+)?/i.exec(trimmed);
    if (!selectMatch) return undefined;
    const afterSelect = trimmed.slice(selectMatch[0].length);

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < afterSelect.length; i++) {
        const c = afterSelect[i];
        if (inSingle) {
            if (c === "'") inSingle = false;
            continue;
        }
        if (inDouble) {
            if (c === '"') inDouble = false;
            continue;
        }
        if (c === "'") {
            inSingle = true;
            continue;
        }
        if (c === '"') {
            inDouble = true;
            continue;
        }
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (depth === 0 && /\s/.test(c) && /^from\b/i.test(afterSelect.slice(i + 1))) {
            return afterSelect.slice(0, i);
        }
    }
    return undefined;
}

/**
 * Map each output alias of a calendar query's SELECT list to the underlying
 * bare column name it passes through, for every select item that is a bare
 * (optionally aliased) column reference. Calculated expressions — function
 * calls, `CASE`, casts, literals, operators — are simply absent from the map.
 */
export function analyzeCalendarColumnWritability(query: string): Map<string, string> {
    const writable = new Map<string, string>();
    const list = extractSelectList(query);
    if (!list) return writable;

    for (const rawItem of splitTopLevel(list)) {
        const item = rawItem.trim();
        if (!item || item === "*") continue;

        const asMatch = /^([\s\S]+?)\s+as\s+("?[A-Za-z_][\w$]*"?)\s*$/i.exec(item);
        if (asMatch) {
            const column = bareColumnName(asMatch[1]);
            if (column) writable.set(stripQuotes(asMatch[2]), column);
            continue;
        }

        // No `AS`: either a bare (possibly qualified) column with an implicit
        // alias equal to its own name, or `<expr> <alias>` (space-separated,
        // no AS keyword) — Postgres accepts both. Only the former has a
        // writable origin.
        const implicitAliasMatch = /^([\s\S]+?)\s+("?[A-Za-z_][\w$]*"?)\s*$/.exec(item);
        if (implicitAliasMatch && !IDENT_RE.test(item) && bareColumnName(implicitAliasMatch[1])) {
            const column = bareColumnName(implicitAliasMatch[1])!;
            writable.set(stripQuotes(implicitAliasMatch[2]), column);
            continue;
        }

        const column = bareColumnName(item);
        if (column) writable.set(column, column);
    }

    return writable;
}
