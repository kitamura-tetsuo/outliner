// Ad-hoc SELECT execution for a calendar's own query.
//
// A calendar has no schema and no Data Storage of its own (docs/crdt-sql-
// architecture.md §6.6) — only a query. Running it still needs the same
// materialize-and-retry loop `TableSyncAdapter.runQueryNow` uses for a
// cross-relation query: a relation the query references but that is not
// materialized yet is reported by Postgres as `relation "x" does not exist`,
// resolved through the engine session's registry, and retried.

import { enqueueWrite, TableSqlError, toTableSqlError } from "../yjstable/pgliteService";
import { assertSelectQuery, missingRelationName } from "../yjstable/queryAnalysis";
import { formatQueryDateFields } from "../yjstable/queryResultFormatting";
import { quoteIdent } from "../yjstable/sqlNames";
import type { TableEngineSession } from "../yjstable/tableEngine";
import { MAX_RELATION_RESOLUTION_ROUNDS, type TableQueryResult } from "../yjstable/tableSyncAdapter";

export interface CalendarQueryOutcome {
    result?: TableQueryResult;
    error?: string;
}

export async function runCalendarQuery(
    session: Pick<TableEngineSession, "resolveRelation">,
    pgSchema: string,
    query: string,
): Promise<CalendarQueryOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { result: { columns: [], rows: [] } };

    try {
        const selectSql = assertSelectQuery(trimmed);
        let result: TableQueryResult | undefined;
        for (let round = 0;; round++) {
            try {
                result = await executeQuery(pgSchema, selectSql);
                break;
            } catch (err) {
                const relation = missingRelationName(err);
                if (!relation || round >= MAX_RELATION_RESOLUTION_ROUNDS) throw err;
                const provider = await session.resolveRelation(relation);
                if (!provider) throw err;
            }
        }
        return { result };
    } catch (err) {
        const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
        return { error: e.message };
    }
}

async function executeQuery(pgSchema: string, selectSql: string): Promise<TableQueryResult> {
    return await enqueueWrite(async (db) => {
        try {
            await db.exec(`BEGIN; SET LOCAL search_path TO ${quoteIdent(pgSchema)};`);
            const res = await db.query<Record<string, unknown>>(selectSql);
            await db.exec("COMMIT");
            return {
                columns: res.fields.map((f) => f.name),
                rows: formatQueryDateFields(res.fields, res.rows),
            };
        } catch (err) {
            await db.exec("ROLLBACK").catch(() => undefined);
            throw err;
        }
    });
}
