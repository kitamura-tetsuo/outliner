import { loadModule, parseSync, scanSync, type ScanToken } from "libpg-query";
import { RESERVED_RELATION_NAMES } from "./sqlNames";

await loadModule();

export class TableSqlRewriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TableSqlRewriteError";
    }
}

export interface TableSqlRewriteResult {
    sql: string;
    /** User relations read or written, plus direct source_kind routing labels. */
    relationDependencies: string[];
    /** User relations actually read or written. */
    actualRelationDependencies: string[];
    /** Reserved relations actually read or written. */
    actualReservedRelationDependencies: string[];
    /** Reserved relations read/written or used as routing labels. */
    reservedRelationDependencies: string[];
}

type Node = Record<string, unknown>;
type Replacement = { startByte: number; endByte: number; text: string; };
type Binding = { destination?: string; };
type Scope = { parent?: Scope; ctes: Set<string>; bindings: Map<string, Binding>; };

function fail(message: string, cause?: unknown): never {
    const error = new TableSqlRewriteError(message);
    if (cause !== undefined) error.cause = cause;
    throw error;
}
function node(value: unknown): value is Node {
    return typeof value === "object" && value !== null;
}
function parseOne(sql: string): Node {
    try {
        const parsed = parseSync(sql) as { stmts?: { stmt?: Node; }[]; };
        if (parsed.stmts?.length !== 1 || !parsed.stmts[0]?.stmt) fail("Exactly one SQL statement is required");
        return parsed.stmts[0].stmt;
    } catch (error) {
        if (error instanceof TableSqlRewriteError) throw error;
        fail("SQL parsing failed", error);
    }
}
function quoteIdentifier(name: string): string {
    const scanned = scanSync(name).tokens;
    return scanned.length === 1 && scanned[0]!.tokenName === "IDENT" && scanned[0]!.text === name
        ? name
        : `"${name.replaceAll('"', '""')}"`;
}
function identifierReplacement(token: ScanToken, name: string): string {
    return token.text.startsWith('"') ? `"${name.replaceAll('"', '""')}"` : quoteIdentifier(name);
}
function tokenAt(tokens: ScanToken[], location: unknown, description: string): ScanToken {
    if (typeof location !== "number") fail(`${description} has no source location`);
    const token = tokens.find(candidate => candidate.start === location);
    if (!token) fail(`${description} has an invalid source location`);
    return token;
}
function addReplacement(replacements: Replacement[], token: ScanToken, text: string): void {
    replacements.push({ startByte: token.start, endByte: token.end, text });
}
function applyReplacements(sql: string, replacements: Replacement[]): string {
    const bytes = new TextEncoder().encode(sql);
    const ordered = [...replacements].sort((a, b) => a.startByte - b.startByte);
    for (let index = 0; index < ordered.length; index++) {
        const current = ordered[index]!;
        if (current.startByte < 0 || current.endByte < current.startByte || current.endByte > bytes.length) {
            fail("A parser source location falls outside the SQL text");
        }
        if (index > 0 && ordered[index - 1]!.endByte > current.startByte) fail("SQL replacement ranges overlap");
    }
    let result = "";
    let cursor = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
        for (const replacement of ordered) {
            result += decoder.decode(bytes.slice(cursor, replacement.startByte));
            result += replacement.text;
            cursor = replacement.endByte;
        }
        result += decoder.decode(bytes.slice(cursor));
    } catch (error) {
        fail("A parser source location does not fall on a UTF-8 boundary", error);
    }
    parseOne(result);
    return result;
}
function emptyResult(sql: string): TableSqlRewriteResult {
    return {
        sql,
        relationDependencies: [],
        actualRelationDependencies: [],
        actualReservedRelationDependencies: [],
        reservedRelationDependencies: [],
    };
}

/** Rewrite one parsed CREATE TABLE relation and only its self-referencing foreign keys. */
export function rewriteCreateTableSql(
    sql: string,
    sourceRelation: string,
    destinationRelation: string,
): TableSqlRewriteResult {
    const statement = parseOne(sql);
    const create = statement.CreateStmt;
    if (!node(create)) fail("Expected one CREATE TABLE statement");
    const relation = create.relation;
    if (!node(relation) || typeof relation.relname !== "string") fail("CREATE TABLE relation is missing");
    if (relation.schemaname || relation.catalogname) fail("Schema-qualified table names are not supported");
    if (relation.relname !== sourceRelation) {
        fail(`CREATE TABLE defines "${relation.relname}", expected source relation "${sourceRelation}"`);
    }
    const tokens = scanSync(sql).tokens;
    const replacements: Replacement[] = [];
    const createdToken = tokenAt(tokens, relation.location, "CREATE TABLE relation");
    addReplacement(replacements, createdToken, identifierReplacement(createdToken, destinationRelation));
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!node(value)) return;
        if (node(value.Constraint)) {
            const constraint = value.Constraint;
            const target = constraint.pktable;
            if (constraint.contype === "CONSTR_FOREIGN" && node(target)) {
                if (target.schemaname || target.catalogname) {
                    fail("Schema-qualified REFERENCES relations are not supported");
                }
                if (target.relname === sourceRelation) {
                    const targetToken = tokenAt(tokens, target.location, "REFERENCES relation");
                    addReplacement(replacements, targetToken, identifierReplacement(targetToken, destinationRelation));
                }
            }
        }
        Object.values(value).forEach(visit);
    };
    visit(create.tableElts);
    return emptyResult(applyReplacements(sql, replacements));
}

