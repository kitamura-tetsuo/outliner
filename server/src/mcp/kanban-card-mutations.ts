import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "node:crypto";
import * as Y from "yjs";
import { getKanbanRegistry } from "../../../shared/src/services/kanbanDefinition.js";
import type { DocumentStore } from "../persistence.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    type KanbanDefinitionKey,
    KanbanObservationError,
    type KanbanObservationSelection,
    KanbanObservationService,
} from "./kanban-observations.js";
import { OutlinerKanbanQueryService } from "./kanban-query-service.js";
import { isLiveRoom, type LiveRoomHost } from "./live-room.js";
import { McpEffectError, McpReadError } from "./mcp-error.js";
import { IdempotencyCache } from "./mutation-contract.js";
import { acquireDb, materializeProjectCatalog } from "./relation-service.js";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const MAX_PAYLOAD = 32 * 1024;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json; };
export interface KanbanSourceRef {
    kind: "table" | "system";
    id: string;
    sqlName: string;
    rowId: string;
}
interface BaseArgs {
    projectId: string;
    kanbanId: string;
    sourceRef: KanbanSourceRef;
    observationToken: string;
    operationId: string;
    dryRun?: boolean;
}
export interface UpdateKanbanCardArgs extends BaseArgs {
    outputField: string;
    value: Json;
}
export interface MoveKanbanCardArgs extends BaseArgs {
    destination: string | null;
}
export interface KanbanCardMutationResult {
    projectId: string;
    kanbanId: string;
    sourceRef: KanbanSourceRef;
    operation: "update" | "move";
    outputField: string;
    requested: Json;
    applied: boolean;
    replayed: boolean;
    dryRun: boolean;
    wouldChange?: boolean;
    candidate?: { physicalField: string; value: Json; };
}
type Command = { operation: "update"; args: UpdateKanbanCardArgs; } | { operation: "move"; args: MoveKanbanCardArgs; };
type Remembered = Omit<KanbanCardMutationResult, "replayed"> | { unknown: true; };

/** Guarded, source-owned mutation boundary used by both Kanban MCP tools. */
export class OutlinerKanbanCardMutationService {
    private readonly queries: OutlinerKanbanQueryService;
    private readonly replay = new IdempotencyCache();
    constructor(
        private readonly host: LiveRoomHost & Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly observations: KanbanObservationService,
        private readonly storeDocument?: DocumentStore,
        options: ConstructorParameters<typeof OutlinerKanbanQueryService>[2] = {},
    ) {
        this.queries = new OutlinerKanbanQueryService(host, canAccess, options);
    }

    update(uid: string, args: UpdateKanbanCardArgs) {
        return this.run(uid, { operation: "update", args });
    }
    move(uid: string, args: MoveKanbanCardArgs) {
        return this.run(uid, { operation: "move", args });
    }
    async authorizeDisclosure(uid: string, projectId: string): Promise<void> {
        await this.authorize(uid, projectId);
    }

    private async run(uid: string, command: Command): Promise<KanbanCardMutationResult> {
        validate(command);
        const { args } = command;
        await this.authorize(uid, args.projectId);
        if (args.dryRun) {
            const result = await this.attempt(uid, command, true);
            await this.authorize(uid, args.projectId);
            return { ...result, replayed: false };
        }
        const key = JSON.stringify([
            command.operation === "update" ? "update_kanban_card" : "move_kanban_card",
            uid,
            args.projectId,
            args.kanbanId,
            args.operationId,
        ]);
        const fingerprint = hash(command);
        let remembered: Remembered, replayed: boolean;
        try {
            ({ result: remembered, replayed } = await this.replay.runChecked(key, fingerprint, async () => {
                try {
                    return await this.attempt(uid, command, false);
                } catch (error) {
                    if (error instanceof UnknownEffect) return { unknown: true } as const;
                    throw error;
                }
            }));
        } catch (error) {
            throw await this.sanitize(uid, args.projectId, error);
        }
        await this.authorize(uid, args.projectId).catch(() => {
            throw new McpEffectError("forbidden", "Project is inaccessible", {}, {
                applied: "unknown" in remembered ? null : remembered.applied,
                replayed,
            });
        });
        if ("unknown" in remembered) {
            throw new McpEffectError("internal_failure", "The Kanban card update outcome is unknown", {
                applied: null,
                replayed,
                reason: "persistence_unconfirmed",
            }, { applied: null, replayed });
        }
        return { ...remembered, replayed };
    }

