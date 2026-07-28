// Ad-hoc SELECT execution for a calendar's own query.
//
// A calendar has no schema and no Data Storage of its own (docs/crdt-sql-
// architecture.md §6.6) — only a query. Running it still needs the same
// materialize-and-retry loop `TableSyncAdapter.runQueryNow` uses for a
// cross-relation query: a relation the query references but that is not
// materialized yet is reported by Postgres as `relation "x" does not exist`,
// resolved through the engine session's registry, and retried.
//
// The calendar's visible window (§6.4) is injected into the same transaction
// as `view.range_start` / `view.range_end`, transaction-local (`set_config`'s
// third argument) and parameterized — never string-concatenated — mirroring
// how the scheduler injects `job.occurrence` (`server/src/scheduler/worker.ts`).
// This runner is the only place that happens; `TableSyncAdapter.executeQuery`
// (a table's own query) never receives a range, so injection cannot leak into
// a table query, which has no view.
//
// The SQL session timezone is set the same way, transaction-locally, to the
// calendar's own view timezone (§6.5) — again mirroring the scheduler, which
// does the equivalent with `SET LOCAL TIME ZONE` in `worker.ts`. This is what
// makes a `date_trunc(...)`/`::date` grouping expression bucket identically
// for two viewers of a calendar with a fixed timezone, regardless of either
// viewer's own local zone.

import { enqueueWrite, TableSqlError, toTableSqlError } from "../yjstable/pgliteService";
import { assertSelectQuery, missingRelationName } from "../yjstable/queryAnalysis";
import { formatQueryDateFields } from "../yjstable/queryResultFormatting";
import { quoteIdent } from "../yjstable/sqlNames";
import type { TableEngineSession } from "../yjstable/tableEngine";
import { MAX_RELATION_RESOLUTION_ROUNDS, type TableQueryResult } from "../yjstable/tableSyncAdapter";
import type { CalendarRange } from "./calendarViewRange";
import { VIEW_RANGE_END_SETTING, VIEW_RANGE_START_SETTING } from "./calendarViewRange";

export interface CalendarQueryOutcome {
    result?: TableQueryResult;
    error?: string;
}

export async function runCalendarQuery(
    session: Pick<TableEngineSession, "resolveRelation">,
    pgSchema: string,
    query: string,
    range?: CalendarRange,
    timeZone?: string,
): Promise<CalendarQueryOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { result: { columns: [], rows: [] } };

    try {
        const selectSql = assertSelectQuery(trimmed);
        let result: TableQueryResult | undefined;
        for (let round = 0;; round++) {
            try {
                result = await executeQuery(pgSchema, selectSql, range, timeZone);
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

async function executeQuery(
    pgSchema: string,
    selectSql: string,
    range?: CalendarRange,
    timeZone?: string,
): Promise<TableQueryResult> {
    return await enqueueWrite(async (db) => {
        try {
            await db.exec(`BEGIN; SET LOCAL search_path TO ${quoteIdent(pgSchema)};`);
            if (timeZone) {
                await db.query(`SELECT set_config('timezone', $1, true);`, [timeZone]);
            }
            if (range) {
                await db.query(`SELECT set_config('${VIEW_RANGE_START_SETTING}', $1, true);`, [
                    range.start.toISOString(),
                ]);
                await db.query(`SELECT set_config('${VIEW_RANGE_END_SETTING}', $1, true);`, [
                    range.end.toISOString(),
                ]);
            }
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
