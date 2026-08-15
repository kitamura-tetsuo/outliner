import { RESERVED_RELATION_NAMES } from "./sqlNames";

export class TableSqlRewriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TableSqlRewriteError";
    }
}

export interface TableSqlRewriteResult {
    sql: string;
    /** Non-system relations actually read by FROM/JOIN or projected as source_kind. */
    relationDependencies: string[];
    /** System-defined relations that intentionally rebind to the destination project. */
    reservedRelationDependencies: string[];
}

type TokenKind = "word" | "quotedIdentifier" | "string" | "dollarString" | "space" | "comment" | "symbol";

interface Token {
    kind: TokenKind;
    text: string;
    start: number;
    end: number;
    value?: string;
}

interface CteScope {
    start: number;
    end: number;
    names: Set<string>;
}

interface QualifierScope {
    name: string;
    start: number;
    end: number;
    destination?: string;
}

const RELATION_FOLLOW_KEYWORDS = new Set([
    "where",
    "join",
    "left",
    "right",
    "full",
    "inner",
    "outer",
    "cross",
    "natural",
    "on",
    "using",
    "group",
    "having",
    "order",
    "limit",
    "offset",
    "fetch",
    "union",
    "intersect",
    "except",
    "returning",
    "window",
    "for",
    "tablesample",
]);

/**
 * Words that open a query inside parentheses. A data-modifying CTE
 * (`WITH x AS (INSERT … RETURNING *)`) is a query too: treating it as a scalar
 * expression would hide its FROM clause from the relation scanner.
 */
const QUERY_HEAD_KEYWORDS = new Set(["select", "with", "values", "insert", "update", "delete"]);

/**
 * Words that make a following UPDATE a locking clause or a conflict action
 * (`FOR UPDATE`, `FOR NO KEY UPDATE`, `DO UPDATE`) rather than the head of an
 * UPDATE statement, so no relation name follows.
 */
const NON_STATEMENT_UPDATE_PREDECESSORS = new Set(["for", "no", "key", "do"]);

const FROM_TERMINATORS = new Set([
    "where",
    "group",
    "having",
    "order",
    "limit",
    "offset",
    "fetch",
    "union",
    "intersect",
    "except",
    "returning",
    "window",
    "for",
]);

function fail(message: string): never {
    throw new TableSqlRewriteError(message);
}

function tokenize(sql: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    const push = (kind: TokenKind, start: number, end: number, value?: string) => {
        tokens.push({ kind, text: sql.slice(start, end), start, end, value });
        index = end;
    };

    while (index < sql.length) {
        const start = index;
        const char = sql[index];

        if (/\s/.test(char)) {
            index++;
            while (index < sql.length && /\s/.test(sql[index])) index++;
            push("space", start, index);
            continue;
        }
        if (sql.startsWith("--", index)) {
            const newline = sql.indexOf("\n", index + 2);
            push("comment", start, newline === -1 ? sql.length : newline);
            continue;
        }
        if (sql.startsWith("/*", index)) {
            let depth = 1;
            index += 2;
            while (index < sql.length && depth > 0) {
                if (sql.startsWith("/*", index)) {
                    depth++;
                    index += 2;
                } else if (sql.startsWith("*/", index)) {
                    depth--;
                    index += 2;
                } else index++;
            }
            if (depth !== 0) fail("Unterminated SQL block comment");
            push("comment", start, index);
            continue;
        }
        if (char === "'") {
            index++;
            let value = "";
            let closed = false;
            while (index < sql.length) {
                if (sql[index] === "'") {
                    if (sql[index + 1] === "'") {
                        value += "'";
                        index += 2;
                        continue;
                    }
                    index++;
                    closed = true;
                    break;
                }
                value += sql[index++];
            }
            if (!closed) fail("Unterminated SQL string literal");
            push("string", start, index, value);
            continue;
        }
        if (char === '"') {
            index++;
            let value = "";
            let closed = false;
            while (index < sql.length) {
                if (sql[index] === '"') {
                    if (sql[index + 1] === '"') {
                        value += '"';
                        index += 2;
                        continue;
                    }
                    index++;
                    closed = true;
                    break;
                }
                value += sql[index++];
            }
            if (!closed) fail("Unterminated quoted SQL identifier");
            push("quotedIdentifier", start, index, value);
            continue;
        }
        if (char === "$") {
            const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
            if (delimiter) {
                const contentStart = index + delimiter.length;
                const close = sql.indexOf(delimiter, contentStart);
                if (close === -1) fail("Unterminated dollar-quoted SQL string");
                push("dollarString", start, close + delimiter.length, sql.slice(contentStart, close));
                continue;
            }
        }
        if (/[A-Za-z_]/.test(char)) {
            index++;
            while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index])) index++;
            push("word", start, index, sql.slice(start, index).toLowerCase());
            continue;
        }

        push("symbol", start, start + 1, char);
    }
    return tokens;
}

