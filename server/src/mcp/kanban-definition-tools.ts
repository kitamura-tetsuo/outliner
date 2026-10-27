import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "node:crypto";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
    type KanbanDefinitionSeed,
    type KanbanSettings,
    readKanbanSettings,
    validateKanbanFields,
    willKanbanUpdateChange,
} from "../../../shared/src/services/kanbanDefinition.js";
import type { DocumentStore } from "../persistence.js";
import { type KanbanDefinitionKey, KanbanObservationError, KanbanObservationService } from "./kanban-observations.js";
import { closeLiveRoom, isLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpEffectError, McpReadError } from "./mcp-error.js";
import { IdempotencyCache } from "./mutation-contract.js";
import { canonicalFingerprint } from "./update-grid-presentation-tool.js";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const SETTING_KEYS = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;
const SETTING_KEY_SET = new Set<string>(SETTING_KEYS);
const MAX_SETTINGS_BYTES = 32 * 1024;

export type KanbanSettingsPatch = KanbanDefinitionSeed;
export interface CreateKanbanArgs {
    projectId: string;
    settings?: unknown;
    operationId: string;
    dryRun?: boolean;
}
export interface UpdateKanbanArgs {
    projectId: string;
    kanbanId: string;
    observationToken: string;
    changes: unknown;
    operationId: string;
    dryRun?: boolean;
}

type Receipt =
    | { status: "saved"; value: Record<string, unknown>; }
    | { status: "unknown"; projectId: string; kanbanId: string; reason: string; };

function invalid(message: string, code: "invalid_argument" | "size_limit" = "invalid_argument"): McpReadError {
    return new McpReadError(code, message, { effect: "none" });
}

function validateId(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || !ID.test(value)) throw invalid(`Invalid ${label}`);
}

function validateOperationId(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length > 200 || value.trim() === "") {
        throw invalid("operationId must be a nonblank string of at most 200 characters");
    }
}

