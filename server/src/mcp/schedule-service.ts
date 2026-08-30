import type { Hocuspocus } from "@hocuspocus/server";
import { DateTime } from "luxon";
import * as Y from "yjs";
import {
    validateScheduleRuleDtstart,
    validateScheduleRuleRRule,
    validateScheduleRuleSql,
    validateScheduleRuleTimezone,
} from "../../../shared/src/services/scheduleRuleValidation.js";
import { computeNextRunAt } from "../scheduler/schedule-indexer.js";
import { McpReadError } from "./mcp-error.js";
import { assertRevision, IdempotencyCache, revisionOf } from "./mutation-contract.js";

type Stored = string | boolean | number | undefined;
export type ScheduleReferenceKind = "write-target" | "sql-reference";
export interface ScheduleCandidate {
    targetTableId: string;
    sql: string;
    rrule: string;
    dtstart: string;
    timezone: string;
    enabled?: boolean;
    catchUp?: boolean;
}

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const FIELDS = [
    "name",
    "targetTableId",
    "sql",
    "rrule",
    "dtstart",
    "timezone",
    "enabled",
    "catchUp",
    "lastRunAt",
    "lastRunStatus",
    "lastRunError",
    "completedAt",
    "validationError",
    "skippedOccurrences",
] as const;
const EDITABLE = new Set(["name", "targetTableId", "sql", "rrule", "dtstart", "timezone", "enabled", "catchUp"]);

