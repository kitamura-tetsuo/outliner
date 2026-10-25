import { randomBytes } from "node:crypto";
import * as Y from "yjs";
import { closeLiveRoom, type DirectConnection, type LiveRoomHost } from "./live-room.js";

export const KANBAN_OBSERVATION_TTL_MS = 5 * 60_000;
export const KANBAN_OBSERVATION_LIMITS = {
    perOwnerProject: 64,
    tokens: 512,
    leases: 2_048,
    scopesPerToken: 50_000,
    scopes: 100_000,
} as const;

export type KanbanDefinitionKey =
    | "name"
    | "query"
    | "groupField"
    | "titleField"
    | "detailFields"
    | "laneOrder";

export interface KanbanObservationLease {
    readonly projectDoc: Y.Doc;
    readonly rooms: readonly { readonly room: string; readonly doc: Y.Doc; }[];
    release(): Promise<void>;
}

/**
 * Transfer already-open production direct connections into an observation.
 * No room is opened or reconstructed here. Release remains orphan-safe when a
 * serving-room incarnation is replaced while the observation is retained.
 */
export function adoptKanbanObservationLease(
    host: LiveRoomHost,
    projectConnection: DirectConnection,
    additionalConnections: readonly DirectConnection[] = [],
): KanbanObservationLease {
    const connections = [projectConnection, ...additionalConnections];
    const documents = connections.map(connection => connection.document as unknown as Y.Doc);
    let released = false;
    return {
        projectDoc: documents[0]!,
        rooms: documents.map((doc, index) => ({
            room: (connections[index]!.document as unknown as { name: string; }).name,
            doc,
        })),
        async release() {
            if (released) return;
            released = true;
            await Promise.all(connections.map(connection => closeLiveRoom(host, connection)));
        },
    };
}

export interface DefinitionObservationCapture {
    readonly target: { readonly projectDoc: Y.Doc; readonly entry: Y.Map<unknown>; };
    readonly keys: readonly KanbanDefinitionKey[];
}

export interface MapFieldObservationCapture {
    readonly scopeId: string;
    readonly owner: Y.Map<unknown>;
    readonly field: string;
    /** Registry/row container identity, when the owner is itself replaceable. */
    readonly container?: Y.Map<unknown>;
    readonly containerKey?: string;
    readonly resolveOwner?: () => Y.Map<unknown> | undefined;
    /** Coupled physical slots (for example outline start and allDay). */
    readonly coupledFields?: readonly string[];
    /** Additional exact map entries on which this field's effective schema depends. */
    readonly dependencies?: readonly {
        readonly owner: Y.Map<unknown>;
        readonly fields: readonly string[];
        readonly container?: Y.Map<unknown>;
        readonly containerKey?: string;
    }[];
    /** Exact live source-schema texts used to establish the effective field. */
    readonly schemaTexts?: readonly Y.Text[];
}

export interface PlacementObservationCapture {
    readonly placementId: string;
    /** Actual attached ordered-tree lookup; it must throw or return undefined for a missing node. */
    readonly resolveValue?: () => Y.Map<unknown> | undefined;
    /** Legacy map-shaped registries remain usable for non-tree placements. */
    readonly registry?: Y.Map<unknown>;
    readonly value: Y.Map<unknown>;
}

export interface KanbanObservationCapture {
    readonly uid: string;
    readonly projectId: string;
    readonly kanbanId: string;
    readonly lease: KanbanObservationLease;
    readonly definition?: DefinitionObservationCapture;
    readonly tableFields?: readonly MapFieldObservationCapture[];
    readonly outlineFields?: readonly MapFieldObservationCapture[];
    readonly placements?: readonly PlacementObservationCapture[];
}

export type KanbanObservationSelection =
    | { readonly kind: "definition"; readonly kanbanId: string; readonly keys: readonly KanbanDefinitionKey[]; }
    | { readonly kind: "table-field" | "outline-field"; readonly kanbanId: string; readonly scopeId: string; }
    | { readonly kind: "placement"; readonly kanbanId: string; readonly placementId: string; };

export type KanbanCaptureResult =
    | { readonly available: true; readonly observationToken: string; readonly expiresAt: string; }
    | { readonly available: false; readonly reason: "capacity" | "source_unavailable"; };

