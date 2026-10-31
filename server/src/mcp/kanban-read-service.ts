import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { getKanbanRegistry, readKanbanSettings } from "../../../shared/src/services/kanbanDefinition.js";
import { ownsOutlineText } from "../../../shared/src/services/outlineNodeKind.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    adoptKanbanObservationLease,
    isOutlineWritableColumn,
    KanbanObservationService,
    type OutlineFieldObservationCapture,
    type PlacementObservationCapture,
    type TableCardBindingRole,
    type TableFieldObservationCapture,
} from "./kanban-observations.js";
import { type KanbanObservedCard, OutlinerKanbanQueryService } from "./kanban-query-service.js";
import { closeLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpReadError } from "./mcp-error.js";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const RESPONSE_BUDGET = 1024 * 1024;
const SETTING_KEYS = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;
type CardSourceRef = NonNullable<KanbanObservedCard["source"]>;
interface QualifiedFieldCapture {
    readonly sourceRef: {
        readonly kind: string;
        readonly id: string;
        readonly sqlName: string;
        readonly rowId: string;
    };
    readonly outputField: string;
    readonly roles: readonly TableCardBindingRole[];
}
interface OutlineCardFieldCapture extends OutlineFieldObservationCapture, QualifiedFieldCapture {}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue; };

/** Convert SQL values only at the response boundary; projection evidence retains the original rows. */
function serializeSqlRow(row: Record<string, unknown>): Record<string, JsonValue> {
    const ancestors = new Set<object>();
    const convert = (value: unknown): JsonValue => {
        if (value === null || typeof value === "string" || typeof value === "boolean") return value;
        if (typeof value === "bigint") return value.toString();
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (value instanceof Date) {
            if (!Number.isFinite(value.getTime())) throw new McpReadError("internal_failure", "Invalid SQL date");
            return value.toISOString();
        }
        if (typeof value !== "object" || value === null || ancestors.has(value)) {
            throw new McpReadError("internal_failure", "SQL result cannot be serialized");
        }
        ancestors.add(value);
        try {
            if (Array.isArray(value)) return value.map(convert);
            return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, convert(entry)]));
        } finally {
            ancestors.delete(value);
        }
    };
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value)]));
}

export const KANBAN_RESPONSE_LIFECYCLE = Symbol("kanbanResponseLifecycle");
export interface KanbanResponseLifecycle {
    disclosureSucceeded(): void;
    disclosureFailed(): Promise<void>;
}

function bounded(value: number | undefined, fallback: number, name: string, minimum: number, maximum: number): number {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < minimum || result > maximum) {
        throw new McpReadError("invalid_argument", `Invalid ${name}`);
    }
    return result;
}

export class OutlinerKanbanReadService {
    readonly queryService: OutlinerKanbanQueryService;
    constructor(
        private readonly host: LiveRoomHost & Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly observations: KanbanObservationService,
    ) {
        this.queryService = new OutlinerKanbanQueryService(host, canAccess);
    }