/** Analyze and rewrite relation-bearing SQL using PostgreSQL's AST as the sole syntax authority. */
export function rewriteTableQuerySql(
    sql: string,
    relationMapping: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): TableSqlRewriteResult {
    const mapping = relationMapping instanceof Map ? relationMapping : new Map(Object.entries(relationMapping));
    const statement = parseOne(sql);
    const tokens = scanSync(sql).tokens;
    const replacements: Replacement[] = [];
    const dependencies = new Set<string>();
    const actual = new Set<string>();
    const actualReserved = new Set<string>();
    const reserved = new Set<string>();
    const recordRouting = (name: string) => (RESERVED_RELATION_NAMES.has(name) ? reserved : dependencies).add(name);
    const recordActual = (name: string) => {
        recordRouting(name);
        (RESERVED_RELATION_NAMES.has(name) ? actualReserved : actual).add(name);
    };
    const findCte = (scope: Scope | undefined, name: string): boolean => {
        for (let current = scope; current; current = current.parent) if (current.ctes.has(name)) return true;
        return false;
    };
    const findBinding = (scope: Scope | undefined, name: string): Binding | undefined => {
        for (let current = scope; current; current = current.parent) {
            const binding = current.bindings.get(name);
            if (binding) return binding;
        }
        return undefined;
    };
    const rewriteRangeVar = (range: Node, scope: Scope, physicalTarget = false): void => {
        if (typeof range.relname !== "string") fail("Relation reference is missing a name");
        if (range.schemaname || range.catalogname) {
            fail(`Schema-qualified relation "${range.relname}" is not supported`);
        }
        const name = range.relname;
        const alias = node(range.alias) && typeof range.alias.aliasname === "string"
            ? range.alias.aliasname
            : undefined;
        // PostgreSQL CTE names participate in read-source lookup, but DML
        // target relations always resolve through the physical catalog.
        if (!physicalTarget && findCte(scope, name)) {
            scope.bindings.set(alias ?? name, {});
            return;
        }
        recordActual(name);
        const destination = RESERVED_RELATION_NAMES.has(name) ? undefined : mapping.get(name);
        if (destination !== undefined) {
            const token = tokenAt(tokens, range.location, `relation "${name}"`);
            addReplacement(replacements, token, identifierReplacement(token, destination));
        }
        scope.bindings.set(
            alias ?? name,
            alias === undefined && destination !== undefined && destination !== name ? { destination } : {},
        );
    };
    function walkStatement(wrapper: Node, outer?: Scope): void {
        if (node(wrapper.SelectStmt)) return walkSelect(wrapper.SelectStmt, outer);
        if (node(wrapper.InsertStmt)) return walkDml("INSERT", wrapper.InsertStmt, outer);
        if (node(wrapper.UpdateStmt)) return walkDml("UPDATE", wrapper.UpdateStmt, outer);
        if (node(wrapper.DeleteStmt)) return walkDml("DELETE", wrapper.DeleteStmt, outer);
        fail("Unsupported SQL statement type");
    }
    const walkExpression = (value: unknown, scope: Scope): void => {
        if (Array.isArray(value)) return value.forEach(item => walkExpression(item, scope));
        if (!node(value)) return;
        for (const kind of ["SelectStmt", "InsertStmt", "UpdateStmt", "DeleteStmt"]) {
            if (node(value[kind])) {
                walkStatement({ [kind]: value[kind] }, scope);
                return;
            }
        }
        if (node(value.ColumnRef)) {
            const column = value.ColumnRef;
            const fields = Array.isArray(column.fields) ? column.fields : [];
            const first = fields[0];
            const qualifier = node(first) && node(first.String) ? first.String.sval : undefined;
            if (typeof qualifier === "string" && fields.length > 1) {
                const binding = findBinding(scope, qualifier);
                if (binding?.destination) {
                    const token = tokenAt(tokens, column.location, `column qualifier "${qualifier}"`);
                    addReplacement(replacements, token, identifierReplacement(token, binding.destination));
                }
            }
            return;
        }
        Object.values(value).forEach(item => walkExpression(item, scope));
    };
    const prepareWith = (owner: Node, outer: Scope | undefined): Scope => {
        const scope: Scope = { parent: outer, ctes: new Set(), bindings: new Map() };
        const withClause = owner.withClause;
        if (!node(withClause)) return scope;
        const ctes = Array.isArray(withClause.ctes) ? withClause.ctes : [];
        const definitions = ctes.map(wrapper =>
            node(wrapper) && node(wrapper.CommonTableExpr) ? wrapper.CommonTableExpr : fail("Malformed CTE definition")
        );
        if (withClause.recursive) definitions.forEach(definition => scope.ctes.add(String(definition.ctename)));
        for (const definition of definitions) {
            if (!node(definition.ctequery)) fail("Malformed CTE query");
            walkStatement(definition.ctequery, scope);
            scope.ctes.add(String(definition.ctename));
        }
        return scope;
    };
    const walkFrom = (value: unknown, scope: Scope): void => {
        if (Array.isArray(value)) return value.forEach(item => walkFrom(item, scope));
        if (!node(value)) return;
        if (node(value.RangeVar)) return rewriteRangeVar(value.RangeVar, scope);
        if (node(value.RangeSubselect)) {
            const subquery = value.RangeSubselect.subquery;
            if (!node(subquery)) fail("Malformed subquery relation");
            walkStatement(subquery, scope);
            const alias = value.RangeSubselect.alias;
            if (node(alias) && typeof alias.aliasname === "string") scope.bindings.set(alias.aliasname, {});
            return;
        }
        if (node(value.JoinExpr)) {
            const alias = value.JoinExpr.alias;
            const aliasName = node(alias) && typeof alias.aliasname === "string" ? alias.aliasname : undefined;
            // A joined-table alias hides its inputs from the surrounding query,
            // but PostgreSQL resolves ON before that result alias exists.
            const inputScope: Scope = aliasName === undefined
                ? scope
                : { parent: scope, ctes: new Set(), bindings: new Map() };
            walkFrom(value.JoinExpr.larg, inputScope);
            walkFrom(value.JoinExpr.rarg, inputScope);
            walkExpression(value.JoinExpr.quals, inputScope);
            if (aliasName !== undefined) scope.bindings.set(aliasName, {});
            const usingAlias = value.JoinExpr.join_using_alias;
            if (node(usingAlias) && typeof usingAlias.aliasname === "string") {
                // USING aliases name only the merged columns and do not hide
                // either join input from enclosing expressions.
                scope.bindings.set(usingAlias.aliasname, {});
            }
            return;
        }
        if (value.RangeFunction || value.RangeTableFunc || value.RangeTableSample) {
            fail("Function and TABLESAMPLE relation sources are ambiguous and not supported");
        }
        fail("Unsupported FROM/JOIN relation source");
    };
    const routingLiteral = (target: Node): Node | undefined => {
        if (target.name !== "source_kind" || !node(target.val)) return undefined;
        let expression = target.val;
        if (node(expression.TypeCast) && node(expression.TypeCast.arg)) expression = expression.TypeCast.arg;
        return node(expression.A_Const) && node(expression.A_Const.sval) ? expression.A_Const : undefined;
    };
    const walkSelect = (select: Node, outer?: Scope): void => {
        if (select.op && select.op !== "SETOP_NONE") {
            const scope = prepareWith(select, outer);
            if (!node(select.larg) || !node(select.rarg)) fail("Malformed set-operation query");
            walkSelect(select.larg, scope);
            walkSelect(select.rarg, scope);
            for (const [key, value] of Object.entries(select)) {
                if (["withClause", "larg", "rarg", "op"].includes(key)) continue;
                walkExpression(value, scope);
            }
            return;
        }
        const scope = prepareWith(select, outer);
        const targets = Array.isArray(select.targetList) ? select.targetList : [];
        for (const wrapper of targets) {
            if (!node(wrapper) || !node(wrapper.ResTarget)) continue;
            const literal = routingLiteral(wrapper.ResTarget);
            if (literal) {
                const value = literal.sval;
                const name = node(value) ? value.sval : undefined;
                if (typeof name !== "string") fail("Malformed source_kind literal");
                recordRouting(name);
                const destination = RESERVED_RELATION_NAMES.has(name) ? undefined : mapping.get(name);
                if (destination !== undefined) {
                    const token = tokenAt(tokens, literal.location, "source_kind literal");
                    addReplacement(replacements, token, `'${destination.replaceAll("'", "''")}'`);
                }
            }
        }
        // Register routing labels in source order, then bind FROM relations
        // before walking expressions whose qualifiers depend on those bindings.
        walkFrom(select.fromClause ?? [], scope);
        for (const [key, value] of Object.entries(select)) {
            if (["withClause", "fromClause", "larg", "rarg"].includes(key)) continue;
            walkExpression(value, scope);
        }
    };
    const walkDml = (kind: string, dml: Node, outer?: Scope): void => {
        const scope = prepareWith(dml, outer);
        const relation = dml.relation;
        if (!node(relation)) fail(`${kind} target relation is missing`);
        rewriteRangeVar(relation, scope, true);
        walkFrom(dml.fromClause ?? dml.usingClause ?? [], scope);
        for (const [key, value] of Object.entries(dml)) {
            if (["withClause", "relation", "fromClause", "usingClause"].includes(key)) continue;
            walkExpression(value, scope);
        }
    };
    walkStatement(statement);
    return {
        sql: applyReplacements(sql, replacements),
        relationDependencies: [...dependencies],
        actualRelationDependencies: [...actual],
        actualReservedRelationDependencies: [...actualReserved],
        reservedRelationDependencies: [...reserved],
    };
}
