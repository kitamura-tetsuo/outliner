import type { Hocuspocus } from "@hocuspocus/server";
import { DateTime } from "luxon";
import * as Y from "yjs";
import { parseSqlIdentifiers, stripSqlNoise } from "../../../shared/src/services/readOnlySql.js";
import {
    validateScheduleRuleDtstart,
    validateScheduleRuleRRule,
    validateScheduleRuleSql,
    validateScheduleRuleTimezone,
} from "../../../shared/src/services/scheduleRuleValidation.js";
import { computeNextRunAt, computeOccurrencesAfter } from "../scheduler/schedule-indexer.js";
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
    completedAt?: string;
    lastRunAt?: string;
}
interface SchedulePreviewer {
    previewScheduleRule(
        uid: string,
        projectId: string,
        candidate: ScheduleCandidate,
        occurrence: string,
        limit: number,
    ): Promise<{
        accepted: boolean;
        candidateRows: unknown[];
        truncated?: boolean;
        errors: unknown[];
        targetRevision?: string;
    }>;
    getTableRevision(uid: string, projectId: string, tableId: string): Promise<string>;
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
        private readonly previewer?: SchedulePreviewer,
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
        const identifiers = parseSqlIdentifiers(candidate.sql);
        tables.forEach((table, tableId) => {
            if (tableId === candidate.targetTableId) return;
            const name = String(table.get("sqlName") ?? "");
            if (name && (identifiers.has(name) || identifiers.has(name.toLowerCase()))) {
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
        return this.withProject(uid, projectId, async doc => {
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
        return this.withProject(uid, projectId, async doc => {
            const rule = doc.getMap<Y.Map<Stored>>("schedules").get(ruleId);
            if (!rule) throw new McpReadError("not_found", "Schedule not found");
            const stored = this.snapshot(ruleId, rule);
            const validation = this.fieldValidation(stored as unknown as ScheduleCandidate);
            const targetExists = doc.getMap("yjsTables").has(String(stored.targetTableId ?? ""));
            if (!targetExists) {
                validation.targetTable = {
                    valid: false,
                    error: { code: "missing_target", message: "Target Table not found" },
                };
            }
            const refs = this.references(doc, stored as unknown as ScheduleCandidate);
            const candidate = stored as unknown as ScheduleCandidate;
            const occurrences = this.occurrences(candidate, 5);
            const authoritativeTargetRevision = this.previewer && candidate.targetTableId && targetExists
                ? await this.previewer.getTableRevision(uid, projectId, candidate.targetTableId)
                : undefined;
            const referencedTables = refs.map(ref =>
                ref.kind === "write-target" && authoritativeTargetRevision
                    ? { ...ref, revision: authoritativeTargetRevision }
                    : ref
            );
            return {
                ruleId,
                revision: this.revision(ruleId, rule),
                stored,
                derived: { validation, referencedTables, nextOccurrences: occurrences },
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

    private fieldValidation(candidate: ScheduleCandidate): Record<string, { valid: boolean; error?: unknown; }> {
        return {
            sql: validateScheduleRuleSql(candidate.sql),
            rrule: validateScheduleRuleRRule(candidate.rrule),
            dtstart: validateScheduleRuleDtstart(candidate.dtstart),
            timezone: validateScheduleRuleTimezone(candidate.timezone),
        };
    }

    private occurrences(candidate: ScheduleCandidate, limit: number): string[] {
        if (candidate.enabled === false || candidate.completedAt) return [];
        const lowerBound = candidate.catchUp === false
            ? Date.now()
            : candidate.lastRunAt
            ? Date.parse(candidate.lastRunAt)
            : Number.NEGATIVE_INFINITY;
        try {
            return computeOccurrencesAfter(candidate.rrule, candidate.dtstart, candidate.timezone, lowerBound, limit);
        } catch {
            return [];
        }
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
        return this.withProject(
            uid,
            projectId,
            doc => this.validateSnapshot(uid, projectId, doc, candidate, ruleId, occurrence, resultLimit),
        );
    }

    private async validateSnapshot(
        uid: string,
        projectId: string,
        doc: Y.Doc,
        candidate: ScheduleCandidate,
        ruleId?: string,
        occurrence?: string,
        resultLimit = 25,
    ) {
        const fields = this.fieldValidation(candidate);
        const target = doc.getMap<Y.Map<unknown>>("yjsTables").get(candidate.targetTableId);
        const references = this.references(doc, candidate);
        const missingTarget = !target;
        const defaultOccurrence =
            computeNextRunAt(candidate.rrule, candidate.dtstart, candidate.timezone, 0).next_run_at;
        const chosenOccurrence = occurrence
            ?? (defaultOccurrence ? DateTime.fromISO(defaultOccurrence).toUTC().toISO()! : undefined);
        const occurrenceError = occurrence !== undefined && !this.validOccurrence(occurrence)
            ? {
                field: "occurrence",
                code: "invalid_occurrence",
                message: "occurrence must be an ISO 8601 instant with Z or an offset",
            }
            : undefined;
        const fieldsAccepted = Object.values(fields).every(value => value.valid);
        const preview = fieldsAccepted && !missingTarget && !occurrenceError && chosenOccurrence && this.previewer
            ? await this.previewer.previewScheduleRule(uid, projectId, candidate, chosenOccurrence, resultLimit)
            : { accepted: fieldsAccepted && !missingTarget, candidateRows: [], errors: [] };
        return {
            accepted: fieldsAccepted && !missingTarget && !occurrenceError && preview.accepted,
            fieldValidation: fields,
            errors: missingTarget
                ? [{ field: "targetTableId", code: "missing_target", message: "Target Table not found" }]
                : occurrenceError
                ? [occurrenceError]
                : preview.errors,
            references,
            occurrence: chosenOccurrence,
            candidateRows: preview.candidateRows,
            truncated: preview.truncated,
            resultLimit,
            deterministicIds: this.deterministicIdEvidence(candidate.sql),
            revisions: {
                schedule: ruleId && doc.getMap<Y.Map<Stored>>("schedules").get(ruleId)
                    ? this.revision(ruleId, doc.getMap<Y.Map<Stored>>("schedules").get(ruleId)!)
                    : undefined,
                targetTable: preview.targetRevision ?? (target && this.previewer
                    ? await this.previewer.getTableRevision(uid, projectId, candidate.targetTableId)
                    : target
                    ? revisionOf(Object.fromEntries(target.entries()))
                    : undefined),
            },
            persisted: false,
        };
    }

    private validOccurrence(value: string): boolean {
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
            && DateTime.fromISO(value, { setZone: true }).isValid;
    }

    private deterministicIdEvidence(sql: string): { idempotent: boolean; evidence: string; } {
        const clean = stripSqlNoise(sql);
        const insert = /\binsert\s+into\s+(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i.exec(clean);
        if (!insert) return { idempotent: false, evidence: "INSERT omits an explicit id value" };
        const columns = insert[1].split(",").map(value => value.trim().replace(/^"|"$/g, "").toLowerCase());
        if (!columns.includes("id")) return { idempotent: false, evidence: "INSERT omits an explicit id value" };
        const valuesStart = /\bvalues\s*\(/i.exec(sql);
        const values = valuesStart
            ? this.parenthesizedValues(sql, valuesStart.index + valuesStart[0].length - 1)
            : [];
        const expression = values[columns.indexOf("id")];
        if (!expression) return { idempotent: false, evidence: "Could not prove a deterministic explicit id value" };
        if (/\b(gen_random_uuid|uuid_generate|random|nextval|now|clock_timestamp)\s*\(/i.test(expression)) {
            return { idempotent: false, evidence: "The id expression uses a nondeterministic function" };
        }
        if (/current_setting\s*\(\s*'job\.occurrence'/i.test(expression)) {
            return { idempotent: true, evidence: "The id is derived from the explicit occurrence instant" };
        }
        if (/^'(?:[^']|'')*'$/.test(expression) || /^[-+]?\d+(?:\.\d+)?$/.test(expression)) {
            return { idempotent: true, evidence: "The id is a fixed literal" };
        }
        return { idempotent: false, evidence: "Could not prove that retries produce the same id" };
    }

    private parenthesizedValues(sql: string, opening: number): string[] {
        const values: string[] = [];
        let start = opening + 1;
        let depth = 1;
        let quoted = false;
        for (let index = opening + 1; index < sql.length; index++) {
            const character = sql[index]!;
            if (character === "'" && sql[index + 1] === "'") {
                index++;
                continue;
            }
            if (character === "'") quoted = !quoted;
            if (quoted) continue;
            if (character === "(") depth++;
            if (character === ")") depth--;
            if ((character === "," && depth === 1) || depth === 0) {
                values.push(sql.slice(start, index).trim());
                start = index + 1;
            }
            if (depth === 0) break;
        }
        return values;
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
                    const validation = await this.validateSnapshot(uid, projectId, doc, candidate, ruleId);
                    if (!validation.accepted) {
                        throw new McpReadError("validation_failed", "Schedule validation failed", { validation });
                    }
                    if (!dryRun) {
                        // Recheck immediately before the transaction. Yjs observers can
                        // synchronously change the rule while validation is computed.
                        assertRevision(expectedRevision, this.revision(ruleId, rule), { ruleId });
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
        return { ...result, applied: replayed ? false : result.applied, replayed };
    }
}
