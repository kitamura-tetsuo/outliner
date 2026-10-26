import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { getKanbanRegistry, readKanbanSettings } from "../../../shared/src/services/kanbanDefinition.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    adoptKanbanObservationLease,
    KanbanObservationService,
    type PlacementObservationCapture,
    type TableFieldObservationCapture,
} from "./kanban-observations.js";
import { OutlinerKanbanQueryService } from "./kanban-query-service.js";
import { closeLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpReadError } from "./mcp-error.js";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const RESPONSE_BUDGET = 1024 * 1024;
const SETTING_KEYS = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;

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
                .sort((a, b) => a.kanbanId.localeCompare(b.kanbanId));
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
                settings: readKanbanSettings(entry),
                projection: { evaluated: false },
                placements: selected.map(({ capture: _capture, ...item }) => item),
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
            const captures = await this.tableCaptures(projectId, observed, chosen.map(value => value.card), roleFields);
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
                tableFields: captures,
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
                    row: card.row,
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
                            && captures.some(item =>
                                item.outputField === outputField && item.sourceRef.rowId === card.source?.rowId
                                && (item.roles.includes("title") || item.roles.includes("detail"))
                            );
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
                        captures,
                        card.source?.rowId,
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
        cards: readonly { source?: { kind: "table" | "system"; id: string; sqlName: string; rowId: string; }; }[],
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
                if (!route?.writable || route.source?.kind !== "table" || route.source.id !== card.source.id) continue;
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
                    scopeId: `${card.source.id}:${card.source.rowId}:${outputField}`,
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
}

function capability(
    available: boolean,
    route: { writable: boolean; reason?: string; } | undefined,
    captures: readonly TableFieldObservationCapture[],
    rowId: string | undefined,
    outputField: string | undefined,
    unavailableReason: string | undefined,
) {
    const eligible = available && !!route?.writable
        && captures.some(item =>
            item.outputField === outputField && item.sourceRef.rowId === rowId && item.roles.includes("group")
        );
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
        const resolveValue = () => item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
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