export type KanbanObservationErrorCode =
    | "observation_expired"
    | "observation_unavailable"
    | "observation_changed"
    | "scope_not_observed";

export class KanbanObservationError extends Error {
    constructor(readonly code: KanbanObservationErrorCode) {
        super(code);
        this.name = "KanbanObservationError";
    }
}

export interface KanbanObservationGuard {
    assertCurrent(selection: KanbanObservationSelection): void;
    release(): void;
}

interface Watch {
    readonly key: string;
    readonly current: () => boolean;
    readonly dispose: () => void;
    changed: boolean;
}

interface RecordState {
    readonly token: string;
    readonly uid: string;
    readonly projectId: string;
    readonly kanbanId: string;
    readonly lease: KanbanObservationLease;
    readonly watches: Map<string, Watch>;
    readonly deadline: number;
    readonly timer: ReturnType<typeof setTimeout>;
    released: boolean;
}

export interface KanbanObservationServiceOptions {
    readonly now?: () => number;
    readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
    readonly ttlMs?: number;
    readonly limits?: Partial<typeof KANBAN_OBSERVATION_LIMITS>;
    readonly onCleanupError?: (error: unknown) => void;
}

/**
 * Process-local, live-Yjs observation authority. Successful capture transfers
 * ownership of the supplied lease; every unsuccessful capture leaves it with
 * the caller. Tokens are evidence only and never replace access checks.
 */
export class KanbanObservationService {
    private readonly records = new Map<string, RecordState>();
    private readonly instanceId = randomBytes(16).toString("base64url");
    private readonly now: () => number;
    private readonly setTimer: NonNullable<KanbanObservationServiceOptions["setTimer"]>;
    private readonly clearTimer: NonNullable<KanbanObservationServiceOptions["clearTimer"]>;
    private readonly ttlMs: number;
    private readonly limits: typeof KANBAN_OBSERVATION_LIMITS;
    private scopeCount = 0;
    private leaseCount = 0;
    private disposed = false;

    constructor(private readonly host: LiveRoomHost, private readonly options: KanbanObservationServiceOptions = {}) {
        this.now = options.now ?? (() => performance.now());
        this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
        this.clearTimer = options.clearTimer ?? clearTimeout;
        this.ttlMs = options.ttlMs ?? KANBAN_OBSERVATION_TTL_MS;
        this.limits = { ...KANBAN_OBSERVATION_LIMITS, ...options.limits };
    }

    capture(input: KanbanObservationCapture): KanbanCaptureResult {
        if (this.disposed || !this.captureSourceIsLive(input)) {
            return { available: false, reason: "source_unavailable" };
        }
        const scopeCount = countScopes(input);
        const ownerCount =
            [...this.records.values()].filter(record =>
                record.uid === input.uid && record.projectId === input.projectId
            ).length;
        if (
            ownerCount >= this.limits.perOwnerProject || this.records.size >= this.limits.tokens
            || this.leaseCount + input.lease.rooms.length > this.limits.leases
            || scopeCount > this.limits.scopesPerToken || this.scopeCount + scopeCount > this.limits.scopes
        ) return { available: false, reason: "capacity" };

        const watches = this.createWatches(input);
        if (!watches) return { available: false, reason: "source_unavailable" };
        const token = `${this.instanceId}.${randomBytes(24).toString("base64url")}`;
        const deadline = this.now() + this.ttlMs;
        const record = {} as RecordState;
        Object.assign(record, {
            token,
            uid: input.uid,
            projectId: input.projectId,
            kanbanId: input.kanbanId,
            lease: input.lease,
            watches,
            deadline,
            released: false,
            timer: this.setTimer(() => void this.retire(record), this.ttlMs),
        });
        this.records.set(token, record);
        this.scopeCount += watches.size;
        this.leaseCount += input.lease.rooms.length;
        return { available: true, observationToken: token, expiresAt: new Date(Date.now() + this.ttlMs).toISOString() };
    }

    acquire(uid: string, projectId: string, observationToken: string): KanbanObservationGuard {
        const record = this.records.get(observationToken);
        if (!record || record.uid !== uid || record.projectId !== projectId) {
            throw new KanbanObservationError("observation_unavailable");
        }
        this.assertRecordLive(record);
        let borrowed = true;
        return {
            assertCurrent: selection => {
                if (!borrowed) throw new KanbanObservationError("observation_unavailable");
                this.assertSelection(record, selection);
            },
            release: () => {
                borrowed = false;
            },
        };
    }