function isTrivia(token: Token): boolean {
    return token.kind === "space" || token.kind === "comment";
}

function nextSignificant(tokens: Token[], index: number): number | undefined {
    for (let i = index + 1; i < tokens.length; i++) {
        if (!isTrivia(tokens[i])) return i;
    }
    return undefined;
}

function previousSignificant(tokens: Token[], index: number): number | undefined {
    for (let i = index - 1; i >= 0; i--) {
        if (!isTrivia(tokens[i])) return i;
    }
    return undefined;
}

function word(token: Token | undefined, expected?: string): boolean {
    if (token?.kind !== "word") return false;
    return expected === undefined || token.value === expected;
}

function identifierValue(token: Token | undefined): string | undefined {
    if (token?.kind === "word" || token?.kind === "quotedIdentifier") return token.value;
    return undefined;
}

function replacementIdentifier(token: Token, destination: string): string {
    return token.kind === "quotedIdentifier" ? `"${destination.replaceAll('"', '""')}"` : destination;
}

function replacementString(destination: string): string {
    return `'${destination.replaceAll("'", "''")}'`;
}

function relationAlias(tokens: Token[], relationIndex: number): string | undefined {
    let cursor = nextSignificant(tokens, relationIndex);
    if (cursor === undefined) return undefined;
    if (word(tokens[cursor], "as")) cursor = nextSignificant(tokens, cursor) ?? -1;
    if (cursor < 0) return undefined;
    const alias = identifierValue(tokens[cursor]);
    if (alias === undefined) return undefined;
    if (tokens[cursor].kind === "word" && RELATION_FOLLOW_KEYWORDS.has(alias)) return undefined;
    return alias;
}

function sourceKindAlias(tokens: Token[], literalIndex: number): number | undefined {
    let cursor = nextSignificant(tokens, literalIndex);
    if (cursor !== undefined && tokens[cursor].kind === "symbol" && tokens[cursor].value === ":") {
        const secondColon = nextSignificant(tokens, cursor);
        const castType = secondColon === undefined ? undefined : nextSignificant(tokens, secondColon);
        if (
            secondColon === undefined || tokens[secondColon].kind !== "symbol" || tokens[secondColon].value !== ":"
            || castType === undefined || identifierValue(tokens[castType]) === undefined
        ) {
            return undefined;
        }
        cursor = nextSignificant(tokens, castType);
    }
    if (cursor !== undefined && word(tokens[cursor], "as")) cursor = nextSignificant(tokens, cursor);
    return cursor !== undefined && identifierValue(tokens[cursor]) === "source_kind" ? cursor : undefined;
}

function parenMetadata(tokens: Token[]): {
    matchingClose: Map<number, number>;
    enclosingOpen: Array<number | undefined>;
    enclosingClose: Array<number | undefined>;
} {
    const stack: number[] = [];
    const matchingClose = new Map<number, number>();
    const enclosingOpen: Array<number | undefined> = new Array(tokens.length);
    const enclosingClose: Array<number | undefined> = new Array(tokens.length);
    for (let i = 0; i < tokens.length; i++) {
        enclosingOpen[i] = stack.length > 0 ? stack[stack.length - 1] : undefined;
        enclosingClose[i] = enclosingOpen[i];
        if (tokens[i].kind !== "symbol") continue;
        if (tokens[i].value === "(") stack.push(i);
        else if (tokens[i].value === ")") {
            const open = stack.pop();
            if (open === undefined) fail("Unbalanced SQL parentheses");
            matchingClose.set(open, i);
        }
    }
    if (stack.length > 0) fail("Unbalanced SQL parentheses");

    const openToClose = matchingClose;
    for (let i = 0; i < tokens.length; i++) {
        const open = enclosingClose[i];
        enclosingClose[i] = open === undefined ? undefined : openToClose.get(open);
    }
    return { matchingClose, enclosingOpen, enclosingClose };
}