function settingsPatch(value: unknown, label: string): KanbanSettingsPatch {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw invalid(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw invalid(`${label} must be an object`);
    const object = value as Record<string, unknown>;
    const unknown = Object.keys(object).filter(key => !SETTING_KEY_SET.has(key));
    if (unknown.length) throw invalid(`Unsupported ${label} field(s): ${unknown.join(", ")}`);
    const bytes = Buffer.byteLength(JSON.stringify(object), "utf8");
    if (bytes > MAX_SETTINGS_BYTES) {
        throw invalid(`${label} of ${bytes} bytes exceeds the ${MAX_SETTINGS_BYTES}-byte limit`, "size_limit");
    }
    try {
        validateKanbanFields(object as KanbanDefinitionSeed);
    } catch (error) {
        throw invalid(error instanceof Error ? error.message : `Invalid ${label}`);
    }
    return object as KanbanDefinitionSeed;
}

function completeSettings(settings: KanbanDefinitionSeed): KanbanSettings {
    return {
        name: settings.name ?? "Kanban",
        query: settings.query ?? "",
        ...(settings.groupField ? { groupField: settings.groupField } : {}),
        ...(settings.titleField ? { titleField: settings.titleField } : {}),
        detailFields: [...(settings.detailFields ?? [])],
        laneOrder: [...(settings.laneOrder ?? [])],
    };
}

function exactSupplied(patch: KanbanSettingsPatch): Record<string, unknown> {
    return Object.fromEntries(Object.keys(patch).map(key => [key, (patch as Record<string, unknown>)[key]]));
}

/** Process-local, observation-guarded configuration mutations for independent Kanbans. */
export class KanbanDefinitionTools {
    private readonly replay: IdempotencyCache;

    constructor(
        private readonly host: LiveRoomHost & Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly observations: KanbanObservationService,
        private readonly storeDocument?: DocumentStore,
        now: () => number = Date.now,
    ) {
        this.replay = new IdempotencyCache(now);
    }

    async authorizeDisclosure(uid: string, projectId: string): Promise<void> {
        validateId(projectId, "project ID");
        await this.authorize(uid, projectId);
    }

    async create(uid: string, args: CreateKanbanArgs): Promise<Record<string, unknown>> {
        validateId(args.projectId, "project ID");
        validateOperationId(args.operationId);
        const settings = settingsPatch(args.settings ?? {}, "settings");
        await this.authorize(uid, args.projectId);
        if (args.dryRun) {
            return {
                saved: false,
                applied: false,
                replayed: false,
                projectId: args.projectId,
                wouldChange: true,
                candidateSettings: completeSettings(settings),
                projection: { evaluated: false },
            };
        }
        const key = JSON.stringify(["create_kanban", uid, args.projectId, args.operationId]);
        const fingerprint = canonicalFingerprint({ settings });
        return this.applyReplay(
            uid,
            args.projectId,
            key,
            fingerprint,
            () => this.createAttempt(uid, args.projectId, settings),
        );
    }

    async update(uid: string, args: UpdateKanbanArgs): Promise<Record<string, unknown>> {
        validateId(args.projectId, "project ID");
        validateId(args.kanbanId, "Kanban ID");
        validateOperationId(args.operationId);
        if (typeof args.observationToken !== "string" || args.observationToken === "") {
            throw invalid("observationToken is required");
        }
        const changes = settingsPatch(args.changes, "changes");
        await this.authorize(uid, args.projectId);
        if (args.dryRun) {
            const preview = await this.withCurrentUpdate(uid, args, changes, false);
            await this.authorize(uid, args.projectId);
            return {
                saved: false,
                applied: false,
                replayed: false,
                projectId: args.projectId,
                kanbanId: args.kanbanId,
                wouldChange: preview.changed,
                candidateChanges: exactSupplied(changes),
                projection: { evaluated: false },
            };
        }
        const key = JSON.stringify(["update_kanban", uid, args.projectId, args.kanbanId, args.operationId]);
        const fingerprint = canonicalFingerprint({ observationToken: args.observationToken, changes });
        return this.applyReplay(uid, args.projectId, key, fingerprint, async () => {
            try {
                const result = await this.withCurrentUpdate(uid, args, changes, true);
                return {
                    status: "saved" as const,
                    value: {
                        saved: true,
                        applied: result.changed,
                        replayed: false,
                        projectId: args.projectId,
                        kanbanId: args.kanbanId,
                        acceptedChanges: exactSupplied(changes),
                        projection: { evaluated: false },
                    },
                };
            } catch (error) {
                if (error instanceof McpEffectError && error.effect.applied === null) {
                    return {
                        status: "unknown" as const,
                        projectId: args.projectId,
                        kanbanId: args.kanbanId,
                        reason: String(error.debug?.reason ?? "Persistence acknowledgement failed"),
                    };
                }
                throw error;
            }
        });
    }

    private async createAttempt(uid: string, projectId: string, settings: KanbanSettingsPatch): Promise<Receipt> {
        if (!this.storeDocument) {
            throw new McpReadError("internal_failure", "Project persistence is unavailable", { effect: "none" });
        }
        const room = `projects/${projectId}`;
        const connection = await openLiveRoom(this.host, room, uid, { effect: "none" });
        let kanbanId = "";
        try {
            await this.authorize(uid, projectId);
            const doc = connection.document as unknown as Y.Doc;
            if (!isLiveRoom(this.host, room, doc)) {
                throw new McpReadError("internal_failure", "Project room was unloaded", { effect: "none" });
            }
            do kanbanId = crypto.randomUUID(); while (getKanbanDefinitionTarget(doc as never, kanbanId));
            createKanbanEntry(doc as never, kanbanId, settings);
            const accepted = readKanbanSettings(getKanbanDefinitionTarget(doc as never, kanbanId)!.entry);
            try {
                await this.storeDocument(room, doc);
                return {
                    status: "saved",
                    value: {
                        saved: true,
                        applied: true,
                        replayed: false,
                        projectId,
                        kanbanId,
                        settings: accepted,
                        projection: { evaluated: false },
                    },
                };
            } catch (error) {
                return { status: "unknown", projectId, kanbanId, reason: String(error) };
            }
        } finally {
            await closeLiveRoom(this.host, connection).catch(() => {});
        }
    }

    private async withCurrentUpdate(
        uid: string,
        args: UpdateKanbanArgs,
        changes: KanbanSettingsPatch,
        apply: boolean,
    ): Promise<{ changed: boolean; }> {
        if (apply && !this.storeDocument) {
            throw new McpReadError("internal_failure", "Project persistence is unavailable", { effect: "none" });
        }
        const guard = this.acquire(uid, args.projectId, args.observationToken);
        const room = `projects/${args.projectId}`;
        const connection = await openLiveRoom(this.host, room, uid, { effect: "none" });
        let published = false;
        try {
            await this.authorize(uid, args.projectId);
            const doc = connection.document as unknown as Y.Doc;
            if (!isLiveRoom(this.host, room, doc)) {
                throw new McpReadError("internal_failure", "Project room was unloaded", { effect: "none" });
            }
            try {
                guard.assertCurrent({
                    kind: "definition",
                    kanbanId: args.kanbanId,
                    keys: Object.keys(changes) as KanbanDefinitionKey[],
                });
            } catch (error) {
                if (error instanceof KanbanObservationError) {
                    throw new McpReadError("stale_revision", "The Kanban observation is no longer current", {
                        effect: "none",
                        reason: error.code,
                    });
                }
                throw error;
            }
            const target = getKanbanDefinitionTarget(doc as never, args.kanbanId);
            if (!target) throw new McpReadError("not_found", "Kanban not found", { effect: "none" });
            const changed = willKanbanUpdateChange(target.entry, changes);
            if (!apply) return { changed };
            if (!changed) {
                // A saved receipt certifies the currently accepted Project state,
                // even though no Yjs update was necessary.
                await this.storeDocument!(room, doc);
                return { changed: false };
            }
            published = applyKanbanUpdates(target, changes);
            try {
                await this.storeDocument!(room, doc);
                return { changed: published };
            } catch (error) {
                throw new McpEffectError("internal_failure", "The Kanban update outcome is unknown", {
                    applied: null,
                    reason: String(error),
                }, { applied: null, replayed: false });
            }
        } catch (error) {
            if (published && !(error instanceof McpEffectError)) {
                throw new McpEffectError(
                    "internal_failure",
                    "The Kanban update outcome is unknown",
                    { applied: null },
                    { applied: null, replayed: false },
                );
            }
            throw error;
        } finally {
            guard.release();
            await closeLiveRoom(this.host, connection).catch(() => {});
        }
    }

    private acquire(uid: string, projectId: string, token: string) {
        try {
            return this.observations.acquire(uid, projectId, token);
        } catch (error) {
            if (error instanceof KanbanObservationError) {
                throw new McpReadError("stale_revision", "The Kanban observation is unavailable", {
                    effect: "none",
                    reason: error.code,
                });
            }
            throw error;
        }
    }

    private async applyReplay(
        uid: string,
        projectId: string,
        key: string,
        fingerprint: string,
        attempt: () => Promise<Receipt>,
    ): Promise<Record<string, unknown>> {
        let receipt: Receipt;
        let replayed: boolean;
        try {
            ({ result: receipt, replayed } = await this.replay.runChecked(key, fingerprint, attempt));
        } catch (error) {
            await this.authorize(uid, projectId);
            throw error;
        }
        try {
            await this.authorize(uid, projectId);
        } catch {
            const applied = receipt.status === "unknown" ? null : receipt.value.applied === true;
            const kanbanId = receipt.status === "unknown" ? receipt.kanbanId : receipt.value.kanbanId;
            throw new McpEffectError("forbidden", "Project is inaccessible", {}, {
                applied,
                replayed,
                ...(typeof kanbanId === "string" ? { entity: `kanban:${kanbanId}` } : {}),
            });
        }
        if (receipt.status === "unknown") {
            throw new McpEffectError("internal_failure", "The Kanban mutation outcome is unknown", {
                applied: null,
                replayed,
                reason: receipt.reason,
            }, { applied: null, replayed, entity: `kanban:${receipt.kanbanId}` });
        }
        return { ...receipt.value, replayed };
    }

    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch { /* fail closed */ }
        if (!allowed) throw new McpReadError("forbidden", "Project is inaccessible", { effect: "none" });
    }
}