export class OutlinerScheduleService {
    private readonly idempotency = new IdempotencyCache();
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
    ) {}

    private async withProject<T>(uid: string, projectId: string, fn: (doc: Y.Doc) => T | Promise<T>): Promise<T> {
        if (!ID.test(projectId)) throw new McpReadError("invalid_argument", "Invalid project ID");
        if (!await this.canAccess(uid, projectId)) throw new McpReadError("forbidden", "Project is inaccessible");
        const connection = await this.hocuspocus.openDirectConnection(`projects/${projectId}`, { context: { uid } });
        try {
            return await fn(connection.document as unknown as Y.Doc);
        } finally {
            await connection.disconnect();
        }
    }

    private snapshot(ruleId: string, rule: Y.Map<Stored>) {
        return Object.fromEntries([
            ["ruleId", ruleId],
            ...FIELDS.flatMap(key => {
                const value = rule.get(key);
                return value === undefined ? [] : [[key, value]];
            }),
        ]) as Record<string, unknown> & { ruleId: string; };
    }

    private revision(ruleId: string, rule: Y.Map<Stored>): string {
        return revisionOf(this.snapshot(ruleId, rule));
    }

    private references(doc: Y.Doc, candidate: ScheduleCandidate): Array<{
        tableId: string;
        displayName: string;
        sqlName: string;
        kind: ScheduleReferenceKind;
        revision: string;
    }> {
        const tables = doc.getMap<Y.Map<unknown>>("yjsTables");
        const output = new Map<
            string,
            { tableId: string; displayName: string; sqlName: string; kind: ScheduleReferenceKind; revision: string; }
        >();
        const add = (tableId: string, kind: ScheduleReferenceKind) => {
            const table = tables.get(tableId);
            if (!table) return;
            const value = {
                tableId,
                displayName: String(table.get("name") ?? ""),
                sqlName: String(table.get("sqlName") ?? ""),
                kind,
                revision: revisionOf(Object.fromEntries(table.entries())),
            };
            output.set(`${kind}:${tableId}`, value);
        };
        add(candidate.targetTableId, "write-target");
        tables.forEach((table, tableId) => {
            const name = String(table.get("sqlName") ?? "");
            if (
                name
                && new RegExp(
                    `(?:^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_])`,
                    "i",
                ).test(candidate.sql)
            ) {
                add(tableId, "sql-reference");
            }
        });
        return [...output.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.tableId.localeCompare(b.tableId));
    }

    async listSchedules(
        uid: string,
        projectId: string,
        tableId?: string,
        referenceKind: "write-target" | "sql-reference" | "any" = "any",
        limit = 25,
        cursor?: string,
    ) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new McpReadError("invalid_argument", "limit must be 1..100");
        }
        if (tableId !== undefined && !ID.test(tableId)) throw new McpReadError("invalid_argument", "Invalid table ID");
        return this.withProject(uid, projectId, doc => {
            if (tableId && !doc.getMap("yjsTables").has(tableId)) {
                throw new McpReadError("not_found", "Table not found");
            }
            let after = "";
            if (cursor) {
                try {
                    after = Buffer.from(cursor, "base64url").toString("utf8");
                } catch {
                    throw new McpReadError("invalid_argument", "Invalid cursor");
                }
                if (!ID.test(after) || Buffer.from(after).toString("base64url") !== cursor) {
                    throw new McpReadError("invalid_argument", "Invalid cursor");
                }
            }
            const matches = [...doc.getMap<Y.Map<Stored>>("schedules").entries()].sort(([a], [b]) => a.localeCompare(b))
                .flatMap(([ruleId, rule]) => {
                    if (ruleId.localeCompare(after) <= 0) return [];
                    const stored = this.snapshot(ruleId, rule);
                    const refs = this.references(doc, stored as unknown as ScheduleCandidate);
                    const kinds = refs.filter(ref => ref.tableId === tableId).map(ref => ref.kind);
                    if (tableId && (referenceKind === "any" ? kinds.length === 0 : !kinds.includes(referenceKind))) {
                        return [];
                    }
                    return [{
                        ruleId,
                        name: stored.name,
                        enabled: stored.enabled,
                        referenceKinds: tableId ? kinds : undefined,
                        lastRun: { status: stored.lastRunStatus, at: stored.lastRunAt, error: stored.lastRunError },
                        revision: this.revision(ruleId, rule),
                    }];
                });
            const schedules = matches.slice(0, limit);
            const truncated = matches.length > limit;
            return {
                schedules,
                page: {
                    limit,
                    truncated,
                    nextCursor: truncated
                        ? Buffer.from(schedules[schedules.length - 1]!.ruleId).toString("base64url")
                        : undefined,
                },
            };
        });
    }

    async getSchedule(uid: string, projectId: string, ruleId: string) {
        if (!ID.test(ruleId)) throw new McpReadError("invalid_argument", "Invalid rule ID");
        return this.withProject(uid, projectId, doc => {
            const rule = doc.getMap<Y.Map<Stored>>("schedules").get(ruleId);
            if (!rule) throw new McpReadError("not_found", "Schedule not found");
            const stored = this.snapshot(ruleId, rule);
            const validation = this.fieldValidation(stored as unknown as ScheduleCandidate);
            const refs = this.references(doc, stored as unknown as ScheduleCandidate);
            const occurrences = this.occurrences(stored as unknown as ScheduleCandidate, 5);
            return {
                ruleId,
                revision: this.revision(ruleId, rule),
                stored,
                derived: { validation, referencedTables: refs, nextOccurrences: occurrences },
                "execution-status": Object.fromEntries(
                    [
                        "lastRunAt",
                        "lastRunStatus",
                        "lastRunError",
                        "completedAt",
                        "validationError",
                        "skippedOccurrences",
                    ].flatMap(key => stored[key] === undefined ? [] : [[key, stored[key]]]),
                ),
            };
        });
    }

    private fieldValidation(candidate: ScheduleCandidate) {
        return {
            sql: validateScheduleRuleSql(candidate.sql),
            rrule: validateScheduleRuleRRule(candidate.rrule),
            dtstart: validateScheduleRuleDtstart(candidate.dtstart),
            timezone: validateScheduleRuleTimezone(candidate.timezone),
        };
    }

    private occurrences(candidate: ScheduleCandidate, limit: number): string[] {
        const result: string[] = [];
        for (let cursor = 0; cursor < limit; cursor++) {
            const next = computeNextRunAt(candidate.rrule, candidate.dtstart, candidate.timezone, cursor);
            if (!next.next_run_at) break;
            result.push(DateTime.fromISO(next.next_run_at).toUTC().toISO()!);
        }
        return result;
    }

    async validate(
        uid: string,
        projectId: string,
        candidate: ScheduleCandidate,
        ruleId?: string,
        occurrence?: string,
        resultLimit = 25,
    ) {
        if (resultLimit < 1 || resultLimit > 100 || !Number.isInteger(resultLimit)) {
            throw new McpReadError("invalid_argument", "resultLimit must be 1..100");
        }
        return this.withProject(uid, projectId, doc => {
            const fields = this.fieldValidation(candidate);
            const target = doc.getMap<Y.Map<unknown>>("yjsTables").get(candidate.targetTableId);
            const references = this.references(doc, candidate);
            const missingTarget = !target;
            const chosenOccurrence = occurrence ?? this.occurrences(candidate, 1)[0];
            return {
                accepted: Object.values(fields).every(value => value.valid) && !missingTarget,
                fieldValidation: fields,
                errors: missingTarget
                    ? [{ field: "targetTableId", code: "missing_target", message: "Target Table not found" }]
                    : [],
                references,
                occurrence: chosenOccurrence,
                candidateRows: [],
                resultLimit,
                deterministicIds: {
                    idempotent: /\bid\b/i.test(candidate.sql),
                    evidence: "SQL declares an id expression",
                },
                revisions: {
                    schedule: ruleId && doc.getMap<Y.Map<Stored>>("schedules").get(ruleId)
                        ? this.revision(ruleId, doc.getMap<Y.Map<Stored>>("schedules").get(ruleId)!)
                        : undefined,
                    targetTable: target ? revisionOf(Object.fromEntries(target.entries())) : undefined,
                },
                persisted: false,
            };
        });
    }

    async update(
        uid: string,
        projectId: string,
        ruleId: string,
        changes: Record<string, unknown>,
        expectedRevision: string,
        dryRun?: boolean,
        operationId?: string,
    ) {
        for (const key of Object.keys(changes)) {
            if (!EDITABLE.has(key)) throw new McpReadError("invalid_argument", `Field ${key} cannot be changed`);
        }
        const key = this.idempotency.key(
            "update_schedule_rule",
            uid,
            projectId,
            ruleId,
            dryRun ? undefined : operationId,
        );
        const { result, replayed } = await this.idempotency.run(
            key,
            () =>
                this.withProject(uid, projectId, async doc => {
                    const rule = doc.getMap<Y.Map<Stored>>("schedules").get(ruleId);
                    if (!rule) throw new McpReadError("not_found", "Schedule not found");
                    const before = this.snapshot(ruleId, rule);
                    const priorRevision = this.revision(ruleId, rule);
                    assertRevision(expectedRevision, priorRevision, { ruleId });
                    const candidate = { ...before, ...changes } as unknown as ScheduleCandidate;
                    const validation = await this.validate(uid, projectId, candidate, ruleId);
                    if (!validation.accepted) {
                        throw new McpReadError("validation_failed", "Schedule validation failed", { validation });
                    }
                    if (!dryRun) {
                        doc.transact(() =>
                            Object.entries(changes).forEach(([field, value]) => rule.set(field, value as Stored))
                        );
                    }
                    return {
                        ruleId,
                        applied: !dryRun,
                        priorRevision,
                        revision: dryRun ? priorRevision : this.revision(ruleId, rule),
                        diff: Object.fromEntries(
                            Object.entries(changes).map(([field, after]) => [field, { before: before[field], after }]),
                        ),
                        validation,
                    };
                }),
        );
        return { ...result, replayed };
    }
}