function collectCteScopes(
    tokens: Token[],
    matchingClose: Map<number, number>,
    enclosingClose: Array<number | undefined>,
): CteScope[] {
    const scopes: CteScope[] = [];
    for (let i = 0; i < tokens.length; i++) {
        if (!word(tokens[i], "with")) continue;
        let cursor = nextSignificant(tokens, i);
        if (cursor !== undefined && word(tokens[cursor], "recursive")) cursor = nextSignificant(tokens, cursor);
        if (cursor === undefined || identifierValue(tokens[cursor]) === undefined) continue;

        const names = new Set<string>();
        while (cursor !== undefined) {
            const name = identifierValue(tokens[cursor]);
            if (name === undefined) break;
            names.add(name);
            cursor = nextSignificant(tokens, cursor);

            if (cursor !== undefined && tokens[cursor].kind === "symbol" && tokens[cursor].value === "(") {
                const close = matchingClose.get(cursor);
                if (close === undefined) fail("Unbalanced CTE column list");
                cursor = nextSignificant(tokens, close);
            }
            if (cursor === undefined || !word(tokens[cursor], "as")) break;
            cursor = nextSignificant(tokens, cursor);
            if (cursor !== undefined && word(tokens[cursor], "not")) {
                const materialized = nextSignificant(tokens, cursor);
                if (materialized === undefined || !word(tokens[materialized], "materialized")) break;
                cursor = nextSignificant(tokens, materialized);
            } else if (cursor !== undefined && word(tokens[cursor], "materialized")) {
                cursor = nextSignificant(tokens, cursor);
            }
            if (cursor === undefined || tokens[cursor].kind !== "symbol" || tokens[cursor].value !== "(") break;
            const close = matchingClose.get(cursor);
            if (close === undefined) fail("Unbalanced CTE query");
            cursor = nextSignificant(tokens, close);
            if (cursor === undefined || tokens[cursor].kind !== "symbol" || tokens[cursor].value !== ",") break;
            cursor = nextSignificant(tokens, cursor);
        }
        if (names.size > 0) scopes.push({ start: i, end: enclosingClose[i] ?? tokens.length, names });
    }
    return scopes;
}

function isCteReference(name: string, index: number, scopes: CteScope[]): boolean {
    return scopes.some(scope => scope.start <= index && index < scope.end && scope.names.has(name));
}

function assertSingleStatement(tokens: Token[]): void {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].kind !== "symbol" || tokens[i].value !== ";") continue;
        if (nextSignificant(tokens, i) !== undefined) fail("Multiple SQL statements are not supported");
    }
}

/** Rewrite the relation created by one CREATE TABLE statement without touching its body. */
export function rewriteCreateTableSql(
    sql: string,
    sourceRelation: string,
    destinationRelation: string,
): TableSqlRewriteResult {
    const tokens = tokenize(sql);
    assertSingleStatement(tokens);
    let cursor = tokens.findIndex(token => !isTrivia(token));
    if (cursor < 0 || !word(tokens[cursor], "create")) fail("Expected a CREATE TABLE statement");
    cursor = nextSignificant(tokens, cursor) ?? -1;
    if (cursor < 0 || !word(tokens[cursor], "table")) fail("Only CREATE TABLE statements are supported");
    cursor = nextSignificant(tokens, cursor) ?? -1;
    if (cursor >= 0 && word(tokens[cursor], "if")) {
        const not = nextSignificant(tokens, cursor);
        const exists = not === undefined ? undefined : nextSignificant(tokens, not);
        if (not === undefined || exists === undefined || !word(tokens[not], "not") || !word(tokens[exists], "exists")) {
            fail("Unsupported CREATE TABLE modifier");
        }
        cursor = nextSignificant(tokens, exists) ?? -1;
    }
    const actual = cursor < 0 ? undefined : identifierValue(tokens[cursor]);
    if (actual === undefined) fail("CREATE TABLE relation name is missing or unsupported");
    const after = nextSignificant(tokens, cursor);
    if (after !== undefined && tokens[after].kind === "symbol" && tokens[after].value === ".") {
        fail("Schema-qualified table names are not supported");
    }
    if (actual !== sourceRelation) {
        fail(`CREATE TABLE defines "${actual}", expected source relation "${sourceRelation}"`);
    }
    tokens[cursor].text = replacementIdentifier(tokens[cursor], destinationRelation);
    for (let i = cursor + 1; i < tokens.length; i++) {
        if (!word(tokens[i], "references")) continue;
        const referencedIndex = nextSignificant(tokens, i);
        const referenced = referencedIndex === undefined ? undefined : identifierValue(tokens[referencedIndex]);
        if (referenced === undefined) fail("REFERENCES relation name is missing or unsupported");
        const next = nextSignificant(tokens, referencedIndex!);
        if (next !== undefined && tokens[next].kind === "symbol" && tokens[next].value === ".") {
            fail("Schema-qualified REFERENCES relations are not supported");
        }
        if (referenced === sourceRelation) {
            tokens[referencedIndex!].text = replacementIdentifier(tokens[referencedIndex!], destinationRelation);
        }
    }
    return {
        sql: tokens.map(token => token.text).join(""),
        relationDependencies: [],
        reservedRelationDependencies: [],
    };
}

