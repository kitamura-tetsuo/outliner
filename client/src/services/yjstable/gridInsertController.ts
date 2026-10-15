import type * as Y from "yjs";
import { type InsertTargetMode, resolveInsertTarget } from "./insertTargetResolver";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession } from "./projectSelectSession";
import type { RelationProvider, RelationValue } from "./relationProvider";
import type { TableColumnSchema } from "./schemaIntrospection";
import { getTableHandles, getTableSqlName, listTables } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector } from "./tableEngine";

export type GridInsertOutcome =
    | { status: "inserted"; targetId: string; targetSqlName: string; }
    | { status: "refused"; mode: InsertTargetMode | "invalid-record" | "stale"; message: string; }
    | { status: "error"; targetId: string; targetSqlName: string; message: string; };

export interface GridInsertController {
    submit(): Promise<GridInsertOutcome>;
    setQuery(query: string): void;
    dispose(): void;
}

/**
 * Executes one Grid INSERT from fresh Project SELECT authority.  The controller
 * deliberately keeps no durable write handle: every submitted intent proves
 * the query, supplier, capability, Table identity and applied schema again.
 */
export function createGridInsertController(options: {
    projectDoc: Y.Doc;
    projectId?: string;
    gridEntry: Y.Map<unknown>;
    query: string;
    connect?: TableDocConnector;
}): GridInsertController {
    const select = createProjectSelectSession({
        projectDoc: options.projectDoc,
        projectId: options.projectId,
        query: options.query,
        connect: options.connect,
        requireExplicitAliases: false,
    });
    const engine = createTableEngineSession(options);
    let queryRevision = 0;
    let preferenceRevision = 0;
    let query = options.query;
    let disposed = false;
    let pending: Promise<GridInsertOutcome> | undefined;
    const observer = (event: Y.YMapEvent<unknown>) => {
        if (event.keysChanged.has("query")) queryRevision++;
        if (event.keysChanged.has("insertTargetTableId")) preferenceRevision++;
    };
    options.gridEntry.observe(observer);

    const submit = (): Promise<GridInsertOutcome> => {
        if (pending) return pending;
        const intent = execute().finally(() => {
            if (pending === intent) pending = undefined;
        });
        pending = intent;
        return intent;
    };

    async function execute(): Promise<GridInsertOutcome> {
        if (disposed) return refused("stale", "The Grid insertion controller is no longer active");
        const capturedQueryRevision = queryRevision;
        const capturedPreferenceRevision = preferenceRevision;
        const capturedSchemas = new Map(
            listTables(options.projectDoc).map(table => [
                table.tableId,
                getTableHandles(options.projectDoc, table.tableId)?.schemaText.toString(),
            ]),
        );
        const preference = readPreference(options.gridEntry);
        const evidence = await select.runNow();
        if (!evidence || stale()) return refused("stale", "The query changed while preparing the insertion");
        const provenance = analyzeProjectQueryProvenance(evidence);
        let provider: RelationProvider | undefined;
        const resolution = await resolveInsertTarget({
            projectDoc: options.projectDoc,
            evidence,
            provenance,
            insertTargetTableId: preference,
            session: select,
            resolveRelation: async sqlName => provider = await engine.resolveRelation(sqlName),
        });
        if (!resolution.target || !provider) {
            return refused(resolution.mode, resolution.reason ?? insertionMessage(resolution.mode));
        }
        const target = resolution.target;
        if (target.kind !== "table" || target.requiresDestination) {
            return refused("unsupported", "This supplier cannot accept a destination-free Grid insertion");
        }
        const acquired = await engine.acquire(target.id);
        const schema = acquired?.adapter.appliedSchema;
        if (!acquired || !schema || schema.tableName !== target.sqlName) {
            return refused("unavailable", "The resolved Table schema is unavailable");
        }
        const schemaRevision = acquired.handles.schemaText.toString();
        if (schemaRevision !== provenance.suppliers.find(source => source.id === target.id)?.schemaRevision) {
            return refused("stale", "The resolved Table schema changed while preparing the insertion");
        }
        const values = buildInsertValues(schema.columns);
        if (!values) return refused("invalid-record", "The Table has a required field with no supported default");
        // This is the final authority check before the first and only write.
        if (
            stale() || !select.isEvidenceCurrent(evidence)
            || queryRevision !== capturedQueryRevision || preferenceRevision !== capturedPreferenceRevision
            || readPreference(options.gridEntry) !== preference
            || getTableSqlName(options.projectDoc, target.id) !== target.sqlName
            || capturedSchemas.get(target.id) !== schemaRevision
            || acquired.handles.schemaText.toString() !== schemaRevision
            || provider.evidence?.id !== target.id || provider.evidence.schemaRevision !== schemaRevision
            || !provider.capabilities.insert || provider.capabilities.insert.requiresDestination
        ) return refused("stale", "The query, destination, schema, or permission changed before insertion");
        try {
            await provider.applyWrite({ op: "INSERT", values });
            return { status: "inserted", targetId: target.id, targetSqlName: target.sqlName };
        } catch (error) {
            return {
                status: "error",
                targetId: target.id,
                targetSqlName: target.sqlName,
                message: error instanceof Error ? error.message : "The provider rejected the insertion",
            };
        }
    }

    function stale(): boolean {
        return disposed || query !== String(options.gridEntry.get("query") ?? "");
    }

    return {
        submit,
        setQuery(next) {
            if (next === query) return;
            query = next;
            select.setQuery(next);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            options.gridEntry.unobserve(observer);
            select.dispose();
            engine.dispose();
        },
    };
}

function readPreference(entry: Y.Map<unknown>): string | undefined {
    const value = entry.get("insertTargetTableId");
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildInsertValues(columns: readonly TableColumnSchema[]): Record<string, RelationValue> | undefined {
    const values: Record<string, RelationValue> = {};
    for (const column of columns) {
        if (column.name === "id" && column.isPrimaryKey) continue;
        const choices = column.enumLabels ?? column.checkOptions;
        if (column.defaultExpression !== undefined) {
            const value = parseDefault(column.defaultExpression, column.kind);
            if (value === undefined || (choices?.length && !choices.includes(String(value)))) return undefined;
            values[column.name] = value;
        } else if (choices?.length) values[column.name] = choices[0]!;
        else if (column.isNullable) continue;
        else if (
            column.kind === "text" && column.dataType !== "uuid"
            && !column.hasCheckConstraint
        ) values[column.name] = "";
        else if (column.kind === "boolean") values[column.name] = false;
        else return undefined;
    }
    return values;
}

function parseDefault(expression: string, kind: TableColumnSchema["kind"]): RelationValue | undefined {
    const quoted = expression.trim().match(/^'((?:[^']|'')*)'(?:\s*::[\s\S]+)?$/);
    if (quoted) return quoted[1]!.replace(/''/g, "'");
    const value = expression.replace(/::[\s\S]+$/u, "").trim();
    if (/^null$/i.test(value)) return null;
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
    if ((kind === "integer" || kind === "number") && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return undefined;
}

function refused(mode: InsertTargetMode | "invalid-record" | "stale", message: string): GridInsertOutcome {
    return { status: "refused", mode, message };
}

function insertionMessage(mode: InsertTargetMode): string {
    if (mode === "selection-required") return "Choose an INSERT destination before adding a row";
    if (mode === "invalid-selection") return "The configured INSERT destination is not a supplier";
    return "The current query has no supported INSERT destination";
}