    private validate(projectId: string, kanbanId?: string): void {
        if (!ID.test(projectId) || (kanbanId !== undefined && !ID.test(kanbanId))) {
            throw new McpReadError("invalid_argument", "Invalid project or Kanban ID");
        }
    }
    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch { /* fail closed */ }
        if (!allowed) throw new McpReadError("forbidden", "Project is inaccessible");
    }

    /** Reauthorize at the router's final, post-cleanup disclosure boundary. */
    async authorizeDisclosure(uid: string, projectId: string): Promise<void> {
        this.validate(projectId);
        await this.authorize(uid, projectId);
    }

    async list(uid: string, projectId: string, limitValue?: number, cursor?: string) {
        this.validate(projectId);
        const limit = bounded(limitValue, 100, "limit", 1, 500);
        if (cursor !== undefined && !ID.test(cursor)) throw new McpReadError("invalid_argument", "Invalid cursor");
        await this.authorize(uid, projectId);
        const connection = await openLiveRoom(this.host, `projects/${projectId}`, uid, { effect: "none" });
        try {
            await this.authorize(uid, projectId);
            const definitions = [...getKanbanRegistry(connection.document as never).entries()]
                .map(([kanbanId, entry]) => ({ kanbanId, name: readKanbanSettings(entry).name }))
                // Cursor comparison uses JS code-point ordering. Sorting must
                // use the exact same ordering or mixed-case IDs get skipped.
                .sort((a, b) => a.kanbanId < b.kanbanId ? -1 : a.kanbanId > b.kanbanId ? 1 : 0);
            const eligible = cursor === undefined ? definitions : definitions.filter(item => item.kanbanId > cursor);
            const kanbans = eligible.slice(0, limit);
            await this.authorize(uid, projectId);
            return {
                projectId,
                kanbans,
                totalCount: definitions.length,
                returnedCount: kanbans.length,
                truncated: eligible.length > kanbans.length,
                ...(eligible.length > kanbans.length ? { nextCursor: kanbans[kanbans.length - 1]!.kanbanId } : {}),
            };
        } finally {
            await closeLiveRoom(this.host, connection);
        }
    }

    async get(uid: string, projectId: string, kanbanId: string, offsetValue?: number, limitValue?: number) {
        this.validate(projectId, kanbanId);
        const offset = bounded(offsetValue, 0, "placementOffset", 0, Number.MAX_SAFE_INTEGER);
        const limit = bounded(limitValue, 100, "placementLimit", 1, 500);
        await this.authorize(uid, projectId);
        const connection = await openLiveRoom(this.host, `projects/${projectId}`, uid, { effect: "none" });
        let transferred = false;
        let issuedToken: string | undefined;
        try {
            await this.authorize(uid, projectId);
            const doc = connection.document as unknown as Y.Doc;
            const entry = getKanbanRegistry(doc as never).get(kanbanId);
            if (!entry) throw new McpReadError("not_found", "Kanban not found");
            const all = placements(Project.fromDoc(doc as never), kanbanId).sort((a, b) =>
                a.placementId.localeCompare(b.placementId)
            );
            const selected = all.slice(offset, offset + limit);
            // These detached values and the guards below must describe the
            // same synchronous observation, even if final authorization waits.
            const settings = readKanbanSettings(entry);
            const placementSnapshot = selected.map(({ capture: _capture, ...item }) => item);
            const lease = adoptKanbanObservationLease(this.host, connection);
            const capture = this.observations.capture({
                uid,
                projectId,
                kanbanId,
                lease,
                definition: { target: { projectDoc: doc, entry: entry as never }, keys: SETTING_KEYS },
                placements: selected.map(item => item.capture),
            });
            transferred = capture.available;
            issuedToken = capture.available ? capture.observationToken : undefined;
            if (!capture.available) await lease.release();
            await this.authorize(uid, projectId);
            const result = {
                projectId,
                kanbanId,
                settings,
                projection: { evaluated: false },
                placements: placementSnapshot,
                placementCount: all.length,
                returnedCount: selected.length,
                offset,
                truncated: offset + selected.length < all.length,
                mutationObservation: capture.available
                    ? { available: true }
                    : { available: false, reason: capture.reason },
                ...(capture.available
                    ? { observationToken: capture.observationToken, expiresAt: capture.expiresAt }
                    : {}),
            };
            if (issuedToken) attachLifecycle(result, this.observations, issuedToken);
            return result;
        } catch (error) {
            if (issuedToken) await this.observations.release(issuedToken);
            throw error;
        } finally {
            if (!transferred) await closeLiveRoom(this.host, connection);
        }
    }

    async query(uid: string, projectId: string, kanbanId: string, offsetValue?: number, maxValue?: number) {
        this.validate(projectId, kanbanId);
        const offset = bounded(offsetValue, 0, "cardOffset", 0, Number.MAX_SAFE_INTEGER);
        const max = bounded(maxValue, 100, "maxCards", 1, 500);
        const observed = await this.queryService.openObservation(uid, projectId, kanbanId);
        let transferred = false;
        let issuedToken: string | undefined;
        try {
            const queryId = crypto.randomUUID();
            if (observed.status !== "success") {
                return {
                    projectId,
                    kanbanId,
                    projection: { status: observed.status, current: observed.current, reason: observed.reason },
                    mutationObservation: { available: false, reason: observed.reason ?? "observation_unavailable" },
                };
            }
            const flat = observed.lanes.flatMap((lane, laneIndex) => lane.cards.map(card => ({ laneIndex, card })));
            const chosen = flat.slice(offset, offset + max);
            const indices = new Set(chosen.map(value => value.card.occurrenceId));
            const roleFields = new Set([
                observed.settings?.groupField,
                observed.settings?.titleField,
                ...(observed.settings?.detailFields ?? []),
            ].filter((field): field is string => !!field));
            const cards = chosen.map(value => value.card);
            const tableFields = await this.tableCaptures(projectId, observed, cards, roleFields);
            const outlineFields = this.outlineCaptures(observed, cards, roleFields);
            const qualifiedFields: readonly QualifiedFieldCapture[] = [...tableFields, ...outlineFields];
            await this.authorize(uid, projectId);
            if (!observed.isCurrent()) return staleResult(projectId, kanbanId);
            const projectDoc = observed.handles.project.document as unknown as Y.Doc;
            const entry = getKanbanRegistry(projectDoc as never).get(kanbanId);
            if (!entry) return staleResult(projectId, kanbanId);
            // No asynchronous boundary is permitted between A's certification
            // and B's capture of these exact retained handles.
            const lease = adoptKanbanObservationLease(
                this.host,
                observed.handles.project,
                [...observed.handles.sources.values()],
            );
            const capture = this.observations.capture({
                uid,
                projectId,
                kanbanId,
                lease,
                definition: { target: { projectDoc, entry: entry as never }, keys: SETTING_KEYS },
                tableFields,
                outlineFields,
            });
            transferred = capture.available;
            issuedToken = capture.available ? capture.observationToken : undefined;
            const captureFailureReason = capture.available ? undefined : capture.reason;
            if (!capture.available) await lease.release();
            const lanes = observed.lanes.map(lane => ({
                key: lane.key,
                totalCards: lane.cards.length,
                returnedCards: lane.cards.filter(card => indices.has(card.occurrenceId)).length,
                cards: lane.cards.filter(card => indices.has(card.occurrenceId)).map(card => ({
                    occurrenceId: card.occurrenceId,
                    row: serializeSqlRow(card.row),
                    ...(card.source
                        ? {
                            sourceRef: {
                                kind: card.source.kind,
                                id: card.source.id,
                                sqlName: card.source.sqlName,
                                rowId: card.source.rowId,
                            },
                        }
                        : {}),
                    fieldCapabilities: [...roleFields].map(outputField => {
                        const route = observed.routes.find(item => item.output === outputField);
                        const eligible = capture.available && !!route?.writable
                            && (hasFieldSelection(qualifiedFields, card.source, outputField, "title")
                                || hasFieldSelection(qualifiedFields, card.source, outputField, "detail"));
                        const updateConfigured = outputField === observed.settings?.titleField
                            || observed.settings?.detailFields.includes(outputField);
                        return {
                            outputField,
                            updateEligible: eligible,
                            ...(!eligible
                                ? {
                                    reason: !updateConfigured
                                        ? "not_configured_for_update"
                                        : route?.writable
                                        ? captureFailureReason ?? "source_unavailable"
                                        : route?.reason ?? "unproven_source",
                                }
                                : {}),
                        };
                    }),
                    moveCapability: capability(
                        capture.available,
                        observed.routes.find(item => item.output === observed.settings?.groupField),
                        qualifiedFields,
                        card.source,
                        observed.settings?.groupField,
                        captureFailureReason,
                    ),
                })),
            }));
            const result = {
                projectId,
                kanbanId,
                projection: { status: "success", current: true, queryId },
                lanes,
                counts: {
                    totalCards: flat.length,
                    returnedCards: chosen.length,
                    offset,
                    cardsTruncated: chosen.length < flat.length,
                },
                mutationObservation: capture.available
                    ? { available: true }
                    : { available: false, reason: capture.reason },
                ...(capture.available
                    ? { observationToken: capture.observationToken, expiresAt: capture.expiresAt }
                    : {}),
            };
            if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESPONSE_BUDGET) {
                if (issuedToken) await this.observations.release(issuedToken);
                issuedToken = undefined;
                transferred = false;
                return {
                    projectId,
                    kanbanId,
                    projection: {
                        status: "unavailable",
                        current: true,
                        reason: "resource_limit",
                        responseBudget: RESPONSE_BUDGET,
                    },
                    mutationObservation: { available: false, reason: "resource_limit" },
                };
            }
            if (issuedToken) attachLifecycle(result, this.observations, issuedToken);
            return result;
        } catch (error) {
            if (issuedToken) await this.observations.release(issuedToken);
            throw error;
        } finally {
            if (!transferred) await observed.release();
        }
    }

    private async tableCaptures(
        projectId: string,
        observed: Awaited<ReturnType<OutlinerKanbanQueryService["openObservation"]>>,
        cards: readonly KanbanObservedCard[],
        roleFields: ReadonlySet<string>,
    ): Promise<TableFieldObservationCapture[]> {
        const result: TableFieldObservationCapture[] = [];
        const capturesByPhysicalSelection = new Map<string, TableFieldObservationCapture>();
        const projectDoc = observed.handles.project.document as unknown as Y.Doc;
        const registry = projectDoc.getMap<Y.Map<unknown>>("yjsTables");
        for (const card of cards) {
            if (card.source?.kind !== "table") continue;
            const connection = observed.handles.sources.get(card.source.id);
            const entry = registry.get(card.source.id);
            if (!connection || !entry || entry.get("sqlName") !== card.source.sqlName) continue;
            const tableDoc = connection.document as unknown as Y.Doc;
            const data = tableDoc.getMap<Y.Map<unknown>>("data");
            const owner = data.get(card.source.rowId);
            if (!owner) continue;
            for (const outputField of roleFields) {
                const route = observed.routes.find(item => item.output === outputField);
                if (
                    !route?.writable || route.source?.kind !== "table" || route.source.id !== card.source.id
                    || route.source.sqlName !== card.source.sqlName
                ) continue;
                const selectionKey = JSON.stringify([
                    card.source.kind,
                    card.source.id,
                    card.source.sqlName,
                    card.source.rowId,
                    outputField,
                    route.source.field,
                ]);
                const roles = [
                    ...(outputField === observed.settings?.titleField ? ["title" as const] : []),
                    ...(observed.settings?.detailFields.includes(outputField) ? ["detail" as const] : []),
                    ...(outputField === observed.settings?.groupField ? ["group" as const] : []),
                ];
                const existing = capturesByPhysicalSelection.get(selectionKey);
                if (existing) {
                    // Result occurrences are intentionally not deduplicated;
                    // only their identical physical guard is coalesced.
                    continue;
                }
                const effectiveSchema = await this.observations.analyzeTableEffectiveSchema({
                    projectId,
                    projectDoc,
                    tableId: card.source.id,
                    sqlName: card.source.sqlName,
                    physicalColumn: route.source.field,
                    sourceSchema: tableDoc.getText("schema"),
                });
                if (!effectiveSchema) continue;
                const capture: TableFieldObservationCapture = {
                    // JSON tuple encoding is injective for arbitrary valid
                    // record IDs and quoted SQL output aliases.
                    scopeId: JSON.stringify([card.source.id, card.source.rowId, outputField]),
                    owner,
                    field: route.source.field,
                    container: data as never,
                    containerKey: card.source.rowId,
                    sourceRef: card.source,
                    outputField,
                    physicalColumn: route.source.field,
                    roles,
                    effectiveSchema,
                    table: {
                        projectDoc,
                        registry: registry as never,
                        tableId: card.source.id,
                        entry,
                        sqlName: card.source.sqlName,
                        tableDoc,
                    },
                };
                capturesByPhysicalSelection.set(selectionKey, capture);
                result.push(capture);
            }
        }
        return result;
    }

    private outlineCaptures(
        observed: Awaited<ReturnType<OutlinerKanbanQueryService["openObservation"]>>,
        cards: readonly KanbanObservedCard[],
        roleFields: ReadonlySet<string>,
    ): OutlineCardFieldCapture[] {
        const result: OutlineCardFieldCapture[] = [];
        const scopes = new Set<string>();
        const doc = observed.handles.project.document as unknown as Y.Doc;
        const project = Project.fromDoc(doc as never);
        for (const card of cards) {
            const source = card.source;
            if (source?.kind !== "system" || source.id !== "outline_items" || source.sqlName !== "outline_items") {
                continue;
            }
            // outline_items.id is the actual tree occurrence key, not Item.id.
            // Item.yMap can return a detached fallback after deletion.
            const resolveOwner = () => {
                try {
                    if (!doc.getMap("orderedTree").has(source.rowId)) return undefined;
                    return project.tree.getNodeValueFromKey(source.rowId) as Y.Map<unknown> | undefined;
                } catch {
                    return undefined;
                }
            };
            const owner = resolveOwner();
            if (!owner || owner.doc !== doc) continue;
            for (const outputField of roleFields) {
                const route = observed.routes.find(item => item.output === outputField);
                if (
                    !route?.writable || route.source?.kind !== "system" || route.source.id !== source.id
                    || route.source.sqlName !== source.sqlName || !isOutlineWritableColumn(route.source.field)
                ) continue;
                if (
                    route.source.field === "text" && !ownsOutlineText({
                        componentType: owner.get("componentType") as string | undefined,
                    })
                ) continue;
                const scopeId = JSON.stringify([source.id, source.rowId, outputField]);
                if (scopes.has(scopeId)) continue;
                scopes.add(scopeId);
                result.push({
                    scopeId,
                    owner,
                    field: route.source.field,
                    resolveOwner,
                    sourceRef: source,
                    outputField,
                    roles: fieldRoles(outputField, observed.settings),
                });
            }
        }
        return result;
    }
}

