import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { getKanbanRegistry, readKanbanSettings } from "../../../shared/src/services/kanbanDefinition.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    adoptKanbanObservationLease,
    KanbanObservationService,
    type PlacementObservationCapture,
} from "./kanban-observations.js";
import { OutlinerKanbanQueryService } from "./kanban-query-service.js";
import { closeLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpReadError } from "./mcp-error.js";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const RESPONSE_BUDGET = 1024 * 1024;
const SETTING_KEYS = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;

function bounded(value: number | undefined, fallback: number, name: string, minimum: number): number {
    const result = value ?? fallback;
    if (
        !Number.isInteger(result) || result < minimum
        || result > (name.endsWith("Limit") || name === "maxCards" ? 500 : Number.MAX_SAFE_INTEGER)
    ) {
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
        const limit = bounded(limitValue, 100, "limit", 1);
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
        const offset = bounded(offsetValue, 0, "placementOffset", 0);
        const limit = bounded(limitValue, 100, "placementLimit", 1);
        await this.authorize(uid, projectId);
        const connection = await openLiveRoom(this.host, `projects/${projectId}`, uid, { effect: "none" });
        let transferred = false;
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
            if (!capture.available) await lease.release();
            await this.authorize(uid, projectId);
            return {
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
        } catch (error) {
            if (transferred) { /* the response owner releases on a later disclosure failure below */ }
            throw error;
        } finally {
            if (!transferred) await closeLiveRoom(this.host, connection);
        }
    }

    async query(uid: string, projectId: string, kanbanId: string, offsetValue?: number, maxValue?: number) {
        this.validate(projectId, kanbanId);
        const offset = bounded(offsetValue, 0, "cardOffset", 0);
        const max = bounded(maxValue, 100, "maxCards", 1);
        const observed = await this.queryService.openObservation(uid, projectId, kanbanId);
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
            const lanes = observed.lanes.map(lane => ({
                key: lane.key,
                totalCards: lane.cards.length,
                returnedCards: lane.cards.filter(card => indices.has(card.occurrenceId)).length,
                cards: lane.cards.filter(card => indices.has(card.occurrenceId)).map(card => ({
                    occurrenceId: card.occurrenceId,
                    row: card.row,
                    ...(card.source ? { sourceRef: card.source } : {}),
                    fieldCapabilities: [...roleFields].map(outputField => {
                        const route = observed.routes.find(item => item.output === outputField);
                        return {
                            outputField,
                            updateEligible: false,
                            reason: route?.writable ? "observation_unavailable" : route?.reason ?? "unproven_source",
                        };
                    }),
                    moveCapability: { eligible: false, reason: "observation_unavailable" },
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
                mutationObservation: { available: false, reason: "source_unavailable" },
            };
            if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESPONSE_BUDGET) {
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
            await this.authorize(uid, projectId);
            return result;
        } finally {
            await observed.release();
        }
    }
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
