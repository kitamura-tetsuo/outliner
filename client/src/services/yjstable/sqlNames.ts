// SQL identifier rules for the table feature.
//
// A table has exactly two names and both are visible to the user:
//   - the display name (registry `name`): free text, used by the sidebar and
//     the /tables/... route, never appears in SQL;
//   - the SQL name: the identifier of the `CREATE TABLE` statement itself.
//     It is the only name queries use, it is unique inside a project, and it
//     is changed by editing the schema — a deliberate migration, not a rename
//     in a text field.
//
// There is no alias/view layer in between: what the user writes in `FROM` is
// the relation Postgres actually resolves, so engine error messages name the
// same identifier the user typed.

/** Identifiers accepted without quoting by Postgres, lower case only. */
export const SQL_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

const MAX_SQL_NAME_LENGTH = 63; // Postgres NAMEDATALEN - 1

/**
 * Reserved words that cannot start an unquoted `CREATE TABLE` name. Postgres
 * is the real authority (the statement is validated against the engine before
 * it is applied); this list only keeps `deriveSqlName` from *generating* a
 * name that is guaranteed to fail.
 */
const RESERVED_WORDS = new Set([
    "all",
    "analyse",
    "analyze",
    "and",
    "any",
    "array",
    "as",
    "asc",
    "asymmetric",
    "authorization",
    "binary",
    "both",
    "case",
    "cast",
    "check",
    "collate",
    "collation",
    "column",
    "concurrently",
    "constraint",
    "create",
    "cross",
    "current_catalog",
    "current_date",
    "current_role",
    "current_schema",
    "current_time",
    "current_timestamp",
    "current_user",
    "default",
    "deferrable",
    "desc",
    "distinct",
    "do",
    "else",
    "end",
    "except",
    "false",
    "fetch",
    "for",
    "foreign",
    "freeze",
    "from",
    "full",
    "grant",
    "group",
    "having",
    "ilike",
    "in",
    "initially",
    "inner",
    "intersect",
    "into",
    "is",
    "isnull",
    "join",
    "lateral",
    "leading",
    "left",
    "like",
    "limit",
    "localtime",
    "localtimestamp",
    "natural",
    "not",
    "notnull",
    "null",
    "offset",
    "on",
    "only",
    "or",
    "order",
    "outer",
    "overlaps",
    "placing",
    "primary",
    "references",
    "returning",
    "right",
    "select",
    "session_user",
    "similar",
    "some",
    "symmetric",
    "table",
    "tablesample",
    "then",
    "to",
    "trailing",
    "true",
    "union",
    "unique",
    "user",
    "using",
    "variadic",
    "verbose",
    "when",
    "where",
    "window",
    "with",
]);

/**
 * Names owned by system-defined relations. No user authors their
 * `CREATE TABLE`, so a user table must never be able to claim one — the
 * projection would otherwise be shadowed by a table of the same name and a
 * calendar query would silently read the wrong rows.
 */
export const RESERVED_RELATION_NAMES = new Set(["outline_items"]);

/**
 * Message when `name` belongs to a system-defined relation, undefined when it
 * is free. Checked on every schema apply, not only in the creation dialog:
 * the SQL name comes from the `CREATE TABLE` statement, which the user may
 * edit at any time.
 */
export function reservedRelationNameError(name: string): string | undefined {
    if (!RESERVED_RELATION_NAMES.has(name)) return undefined;
    return `Table name "${name}" is reserved: it is the system relation that projects `
        + "outline items into SQL. Choose a different name.";
}

/** Double-quote an identifier for safe interpolation into SQL. */
export function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export function isValidSqlName(name: string): boolean {
    return sqlNameError(name) === undefined;
}

/**
 * Validate a SQL name for the creation dialog. Returns a message describing
 * the first problem, or undefined when the name is usable.
 */
export function sqlNameError(name: string): string | undefined {
    if (!name) return "SQL name is required";
    if (name.length > MAX_SQL_NAME_LENGTH) {
        return `SQL name must be at most ${MAX_SQL_NAME_LENGTH} characters`;
    }
    if (!SQL_NAME_PATTERN.test(name)) {
        return "SQL name must be lower case and contain only letters, digits and underscores, "
            + "and must not start with a digit";
    }
    if (RESERVED_WORDS.has(name)) return `"${name}" is a reserved SQL word`;
    return reservedRelationNameError(name);
}

/**
 * Build a usable SQL name from a display name, avoiding the names already
 * taken inside the project. Display names that carry no ASCII letters or
 * digits at all (a purely Japanese title, for example) fall back to `table`,
 * which the numeric suffix then makes unique.
 */
export function deriveSqlName(displayName: string, taken: Iterable<string> = []): string {
    const used = new Set(taken);
    let base = (displayName ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    // "table" would be the obvious fallback but it is a reserved word.
    if (!base || /^[0-9]/.test(base)) base = base ? `t_${base}` : "data";
    base = base.slice(0, MAX_SQL_NAME_LENGTH - 4);
    if (RESERVED_WORDS.has(base) || RESERVED_RELATION_NAMES.has(base)) base = `${base}_table`;

    if (!used.has(base)) return base;
    for (let i = 2;; i++) {
        const candidate = `${base}_${i}`;
        if (!used.has(candidate)) return candidate;
    }
}

/**
 * Postgres schema holding every table of one project. Tables of the same
 * project share it, which is what makes `FROM a JOIN b` resolve without any
 * qualification; tables of different projects can never collide.
 */
export function projectSchemaName(projectId: string | undefined): string {
    if (!projectId) return "yjs_tables_local";
    const sanitized = projectId.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 48);
    return `p_${sanitized}`;
}