    private async attempt(
        uid: string,
        command: Command,
        dryRun: boolean,
    ): Promise<Omit<KanbanCardMutationResult, "replayed">> {
        const { args } = command;
        const guard = this.acquire(uid, args);
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                const projection = await this.queries.openObservation(uid, args.projectId, args.kanbanId);
                try {
                    if (projection.status === "unavailable" && projection.reason === "stale_evidence") {
                        const selectedRole = command.operation === "move"
                            ? "group" as const
                            : command.args.outputField === projection.settings?.titleField
                            ? "title" as const
                            : "detail" as const;
                        this.assertDefinitionObserved(guard, args, command, selectedRole);
                        continue;
                    }
                    if (projection.status !== "success" || !projection.isCurrent()) {
                        throw new McpReadError(
                            "stale_revision",
                            "A complete current Kanban projection is unavailable",
                            {
                                reason: projection.reason ?? "stale_evidence",
                            },
                        );
                    }
                    const settings = projection.settings!;
                    const outputField = command.operation === "move" ? settings.groupField : command.args.outputField;
                    if (!outputField) throw validation("missing_role");
                    const role = command.operation === "move"
                        ? "group" as const
                        : outputField === settings.titleField
                        ? "title" as const
                        : "detail" as const;
                    if (
                        command.operation === "update" && outputField !== settings.titleField
                        && !settings.detailFields.includes(outputField)
                    ) throw validation("field_not_exposed");
                    if (
                        command.operation === "move"
                        && !projection.lanes.some(lane => Object.is(lane.key, command.args.destination))
                    ) throw validation("destination_not_eligible");
                    const route = projection.routes.find(item => item.output === outputField);
                    if (!route?.writable || !route.source) throw validation(route?.reason ?? "unproven_source");
                    if (!sameSource(route.source, args.sourceRef)) throw validation("source_route_mismatch");
                    const occurrences = projection.lanes.flatMap(lane => lane.cards).filter(card =>
                        card.source && sameRef(card.source, args.sourceRef)
                    );
                    if (occurrences.length === 0) {
                        throw new McpReadError("stale_revision", "Card is no longer in this Kanban", {
                            reason: "card_not_in_projection",
                        });
                    }
                    this.assertObserved(guard, args, outputField, route.source.field, role, command.operation);
                    const value = command.operation === "move" ? command.args.destination : command.args.value;
                    const prepared = await this.prepare(
                        projection,
                        args.projectId,
                        args.sourceRef,
                        route.source.field,
                        value,
                    );
                    await this.authorize(uid, args.projectId);
                    if (!projection.isCurrent() || !prepared.current()) continue;
                    this.assertObserved(guard, args, outputField, route.source.field, role, command.operation);
                    if (!projection.isCurrent() || !prepared.current()) continue;
                    const base = {
                        projectId: args.projectId,
                        kanbanId: args.kanbanId,
                        sourceRef: args.sourceRef,
                        operation: command.operation,
                        outputField,
                        requested: value,
                    } as const;
                    if (dryRun) {
                        return {
                            ...base,
                            applied: false,
                            dryRun: true,
                            wouldChange: prepared.changed,
                            candidate: { physicalField: route.source.field, value: prepared.sourceValue },
                        };
                    }
                    if (!prepared.changed) return { ...base, applied: false, dryRun: false };
                    if (!this.storeDocument) {
                        throw new McpReadError("internal_failure", "Persistence acknowledgement is unavailable", {
                            reason: "persistence_unavailable",
                        });
                    }
                    // Final checks and the source effect are synchronous and adjacent.
                    if (!projection.isCurrent() || !prepared.current()) continue;
                    prepared.apply();
                    try {
                        await this.storeDocument(prepared.room, prepared.doc);
                    } catch {
                        throw new UnknownEffect();
                    }
                    return { ...base, applied: true, dryRun: false };
                } finally {
                    await projection.release().catch(() => {});
                }
            }
            throw new McpReadError("stale_revision", "Inputs kept changing during validation", {
                reason: "concurrent_changes",
            });
        } finally {
            guard.release();
        }
    }

    private acquire(uid: string, args: BaseArgs) {
        try {
            return this.observations.acquire(uid, args.projectId, args.observationToken);
        } catch (error) {
            throw observationError(error);
        }
    }

    private assertObserved(
        guard: ReturnType<KanbanObservationService["acquire"]>,
        args: BaseArgs,
        outputField: string,
        physicalColumn: string,
        role: "title" | "detail" | "group",
        operation: Command["operation"],
    ) {
        try {
            this.assertDefinitionObserved(guard, args, { operation } as Command, role);
            const scopeId = JSON.stringify([args.sourceRef.id, args.sourceRef.rowId, outputField]);
            const selection: KanbanObservationSelection = args.sourceRef.kind === "table"
                ? {
                    kind: "table-field",
                    kanbanId: args.kanbanId,
                    scopeId,
                    sourceRef: args.sourceRef,
                    outputField,
                    physicalColumn,
                    role,
                }
                : { kind: "outline-field", kanbanId: args.kanbanId, scopeId };
            guard.assertCurrent(selection);
        } catch (error) {
            throw observationError(error);
        }
    }

    private assertDefinitionObserved(
        guard: ReturnType<KanbanObservationService["acquire"]>,
        args: BaseArgs,
        command: Pick<Command, "operation">,
        role?: "title" | "detail" | "group",
    ) {
        try {
            this.assertDefinitionObservedUnchecked(guard, args, command, role);
        } catch (error) {
            throw observationError(error);
        }
    }

    private assertDefinitionObservedUnchecked(
        guard: ReturnType<KanbanObservationService["acquire"]>,
        args: BaseArgs,
        command: Pick<Command, "operation">,
        role?: "title" | "detail" | "group",
    ) {
        const keys: KanbanDefinitionKey[] = [
            "query",
            command.operation === "move" ? "groupField" : role === "title" ? "titleField" : "detailFields",
        ];
        guard.assertCurrent({ kind: "definition", kanbanId: args.kanbanId, keys });
    }

    private async prepare(
        projection: Awaited<ReturnType<OutlinerKanbanQueryService["openObservation"]>>,
        projectId: string,
        ref: KanbanSourceRef,
        field: string,
        value: Json,
    ) {
        if (ref.kind === "table") {
            const connection = projection.handles.sources.get(ref.id);
            const projectDoc = projection.handles.project.document as unknown as Y.Doc;
            const doc = connection?.document as unknown as Y.Doc | undefined;
            const entry = projectDoc.getMap<Y.Map<unknown>>("yjsTables").get(ref.id);
            const row = doc?.getMap<Y.Map<unknown>>("data").get(ref.rowId);
            if (!connection || !doc || !entry || entry.get("sqlName") !== ref.sqlName || !row) {
                throw new McpReadError("stale_revision", "Source record is unavailable", { reason: "source_changed" });
            }
            const schema = doc.getText("schema").toString();
            const normalized = await validateTableValue(
                projectId,
                projectDoc,
                doc,
                ref.sqlName,
                ref.rowId,
                field,
                value,
            );
            const prior = row.get(field);
            return {
                room: `projects/${projectId}/tables/${ref.id}`,
                doc,
                sourceValue: normalized,
                changed: !jsonEqual(prior, normalized),
                current: () =>
                    isLiveRoom(this.host, `projects/${projectId}/tables/${ref.id}`, doc)
                    && entry.get("sqlName") === ref.sqlName && doc.getText("schema").toString() === schema
                    && doc.getMap<Y.Map<unknown>>("data").get(ref.rowId) === row && jsonEqual(row.get(field), prior),
                apply: () => doc.transact(() => row.set(field, detached(normalized))),
            };
        }
        if (ref.id !== "outline_items" || ref.sqlName !== "outline_items") throw validation("unsupported_source");
        const doc = projection.handles.project.document as unknown as Y.Doc;
        const project = Project.fromDoc(doc as never);
        const owner = outlineOwner(doc, project, ref.rowId);
        const item = findItem(project, ref.rowId);
        if (!owner || !item) {
            throw new McpReadError("stale_revision", "Outline item is unavailable", { reason: "source_changed" });
        }
        const normalized = normalizeOutlineValue(field, value);
        const slots = outlineSlots(field);
        const prior = outlineSnapshot(owner, slots);
        const candidateDoc = new Y.Doc();
        const candidate = candidateDoc.getMap<unknown>("candidate");
        for (const slot of slots) {
            if (!owner.has(slot)) continue;
            const existing = owner.get(slot);
            candidate.set(slot, existing instanceof Y.AbstractType ? existing.clone() : existing);
        }
        writeOutline(candidate, field, normalized);
        const proposed = outlineSnapshot(candidate, slots);
        candidateDoc.destroy();
        return {
            room: `projects/${projectId}`,
            doc,
            sourceValue: normalized,
            changed: !jsonEqual(prior, proposed),
            current: () =>
                isLiveRoom(this.host, `projects/${projectId}`, doc)
                && outlineOwner(doc, Project.fromDoc(doc as never), ref.rowId) === owner
                && jsonEqual(outlineSnapshot(owner, slots), prior),
            apply: () => doc.transact(() => writeOutline(owner, field, normalized)),
        };
    }

    private async authorize(uid: string, projectId: string) {
        let allowed = false;
        try {
            allowed = ID.test(projectId) && await this.canAccess(uid, projectId);
        } catch { /* fail closed */ }
        if (!allowed) throw new McpReadError("forbidden", "Project is inaccessible");
    }
    private async sanitize(uid: string, projectId: string, error: unknown) {
        if (error instanceof McpReadError) {
            if (error.code !== "forbidden") await this.authorize(uid, projectId);
            return error;
        }
        return new McpReadError("internal_failure", "Kanban card update failed; nothing was changed");
    }
}