/**
 * Rewrite actual relation references in a Grid query. The scanner deliberately
 * recognizes only PostgreSQL FROM/JOIN relations and direct source_kind string
 * projections; identifiers used as columns, aliases, or ordinary literals are
 * never changed.
 */
export function rewriteTableQuerySql(
    sql: string,
    relationMapping: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): TableSqlRewriteResult {
    const mapping = relationMapping instanceof Map
        ? relationMapping
        : new Map(Object.entries(relationMapping));
    const tokens = tokenize(sql);
    assertSingleStatement(tokens);
    const { matchingClose, enclosingOpen, enclosingClose } = parenMetadata(tokens);
    const cteScopes = collectCteScopes(tokens, matchingClose, enclosingClose);
    const dependencies = new Set<string>();
    const reservedDependencies = new Set<string>();
    const fromActive = new Map<number, boolean>();
    const expectRelation = new Map<number, boolean>();
    // The relation an INSERT or UPDATE writes to. It is not a FROM/JOIN
    // relation — it may be followed by a column list — so it is scanned
    // separately. Schedule rules are the only queries that reach here with a
    // DML statement in them (docs/schedule-sql-conventions.md).
    const expectDmlTarget = new Map<number, boolean>();
    const expressionDepths = new Set<number>();
    const qualifierScopes: QualifierScope[] = [];
    let depth = 0;

    const recordDependency = (name: string) => {
        if (RESERVED_RELATION_NAMES.has(name)) reservedDependencies.add(name);
        else dependencies.add(name);
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (isTrivia(token)) continue;
        if (token.kind === "symbol" && token.value === "(") {
            const firstInside = nextSignificant(tokens, i);
            const beginsQuery = firstInside !== undefined
                && QUERY_HEAD_KEYWORDS.has(tokens[firstInside].kind === "word" ? tokens[firstInside].value ?? "" : "");
            if (expectRelation.get(depth)) {
                if (!beginsQuery) fail("Parenthesized joined relation expressions are not supported");
                expectRelation.set(depth, false);
            }
            depth++;
            if (!beginsQuery) expressionDepths.add(depth);
            continue;
        }
        if (token.kind === "symbol" && token.value === ")") {
            fromActive.delete(depth);
            expectRelation.delete(depth);
            expectDmlTarget.delete(depth);
            expressionDepths.delete(depth);
            depth--;
            continue;
        }

        const keyword = token.kind === "word" ? token.value : undefined;
        if (keyword && FROM_TERMINATORS.has(keyword)) {
            fromActive.set(depth, false);
            expectRelation.set(depth, false);
        }
        if (keyword === "from") {
            const previous = previousSignificant(tokens, i);
            if (expressionDepths.has(depth) || (previous !== undefined && word(tokens[previous], "distinct"))) continue;
            fromActive.set(depth, true);
            expectRelation.set(depth, true);
            continue;
        }
        if (keyword === "join") {
            fromActive.set(depth, true);
            expectRelation.set(depth, true);
            continue;
        }
        if (keyword === "into") {
            expectDmlTarget.set(depth, true);
            continue;
        }
        if (keyword === "update") {
            const previous = previousSignificant(tokens, i);
            const previousWord = previous === undefined ? undefined : tokens[previous].value;
            if (
                tokens[previous ?? -1]?.kind !== "word" || previousWord === undefined
                || !NON_STATEMENT_UPDATE_PREDECESSORS.has(previousWord)
            ) {
                expectDmlTarget.set(depth, true);
            }
            continue;
        }

        if (expectDmlTarget.get(depth)) {
            if (keyword === "only") continue;
            expectDmlTarget.set(depth, false);
            const relation = identifierValue(token);
            if (relation === undefined) fail("Unsupported relation expression after INSERT INTO or UPDATE");
            const next = nextSignificant(tokens, i);
            if (next !== undefined && tokens[next].kind === "symbol" && tokens[next].value === ".") {
                fail(`Schema-qualified relation "${relation}" is not supported`);
            }
            // A CTE cannot be written to, but `INSERT ... RETURNING` inside one
            // makes the CTE's own name visible here; leave it alone.
            if (isCteReference(relation, i, cteScopes)) continue;
            recordDependency(relation);
            const destination = mapping.get(relation);
            if (destination !== undefined && !RESERVED_RELATION_NAMES.has(relation)) {
                token.text = replacementIdentifier(token, destination);
            }
            // No qualifier scope is registered: a DML target may be followed by
            // a column list rather than an alias, so the alias scan cannot run
            // here. References that spell the target out in full keep the
            // source name and have to be fixed by hand.
            continue;
        }
        if (token.kind === "symbol" && token.value === "," && fromActive.get(depth)) {
            expectRelation.set(depth, true);
            continue;
        }

        if (expectRelation.get(depth)) {
            if (keyword === "only" || keyword === "lateral") continue;
            if (keyword === "values") {
                expectRelation.set(depth, false);
                continue;
            }
            const relation = identifierValue(token);
            if (relation === undefined) fail("Unsupported relation expression after FROM or JOIN");
            expectRelation.set(depth, false);
            const next = nextSignificant(tokens, i);
            if (next !== undefined && tokens[next].kind === "symbol" && tokens[next].value === ".") {
                fail(`Schema-qualified relation "${relation}" is not supported`);
            }
            if (next !== undefined && tokens[next].kind === "symbol" && tokens[next].value === "(") {
                if (mapping.has(relation)) {
                    fail(`Table-function syntax for copied relation "${relation}" is ambiguous`);
                }
                continue;
            }
            const scopeStart = (enclosingOpen[i] ?? -1) + 1;
            const scopeEnd = enclosingClose[i] ?? tokens.length;
            const alias = relationAlias(tokens, i);
            if (alias !== undefined) qualifierScopes.push({ name: alias, start: scopeStart, end: scopeEnd });
            if (isCteReference(relation, i, cteScopes)) {
                if (alias === undefined) qualifierScopes.push({ name: relation, start: scopeStart, end: scopeEnd });
                continue;
            }
            recordDependency(relation);
            const destination = mapping.get(relation);
            if (destination !== undefined && !RESERVED_RELATION_NAMES.has(relation)) {
                token.text = replacementIdentifier(token, destination);
                if (alias === undefined && destination !== relation) {
                    qualifierScopes.push({ name: relation, destination, start: scopeStart, end: scopeEnd });
                }
            }
            continue;
        }

        if (keyword === "table") {
            const next = nextSignificant(tokens, i);
            const relation = next === undefined ? undefined : identifierValue(tokens[next]);
            if (relation !== undefined && mapping.has(relation)) {
                fail(`TABLE query syntax for copied relation "${relation}" is not supported`);
            }
        }

        if (token.kind === "string" || token.kind === "dollarString") {
            if (sourceKindAlias(tokens, i) === undefined) continue;
            const prefix = previousSignificant(tokens, i);
            if (
                token.kind === "string" && prefix !== undefined && tokens[prefix].end === token.start
                && word(tokens[prefix]) && (tokens[prefix].value === "e" || tokens[prefix].value === "b"
                    || tokens[prefix].value === "x")
            ) {
                fail("Prefixed source_kind string literals are not supported");
            }
            const relation = token.value!;
            recordDependency(relation);
            const destination = mapping.get(relation);
            if (destination !== undefined && !RESERVED_RELATION_NAMES.has(relation)) {
                token.text = replacementString(destination);
            }
        }
    }
    if (depth !== 0) fail("Unbalanced SQL parentheses");

    for (let i = 0; i < tokens.length; i++) {
        const qualifier = identifierValue(tokens[i]);
        if (qualifier === undefined) continue;
        const dot = nextSignificant(tokens, i);
        if (dot === undefined || tokens[dot].kind !== "symbol" || tokens[dot].value !== ".") continue;

        const matchingScopes = qualifierScopes.filter(scope =>
            scope.name === qualifier && scope.start <= i && i < scope.end
        );
        if (matchingScopes.length === 0) continue;
        const innermostStart = Math.max(...matchingScopes.map(scope => scope.start));
        const innermostEnd = Math.min(
            ...matchingScopes.filter(scope => scope.start === innermostStart).map(scope => scope.end),
        );
        const innermost = matchingScopes.filter(scope => scope.start === innermostStart && scope.end === innermostEnd);
        if (innermost.some(scope => scope.destination === undefined)) continue;
        const destinations = new Set(innermost.map(scope => scope.destination));
        if (destinations.size !== 1) continue;
        tokens[i].text = replacementIdentifier(tokens[i], [...destinations][0]!);
    }

    return {
        sql: tokens.map(token => token.text).join(""),
        relationDependencies: [...dependencies],
        reservedRelationDependencies: [...reservedDependencies],
    };
}