    async release(observationToken: string): Promise<void> {
        const record = this.records.get(observationToken);
        if (record) await this.retire(record);
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        await Promise.all([...this.records.values()].map(record => this.retire(record)));
    }

    private captureSourceIsLive(input: KanbanObservationCapture): boolean {
        if (input.definition && input.lease.projectDoc !== input.definition.target.projectDoc) return false;
        return input.lease.rooms.every(({ room, doc }) => this.host.documents.get(room) === (doc as unknown));
    }

    private createWatches(input: KanbanObservationCapture): Map<string, Watch> | undefined {
        const watches = new Map<string, Watch>();
        const fieldCaptures = [...input.tableFields ?? [], ...input.outlineFields ?? []];
        if (
            fieldCaptures.some(capture =>
                !capture.owner.doc
                || capture.dependencies?.some(dependency =>
                    !dependency.owner.doc
                    || (dependency.container && dependency.containerKey !== undefined
                        && dependency.container.get(dependency.containerKey) !== dependency.owner)
                )
                || capture.schemaTexts?.some(text => !text.doc)
            )
        ) return undefined;
        if (input.definition) {
            const { target, keys } = input.definition;
            const registry = target.projectDoc.getMap<Y.Map<unknown>>("yjsKanbans");
            if (registry.get(input.kanbanId) !== target.entry) return undefined;
            watches.set(
                "definition",
                observeMap(registry, input.kanbanId, () => registry.get(input.kanbanId) === target.entry, false),
            );
            for (const key of new Set(keys)) watches.set(`definition:${key}`, observeMap(target.entry, key));
        }
        for (
            const [kind, captures] of [["table-field", input.tableFields], [
                "outline-field",
                input.outlineFields,
            ]] as const
        ) {
            for (const capture of captures ?? []) {
                const prefix = `${kind}:${capture.scopeId}`;
                const identity = capture.resolveOwner
                    ? () => capture.resolveOwner?.() === capture.owner
                    : capture.container && capture.containerKey !== undefined
                    ? () => capture.container?.get(capture.containerKey as string) === capture.owner
                    : undefined;
                watches.set(prefix, observeMap(capture.owner, capture.field, identity));
                for (const field of new Set(capture.coupledFields ?? [])) {
                    watches.set(`${prefix}:coupled:${field}`, observeMap(capture.owner, field, identity));
                }
                capture.dependencies?.forEach((dependency, index) => {
                    const dependencyIdentity = dependency.container && dependency.containerKey !== undefined
                        ? () => dependency.container?.get(dependency.containerKey as string) === dependency.owner
                        : undefined;
                    for (const field of dependency.fields) {
                        watches.set(
                            `${prefix}:dependency:${index}:${field}`,
                            observeMap(dependency.owner, field, dependencyIdentity),
                        );
                    }
                });
                capture.schemaTexts?.forEach((text, index) => {
                    watches.set(`${prefix}:schema:${index}`, observeText(text));
                });
            }
        }
        for (const placement of input.placements ?? []) {
            const resolve = placement.resolveValue
                ?? (() => placement.registry?.get(placement.placementId) as Y.Map<unknown> | undefined);
            if (resolve() !== placement.value || !placement.value.doc) {
                return disposeAndUndefined(watches);
            }
            const prefix = `placement:${placement.placementId}`;
            watches.set(prefix, observeResolvedIdentity(placement.value.doc, placement.value, resolve));
            watches.set(`${prefix}:componentType`, observeMap(placement.value, "componentType"));
            watches.set(`${prefix}:kanbanId`, observeMap(placement.value, "kanbanId"));
        }
        return watches;
    }

    private assertRecordLive(record: RecordState): void {
        if (record.released || this.now() >= record.deadline) {
            void this.retire(record);
            throw new KanbanObservationError("observation_expired");
        }
        if (!record.lease.rooms.every(({ room, doc }) => this.host.documents.get(room) === (doc as unknown))) {
            void this.retire(record);
            throw new KanbanObservationError("observation_unavailable");
        }
    }