function outlineOwner(doc: Y.Doc, project: Project, key: string): Y.Map<unknown> | undefined {
    try {
        if (!doc.getMap("orderedTree").has(key)) return undefined;
        return project.tree.getNodeValueFromKey(key) as Y.Map<unknown> | undefined;
    } catch {
        return undefined;
    }
}

class UnknownEffect extends Error {}
function validation(reason: string) {
    return new McpReadError("validation_failed", "Kanban card mutation is not allowed", { reason });
}
function observationError(error: unknown) {
    return error instanceof KanbanObservationError
        ? new McpReadError("stale_revision", "The Kanban observation is no longer usable", { reason: error.code })
        : error;
}
function validate(command: Command) {
    const { args } = command;
    if (!ID.test(args.projectId) || !ID.test(args.kanbanId)) {
        throw new McpReadError("invalid_argument", "Invalid project or Kanban ID");
    }
    if (!args.operationId || args.operationId.length > 200 || !args.operationId.trim()) {
        throw new McpReadError("invalid_argument", "Invalid operationId");
    }
    if (!args.observationToken || !args.sourceRef.rowId || !args.sourceRef.sqlName || !args.sourceRef.id) {
        throw new McpReadError("invalid_argument", "Invalid source or observation");
    }
    if (command.operation === "update" && !command.args.outputField.trim()) {
        throw new McpReadError("invalid_argument", "outputField must be nonblank");
    }
    if (
        args.sourceRef.kind === "system"
        && (args.sourceRef.id !== "outline_items" || args.sourceRef.sqlName !== "outline_items")
    ) throw validation("unsupported_source");
    const payload = command.operation === "update" ? command.args.value : command.args.destination;
    assertJson(payload);
    if (Buffer.byteLength(JSON.stringify(command), "utf8") > MAX_PAYLOAD) {
        throw new McpReadError("size_limit", "Mutation payload exceeds 32 KiB");
    }
}
function assertJson(value: unknown): asserts value is Json {
    if (typeof value === "number" && !Number.isFinite(value)) {
        throw new McpReadError("invalid_argument", "Numbers must be finite");
    }
    if (value === null || ["string", "boolean", "number"].includes(typeof value)) return;
    if (Array.isArray(value)) return value.forEach(assertJson);
    if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).forEach(assertJson);
    throw new McpReadError("invalid_argument", "Value must be JSON-compatible");
}
function hash(value: unknown) {
    return crypto.createHash("sha256").update(stable(value)).digest("hex");
}
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${
            Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) =>
                `${JSON.stringify(k)}:${stable(v)}`
            ).join(",")
        }}`;
    }
    return JSON.stringify(value);
}
function sameRef(a: KanbanSourceRef, b: KanbanSourceRef) {
    return a.kind === b.kind && a.id === b.id && a.sqlName === b.sqlName && a.rowId === b.rowId;
}
function sameSource(a: { kind: string; id: string; sqlName: string; }, b: KanbanSourceRef) {
    return a.kind === b.kind && a.id === b.id && a.sqlName === b.sqlName;
}
function detached(value: Json): Json {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
function jsonEqual(a: unknown, b: unknown) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function validateTableValue(
    projectId: string,
    project: Y.Doc,
    table: Y.Doc,
    sqlName: string,
    rowId: string,
    field: string,
    value: Json,
): Promise<Json> {
    if (field === "id" || Array.isArray(value) || (value !== null && typeof value === "object")) {
        throw validation("unsupported_value_shape");
    }
    const lease = await acquireDb();
    const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
    try {
        await materializeProjectCatalog(lease.db, projectId, project as never);
        await lease.db.exec(table.getText("schema").toString());
        const data = table.getMap<Y.Map<unknown>>("data");
        for (const [id, record] of data) {
            const values = Object.fromEntries(record.entries());
            values.id = id;
            const keys = Object.keys(values);
            await lease.db.query(
                `INSERT INTO ${q(sqlName)} (${keys.map(q).join(",")}) VALUES (${
                    keys.map((_, i) => `$${i + 1}`).join(",")
                })`,
                Object.values(values),
            );
        }
        const result = await lease.db.query<Record<string, unknown>>(
            `UPDATE ${q(sqlName)} SET ${q(field)}=$1 WHERE id=$2 RETURNING ${q(field)}`,
            [value, rowId],
        );
        if (result.affectedRows !== 1) throw validation("record_missing");
        const normalized = result.rows[0]?.[field];
        assertJson(normalized);
        return normalized;
    } catch (error) {
        if (error instanceof McpReadError) throw error;
        throw new McpReadError("validation_failed", "Value violates the current source schema", {
            reason: "source_constraint",
        });
    } finally {
        lease.release();
    }
}
function findItem(project: Project, key: string): Item | undefined {
    const visit = (items: Iterable<Item>): Item | undefined => {
        for (const item of items) {
            if (item.key === key) return item;
            const child = visit(item.items);
            if (child) return child;
        }
        return undefined;
    };
    return visit(project.items);
}
function normalizeOutlineValue(field: string, value: Json): Json {
    if (field === "tags") {
        let parsed: unknown = value;
        if (Array.isArray(value)) {
            if (value.some(v => typeof v !== "string")) throw validation("unsupported_value_shape");
        } else if (typeof value === "string") {
            try {
                parsed = JSON.parse(value);
            } catch {
                parsed = [];
            }
        } else if (value !== null && typeof value === "object") {
            throw validation("unsupported_value_shape");
        }
        if (!Array.isArray(parsed)) return [];
        return [
            ...new Set(
                parsed.filter((tag): tag is string => typeof tag === "string")
                    .map(tag => tag.trim()).filter(Boolean),
            ),
        ];
    }
    if (Array.isArray(value) || (value !== null && typeof value === "object")) {
        throw validation("unsupported_value_shape");
    }
    if (field === "text") return value == null ? "" : String(value);
    if (field === "done" || field === "all_day") {
        if (value === null || (field === "done" && value === "")) return null;
        if (value === "true") return true;
        if (value === "false") return false;
        return Boolean(value);
    }
    return value == null || value === "" ? null : String(value);
}
const outlineNames: Record<string, string> = {
    all_day: "allDay",
    start_on: "start",
    start_at: "start",
    recurrence_dtstart: "recurrenceDtstart",
    recurrence_timezone: "recurrenceTimezone",
};
function outlineSlots(field: string): string[] {
    if (field === "start_on" || field === "start_at") return ["start", "allDay"];
    if (field === "rrule") return ["rrule", "recurrenceExdate"];
    return [outlineNames[field] ?? field];
}
function outlineSnapshot(owner: Y.Map<unknown>, slots: string[]): unknown {
    return slots.map(slot => {
        if (!owner.has(slot)) return [slot, false];
        const value = owner.get(slot);
        if (value instanceof Y.Text) return [slot, true, "text", value.toDelta()];
        if (value instanceof Y.Array) return [slot, true, "array", value.toJSON()];
        if (value instanceof Y.AbstractType) return [slot, true, "shared", value.toJSON()];
        return [slot, true, "scalar", value];
    });
}
function writeOutline(owner: Y.Map<unknown>, field: string, value: Json) {
    if (field === "text") {
        let text = owner.get("text");
        if (!(text instanceof Y.Text)) {
            text = new Y.Text();
            owner.set("text", text);
        }
        const target = text as Y.Text;
        target.delete(0, target.length);
        if (value) target.insert(0, value as string);
    } else if (field === "tags") {
        const next = value as string[];
        const existing = owner.get("tags") as Y.Array<string> | undefined;
        if (next.length === 0) {
            if (existing) owner.delete("tags");
        } else if (!existing) {
            const array = new Y.Array<string>();
            array.push(next);
            owner.set("tags", array);
        } else {
            const current = existing.toArray(), wanted = new Set(next), seen = new Set<string>();
            for (let i = current.length - 1; i >= 0; i--) {
                const tag = current[i]!;
                if (!wanted.has(tag) || seen.has(tag)) existing.delete(i, 1);
                else seen.add(tag);
            }
            const added = next.filter(tag => !seen.has(tag));
            if (added.length) existing.push(added);
        }
    } else if (field === "start_on" || field === "start_at") {
        if (value === null) {
            owner.delete("start");
            owner.delete("allDay");
        } else {
            owner.set("start", value);
            owner.set("allDay", field === "start_on");
        }
    } else if (field === "rrule") {
        if (value === null) owner.delete("rrule");
        else {
            owner.set("rrule", value);
            if (!owner.get("recurrenceExdate")) owner.set("recurrenceExdate", new Y.Array<string>());
        }
    } else {
        const name = outlineNames[field] ?? field;
        value === null ? owner.delete(name) : owner.set(name, value);
    }
}
