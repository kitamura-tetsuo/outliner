import crypto from "node:crypto";
import { type KanbanLifecycleResult, type OutlinerKanbanLifecycleService } from "./kanban-lifecycle.js";
import { McpEffectError, McpReadError } from "./mcp-error.js";
import { IdempotencyCache } from "./mutation-contract.js";

export type LifecycleToolArgs = {
    projectId: string;
    kanbanId: string;
    observationToken: string;
    operationId: string;
    dryRun?: boolean;
};
type Settled = { status: "known"; result: KanbanLifecycleResult; } | { status: "unknown"; };

export class KanbanLifecycleTools {
    private readonly replay: IdempotencyCache;
    constructor(private readonly domain: OutlinerKanbanLifecycleService, now: () => number = Date.now) {
        this.replay = new IdempotencyCache(now);
    }
    place(
        uid: string,
        args: LifecycleToolArgs & { destination: { pageId: string; layoutId?: string; }; columnSpan?: number; },
    ) {
        return this.run(uid, "place_kanban", args, () => this.domain.place(uid, args));
    }
    remove(uid: string, args: LifecycleToolArgs & { placementId: string; }) {
        return this.run(uid, "remove_kanban_placement", args, () => this.domain.remove(uid, args));
    }
    delete(uid: string, args: LifecycleToolArgs) {
        return this.run(uid, "delete_kanban", args, () => this.domain.delete(uid, args));
    }
    private async run(
        uid: string,
        tool: string,
        args: LifecycleToolArgs,
        attempt: () => Promise<KanbanLifecycleResult>,
    ) {
        assertOperationId(args.operationId);
        await this.domain.authorize(uid, args.projectId);
        if (args.dryRun) return { ...await attempt(), replayed: false };
        const target = "placementId" in args ? (args as LifecycleToolArgs & { placementId: string; }).placementId : "";
        const key = JSON.stringify([tool, uid, args.projectId, args.kanbanId, target, args.operationId]);
        const fingerprint = crypto.createHash("sha256").update(stableStringify(args)).digest("hex");
        const { result: settled, replayed } = await this.replay.runChecked<Settled>(key, fingerprint, async () => {
            try {
                return { status: "known", result: await attempt() };
            } catch (error) {
                if (error instanceof McpReadError && error.debug?.applied === null) return { status: "unknown" };
                throw error;
            }
        });
        try {
            await this.domain.authorize(uid, args.projectId);
        } catch {
            const applied = settled.status === "known" ? settled.result.applied : null;
            throw new McpEffectError("forbidden", "Project is inaccessible", {}, { applied, replayed });
        }
        if (settled.status === "unknown") {
            throw new McpEffectError(
                "internal_failure",
                "Kanban lifecycle outcome is unknown",
                { applied: null, replayed },
                { applied: null, replayed },
            );
        }
        return { ...settled.result, replayed };
    }
}
function assertOperationId(value: string) {
    if (typeof value !== "string" || value.length > 200 || value.trim().length === 0) {
        throw new McpReadError("invalid_argument", "Invalid operationId");
    }
}
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${
            Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) =>
                `${JSON.stringify(k)}:${stableStringify(v)}`
            ).join(",")
        }}`;
    }
    return JSON.stringify(value);
}