function fieldRoles(
    outputField: string,
    settings: Awaited<ReturnType<OutlinerKanbanQueryService["openObservation"]>>["settings"],
): TableCardBindingRole[] {
    return [
        ...(outputField === settings?.titleField ? ["title" as const] : []),
        ...(settings?.detailFields.includes(outputField) ? ["detail" as const] : []),
        ...(outputField === settings?.groupField ? ["group" as const] : []),
    ];
}

function hasFieldSelection(
    captures: readonly QualifiedFieldCapture[],
    source: CardSourceRef | undefined,
    outputField: string | undefined,
    role: TableCardBindingRole,
): boolean {
    return !!source && captures.some(item =>
        item.outputField === outputField && item.roles.includes(role)
        && item.sourceRef.kind === source.kind && item.sourceRef.id === source.id
        && item.sourceRef.sqlName === source.sqlName && item.sourceRef.rowId === source.rowId
    );
}

function capability(
    available: boolean,
    route: { writable: boolean; reason?: string; } | undefined,
    captures: readonly QualifiedFieldCapture[],
    source: CardSourceRef | undefined,
    outputField: string | undefined,
    unavailableReason: string | undefined,
) {
    const eligible = available && !!route?.writable && hasFieldSelection(captures, source, outputField, "group");
    return eligible ? { eligible: true } : {
        eligible: false,
        reason: route?.writable ? unavailableReason ?? "source_unavailable" : route?.reason ?? "unproven_source",
    };
}