    private assertSelection(record: RecordState, selection: KanbanObservationSelection): void {
        this.assertRecordLive(record);
        if (selection.kanbanId !== record.kanbanId) throw new KanbanObservationError("scope_not_observed");
        const keys = selection.kind === "definition"
            ? ["definition", ...new Set(selection.keys).values()].map((key, index) =>
                index === 0 ? key : `definition:${key}`
            )
            : selection.kind === "placement"
            ? [
                `placement:${selection.placementId}`,
                `placement:${selection.placementId}:componentType`,
                `placement:${selection.placementId}:kanbanId`,
            ]
            : [`${selection.kind}:${selection.scopeId}`];
        for (const key of keys) {
            const watch = record.watches.get(key);
            if (!watch) throw new KanbanObservationError("scope_not_observed");
            if (watch.changed || !watch.current()) throw new KanbanObservationError("observation_changed");
        }
        if (selection.kind === "table-field" || selection.kind === "outline-field") {
            const prefix = `${selection.kind}:${selection.scopeId}:dependency:`;
            for (const [key, watch] of record.watches) {
                if (
                    (key.startsWith(prefix)
                        || key.startsWith(`${selection.kind}:${selection.scopeId}:coupled:`)
                        || key.startsWith(`${selection.kind}:${selection.scopeId}:schema:`))
                    && (watch.changed || !watch.current())
                ) {
                    throw new KanbanObservationError("observation_changed");
                }
            }
        }
    }

    private async retire(record: RecordState): Promise<void> {
        if (record.released) return;
        record.released = true;
        this.records.delete(record.token);
        this.clearTimer(record.timer);
        for (const watch of record.watches.values()) watch.dispose();
        this.scopeCount -= record.watches.size;
        this.leaseCount -= record.lease.rooms.length;
        try {
            await record.lease.release();
        } catch (error) {
            this.options.onCleanupError?.(error);
        }
    }
}

function observeMap<T>(
    owner: Y.Map<T>,
    field: string,
    identity = () => owner.doc !== null,
    nested = true,
): Watch {
    const mapListener = (event: Y.YMapEvent<T>) => {
        if (event.keysChanged.has(field)) watch.changed = true;
    };
    const deepListener = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        if (
            events.some(event =>
                (event.target === owner && event instanceof Y.YMapEvent && event.keysChanged.has(field))
                || event.path[0] === field
            )
        ) watch.changed = true;
    };
    const watch: Watch = {
        key: field,
        changed: false,
        current: identity,
        dispose: nested ? () => owner.unobserveDeep(deepListener) : () => owner.unobserve(mapListener),
    };
    if (nested) owner.observeDeep(deepListener);
    else owner.observe(mapListener);
    return watch;
}

function observeText(type: Y.Text): Watch {
    const watch: Watch = {
        key: "type",
        changed: false,
        current: () => type.doc !== null,
        dispose: () => type.unobserve(listener),
    };
    const listener = () => watch.changed = true;
    type.observe(listener);
    return watch;
}

function observeResolvedIdentity(
    doc: Y.Doc,
    value: Y.Map<unknown>,
    resolve: () => Y.Map<unknown> | undefined,
): Watch {
    const current = () => {
        try {
            return resolve() === value;
        } catch {
            return false;
        }
    };
    const watch: Watch = {
        key: "identity",
        changed: false,
        current,
        dispose: () => doc.off("afterTransaction", listener),
    };
    const listener = () => {
        if (!current()) watch.changed = true;
    };
    doc.on("afterTransaction", listener);
    return watch;
}

function disposeAndUndefined(watches: Map<string, Watch>): undefined {
    for (const watch of watches.values()) watch.dispose();
    return undefined;
}

function countScopes(input: KanbanObservationCapture): number {
    let count = input.definition ? 1 + new Set(input.definition.keys).size : 0;
    for (const capture of [...input.tableFields ?? [], ...input.outlineFields ?? []]) {
        count += 1 + new Set(capture.coupledFields ?? []).size
            + new Set(capture.schemaTexts ?? []).size
            + (capture.dependencies?.reduce((sum, dependency) => sum + new Set(dependency.fields).size, 0) ?? 0);
    }
    count += (input.placements?.length ?? 0) * 3;
    return count;
}