function staleResult(projectId: string, kanbanId: string) {
    return {
        projectId,
        kanbanId,
        projection: { status: "unavailable", current: false, reason: "stale_evidence" },
        mutationObservation: { available: false, reason: "stale_evidence" },
    };
}

function attachLifecycle(result: object, observations: KanbanObservationService, observationToken: string): void {
    let disclosed = false;
    Object.defineProperty(result, KANBAN_RESPONSE_LIFECYCLE, {
        enumerable: false,
        value: {
            disclosureSucceeded() {
                disclosed = true;
            },
            async disclosureFailed() {
                if (!disclosed) await observations.release(observationToken);
            },
        } satisfies KanbanResponseLifecycle,
    });
}

function placements(project: Project, kanbanId: string) {
    const result: Array<
        {
            placementId: string;
            itemId: string;
            pageId: string;
            pageTitle: string;
            capture: PlacementObservationCapture;
        }
    > = [];
    const visit = (item: Item, page: Item, pageTitle: string) => {
        const resolveValue = () =>
            item.ydoc.getMap("orderedTree").has(item.key)
                ? item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined
                : undefined;
        const value = resolveValue();
        if (value?.get("componentType") === "kanban" && value.get("kanbanId") === kanbanId) {
            result.push({
                placementId: item.key,
                itemId: item.id,
                pageId: page.id,
                pageTitle,
                capture: { placementId: item.key, resolveValue, value },
            });
        }
        for (const child of item.items) visit(child, page, pageTitle);
    };
    for (const page of project.items) visit(page, page, page.text || "Untitled Page");
    return result;
}
