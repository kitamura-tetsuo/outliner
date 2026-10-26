import { randomBytes } from "node:crypto";
import * as Y from "yjs";
import { readSqlCatalog } from "../../../shared/src/services/sqlCatalog.js";
import { compileSqlEnvironment } from "../../../shared/src/services/sqlEnvironmentCompiler.js";
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

export interface SchemaDependencyObservation {
    readonly owner: Y.Map<unknown>;
    readonly fields: readonly string[];
    readonly container?: Y.Map<unknown>;
    readonly containerKey?: string;
}

const effectiveSchemaAuthority = Symbol("KanbanEffectiveSchemaAuthority");

export interface TableEffectiveSchemaObservation {
    readonly tableId: string;
    readonly physicalColumn: string;
    readonly sourceSchema: Y.Text;
    readonly catalogDependencies: readonly SchemaDependencyObservation[];
    readonly [effectiveSchemaAuthority]: true;
}

export type TableCardBindingRole = "title" | "detail" | "group";

export interface TableFieldObservationCapture extends MapFieldObservationCapture {
    /** Provenance established by the production reader; it is retained, not inferred here. */
    readonly sourceRef: {
        readonly kind: string;
        readonly id: string;
        readonly sqlName: string;
        readonly rowId: string;
    };
    readonly outputField: string;
    readonly physicalColumn: string;
    readonly roles: readonly TableCardBindingRole[];
    /** Completed compiler/catalog evidence. An empty dependency list is an established scalar result. */
    readonly effectiveSchema: TableEffectiveSchemaObservation;
    readonly table: {
        readonly projectDoc: Y.Doc;
        readonly registry: Y.Map<unknown>;
        readonly tableId: string;
        readonly entry: Y.Map<unknown>;
        readonly sqlName: string;
        readonly tableDoc: Y.Doc;
    };
}

export type OutlineWritableColumn =
    | "text"
    | "tags"
    | "start_on"
    | "start_at"
    | "all_day"
    | "due"
    | "done"
    | "duration"
    | "rrule"
    | "recurrence_dtstart"
    | "recurrence_timezone";

export interface OutlineFieldObservationCapture {
    readonly scopeId: string;
    readonly owner: Y.Map<unknown>;
    readonly field: OutlineWritableColumn;
    /** Must resolve the attached raw ordered-tree value, never Item.yMap's fallback. */
    readonly resolveOwner: () => Y.Map<unknown> | undefined;
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
    readonly tableFields?: readonly TableFieldObservationCapture[];
    readonly outlineFields?: readonly OutlineFieldObservationCapture[];
    readonly placements?: readonly PlacementObservationCapture[];
}

export type KanbanObservationSelection =
    | { readonly kind: "definition"; readonly kanbanId: string; readonly keys: readonly KanbanDefinitionKey[]; }
    | {
        readonly kind: "table-field";
        readonly kanbanId: string;
        readonly scopeId: string;
        readonly sourceRef: TableFieldObservationCapture["sourceRef"];
        readonly outputField: string;
        readonly physicalColumn: string;
        readonly role: TableCardBindingRole;
    }
    | { readonly kind: "outline-field"; readonly kanbanId: string; readonly scopeId: string; }
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
    readonly tableSelections: Map<string, TableSelectionState>;
    readonly outlineSelections: Map<string, ReadonlySet<string>>;
    readonly roomGenerations: ReadonlyMap<string, number>;
    readonly deadline: number;
    readonly timer: ReturnType<typeof setTimeout>;
    released: boolean;
}

interface TableSelectionState {
    readonly sourceRef: TableFieldObservationCapture["sourceRef"];
    readonly outputField: string;
    readonly physicalColumn: string;
    readonly roles: ReadonlySet<TableCardBindingRole>;
    readonly watchKeys: Set<string>;
}

const OUTLINE_FIELD_SLOTS: Record<OutlineWritableColumn, readonly string[]> = {
    text: ["text", "componentType"],
    tags: ["tags"],
    start_on: ["start", "allDay"],
    start_at: ["start", "allDay"],
    all_day: ["allDay"],
    due: ["due"],
    done: ["done"],
    duration: ["duration"],
    rrule: ["rrule"],
    recurrence_dtstart: ["recurrenceDtstart"],
    recurrence_timezone: ["recurrenceTimezone"],
};

export function isOutlineWritableColumn(field: string): field is OutlineWritableColumn {
    return Object.prototype.hasOwnProperty.call(OUTLINE_FIELD_SLOTS, field);
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
    private readonly objectIds = new WeakMap<object, number>();
    private readonly effectiveSchemaEvidence = new WeakMap<object, { schema: string; catalogRevision: string; }>();
    private nextObjectId = 1;
    private readonly roomGenerations = new Map<string, number>();
    private readonly restoreRoomMonitor: () => void;
    private disposed = false;

    constructor(private readonly host: LiveRoomHost, private readonly options: KanbanObservationServiceOptions = {}) {
        this.now = options.now ?? (() => performance.now());
        this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
        this.clearTimer = options.clearTimer ?? clearTimeout;
        this.ttlMs = options.ttlMs ?? KANBAN_OBSERVATION_TTL_MS;
        this.limits = { ...KANBAN_OBSERVATION_LIMITS, ...options.limits };
        this.restoreRoomMonitor = this.installRoomMonitor();
    }

    async analyzeTableEffectiveSchema(input: {
        readonly projectId: string;
        readonly projectDoc: Y.Doc;
        readonly tableId: string;
        readonly sqlName: string;
        readonly physicalColumn: string;
        readonly sourceSchema: Y.Text;
    }): Promise<TableEffectiveSchemaObservation | undefined> {
        if (!input.sourceSchema.doc) return undefined;
        const catalogRead = readSqlCatalog(input.projectId, input.projectDoc as never);
        if (catalogRead.status !== "ready") return undefined;
        const schema = input.sourceSchema.toString();
        const compiled = await compileSqlEnvironment({
            catalog: catalogRead.snapshot,
            tables: [{ id: input.tableId, schema, records: [] }],
            inspections: [],
        });
        if (compiled.status !== "ready") return undefined;
        const dependency = compiled.environment.dependencies.find(row => row.referencingId === input.tableId);
        let requiredIds: string[] | undefined;
        if (dependency?.status === "complete") {
            const columnType = await compiled.environment.db.query<{
                type_name: string;
                type_kind: string;
                element_type_name: string | null;
                element_type_kind: string | null;
            }>(
                "SELECT t.typname AS type_name, t.typtype AS type_kind, et.typname AS element_type_name, "
                    + "et.typtype AS element_type_kind FROM pg_attribute a "
                    + "JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
                    + "JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_type et ON et.oid=t.typelem "
                    + "WHERE n.nspname='public' AND c.relname=$1 AND a.attname=$2 "
                    + "AND a.attnum>0 AND NOT a.attisdropped",
                [input.sqlName, input.physicalColumn],
            );
            const type = columnType.rows[0];
            if (type) {
                const enumName = type.type_kind === "e" ? type.type_name : undefined;
                if (type.element_type_kind !== "e") {
                    requiredIds = enumName === undefined
                        ? []
                        : compiled.environment.enums.filter(item => item.name === enumName).map(item => item.objectId);
                    if (enumName !== undefined && requiredIds.length !== 1) requiredIds = undefined;
                }
            }
        }
        await compiled.environment.dispose();
        const currentCatalog = readSqlCatalog(input.projectId, input.projectDoc as never);
        if (
            !requiredIds || input.sourceSchema.toString() !== schema
            || currentCatalog.status !== "ready" || currentCatalog.snapshot.revision !== catalogRead.snapshot.revision
        ) return undefined;
        const catalog = requiredIds.length > 0
            ? input.projectDoc.getMap<Y.Map<unknown>>("sqlCatalog")
            : undefined;
        const dependencies: SchemaDependencyObservation[] = [];
        for (const id of new Set(requiredIds)) {
            const owner = catalog?.get(id);
            if (
                !(owner instanceof Y.Map) || typeof owner.get("kind") !== "string"
                || typeof owner.get("source") !== "string"
            ) {
                return undefined;
            }
            dependencies.push({
                owner,
                fields: ["kind", "source"],
                container: catalog as unknown as Y.Map<unknown>,
                containerKey: id,
            });
        }
        const evidence = {
            tableId: input.tableId,
            physicalColumn: input.physicalColumn,
            sourceSchema: input.sourceSchema,
            catalogDependencies: Object.freeze(dependencies),
            [effectiveSchemaAuthority]: true as const,
        };
        this.effectiveSchemaEvidence.set(evidence, { schema, catalogRevision: catalogRead.snapshot.revision });
        return evidence;
    }

    capture(input: KanbanObservationCapture): KanbanCaptureResult {
        if (this.disposed || !this.captureSourceIsLive(input)) {
            return { available: false, reason: "source_unavailable" };
        }
        const ownerCount =
            [...this.records.values()].filter(record =>
                record.uid === input.uid && record.projectId === input.projectId
            ).length;
        if (
            ownerCount >= this.limits.perOwnerProject || this.records.size >= this.limits.tokens
            || this.leaseCount + input.lease.rooms.length > this.limits.leases
        ) return { available: false, reason: "capacity" };

        const tableSelections = this.validateTableCaptures(input);
        if (!tableSelections) return { available: false, reason: "source_unavailable" };
        const outlineSelections = new Map<string, ReadonlySet<string>>();
        const watches = this.createWatches(input, tableSelections, outlineSelections);
        if (!watches) return { available: false, reason: "source_unavailable" };
        const scopeCount = watches.size;
        if (scopeCount > this.limits.scopesPerToken || this.scopeCount + scopeCount > this.limits.scopes) {
            disposeWatches(watches);
            return { available: false, reason: "capacity" };
        }
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
            tableSelections,
            outlineSelections,
            roomGenerations: new Map(input.lease.rooms.map(({ room }) => [room, this.roomGenerations.get(room) ?? 0])),
            deadline,
            released: false,
            timer: this.setTimer(() => void this.retire(record), this.ttlMs),
        });
        this.records.set(token, record);
        this.scopeCount += watches.size;
        this.leaseCount += input.lease.rooms.length;
        return { available: true, observationToken: token, expiresAt: new Date(Date.now() + this.ttlMs).toISOString() };
    }

    private physicalKey(type: string, owner: object, field: string): string {
        let id = this.objectIds.get(owner);
        if (id === undefined) {
            id = this.nextObjectId++;
            this.objectIds.set(owner, id);
        }
        return `${type}:${id}:${field}`;
    }

    private installRoomMonitor(): () => void {
        const documents = this.host.documents as Map<string, unknown>;
        const originalSet = documents.set;
        const originalDelete = documents.delete;
        const generations = this.roomGenerations;
        const lastSeen = new Map(documents);
        const monitoredSet: typeof documents.set = function(this: Map<string, unknown>, room, doc) {
            const previous = lastSeen.get(room);
            if (previous !== undefined && previous !== doc) generations.set(room, (generations.get(room) ?? 0) + 1);
            lastSeen.set(room, doc);
            return originalSet.call(this, room, doc);
        };
        const monitoredDelete: typeof documents.delete = function(this: Map<string, unknown>, room) {
            if (this.has(room)) generations.set(room, (generations.get(room) ?? 0) + 1);
            return originalDelete.call(this, room);
        };
        documents.set = monitoredSet;
        documents.delete = monitoredDelete;
        return () => {
            if (documents.set === monitoredSet) documents.set = originalSet;
            if (documents.delete === monitoredDelete) documents.delete = originalDelete;
        };
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
        this.restoreRoomMonitor();
    }

    private captureSourceIsLive(input: KanbanObservationCapture): boolean {
        if (input.definition && input.lease.projectDoc !== input.definition.target.projectDoc) return false;
        return input.lease.rooms.every(({ room, doc }) => this.host.documents.get(room) === (doc as unknown));
    }

    private createWatches(
        input: KanbanObservationCapture,
        tableSelections: Map<string, TableSelectionState>,
        outlineSelections: Map<string, ReadonlySet<string>>,
    ): Map<string, Watch> | undefined {
        const watches = new Map<string, Watch>();
        if (hasDuplicates(input.outlineFields?.map(capture => capture.scopeId) ?? [])) {
            return disposeAndUndefined(watches);
        }
        if (hasDuplicates(input.placements?.map(capture => capture.placementId) ?? [])) {
            return disposeAndUndefined(watches);
        }
        try {
            return this.registerWatches(input, watches, tableSelections, outlineSelections);
        } catch {
            disposeWatches(watches);
            return undefined;
        }
    }

    private registerWatches(
        input: KanbanObservationCapture,
        watches: Map<string, Watch>,
        tableSelections: Map<string, TableSelectionState>,
        outlineSelections: Map<string, ReadonlySet<string>>,
    ): Map<string, Watch> | undefined {
        const fieldCaptures = input.tableFields ?? [];
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
        ) return disposeAndUndefined(watches);
        if (
            input.outlineFields?.some(capture =>
                !Object.prototype.hasOwnProperty.call(OUTLINE_FIELD_SLOTS, capture.field)
                || !capture.owner.doc
                || safelyResolve(capture.resolveOwner) !== capture.owner
            )
        ) return disposeAndUndefined(watches);
        if (input.definition) {
            const { target, keys } = input.definition;
            const registry = target.projectDoc.getMap<Y.Map<unknown>>("yjsKanbans");
            if (registry.get(input.kanbanId) !== target.entry) return disposeAndUndefined(watches);
            watches.set(
                "definition",
                observeMap(registry, input.kanbanId, () => registry.get(input.kanbanId) === target.entry, false),
            );
            for (const key of new Set(keys)) watches.set(`definition:${key}`, observeMap(target.entry, key));
        }
        for (const capture of input.tableFields ?? []) {
            const selection = tableSelections.get(capture.scopeId)!;
            const add = (key: string, create: () => Watch) => {
                if (!watches.has(key)) watches.set(key, create());
                selection.watchKeys.add(key);
            };
            add(
                this.physicalKey("map", capture.table.registry, capture.table.tableId),
                () =>
                    observeMap(
                        capture.table.registry,
                        capture.table.tableId,
                        () => capture.table.registry.get(capture.table.tableId) === capture.table.entry,
                        false,
                    ),
            );
            add(
                this.physicalKey("map", capture.table.entry, "sqlName"),
                () =>
                    observeMap(
                        capture.table.entry,
                        "sqlName",
                        () => capture.table.entry.get("sqlName") === capture.table.sqlName,
                    ),
            );
            const identity = capture.resolveOwner
                ? () => capture.resolveOwner?.() === capture.owner
                : capture.container && capture.containerKey !== undefined
                ? () => capture.container?.get(capture.containerKey as string) === capture.owner
                : undefined;
            add(
                this.physicalKey("map", capture.owner, capture.field),
                () => observeMap(capture.owner, capture.field, identity),
            );
            capture.effectiveSchema.catalogDependencies.forEach(dependency => {
                const dependencyIdentity = dependency.container && dependency.containerKey !== undefined
                    ? () => dependency.container?.get(dependency.containerKey as string) === dependency.owner
                    : undefined;
                for (const field of dependency.fields) {
                    add(
                        this.physicalKey("map", dependency.owner, field),
                        () => observeMap(dependency.owner, field, dependencyIdentity),
                    );
                }
            });
            add(
                this.physicalKey("text", capture.effectiveSchema.sourceSchema, "content"),
                () => observeText(capture.effectiveSchema.sourceSchema),
            );
        }
        for (const capture of input.outlineFields ?? []) {
            const identity = () => safelyResolve(capture.resolveOwner) === capture.owner;
            const watchKeys = new Set<string>();
            for (const field of OUTLINE_FIELD_SLOTS[capture.field]) {
                const key = this.physicalKey("map", capture.owner, field);
                if (!watches.has(key)) watches.set(key, observeMap(capture.owner, field, identity));
                watchKeys.add(key);
            }
            outlineSelections.set(capture.scopeId, watchKeys);
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

    private validateTableCaptures(input: KanbanObservationCapture): Map<string, TableSelectionState> | undefined {
        const selections = new Map<string, TableSelectionState>();
        for (const capture of input.tableFields ?? []) {
            const { table, sourceRef } = capture;
            const roles = new Set(capture.roles);
            const effectiveSchema = capture.effectiveSchema;
            const evidence = effectiveSchema && this.effectiveSchemaEvidence.get(effectiveSchema);
            const currentCatalog = readSqlCatalog(input.projectId, table.projectDoc as never);
            // A configured title is authoritative when the same output is also
            // listed as a detail field.
            if (roles.has("title")) roles.delete("detail");
            if (
                selections.has(capture.scopeId) || roles.size === 0
                || table.projectDoc !== input.lease.projectDoc
                || table.registry !== table.projectDoc.getMap("yjsTables")
                || table.registry.get(table.tableId) !== table.entry
                || table.entry.get("sqlName") !== table.sqlName
                || !input.lease.rooms.some(room => room.doc === table.tableDoc)
                || sourceRef.id !== table.tableId || sourceRef.sqlName !== table.sqlName
                || sourceRef.rowId !== capture.containerKey
                || capture.physicalColumn !== capture.field
                || capture.container !== table.tableDoc.getMap("data")
                || capture.owner.doc !== table.tableDoc
                || capture.container.get(capture.containerKey) !== capture.owner
                || !effectiveSchema
                || !evidence
                || effectiveSchema.sourceSchema.toString() !== evidence.schema
                || currentCatalog.status !== "ready" || currentCatalog.snapshot.revision !== evidence.catalogRevision
                || effectiveSchema.tableId !== table.tableId
                || effectiveSchema.physicalColumn !== capture.physicalColumn
                || effectiveSchema.sourceSchema !== table.tableDoc.getText("schema")
                || !effectiveSchema.sourceSchema.doc
                || effectiveSchema.catalogDependencies.some(dependency =>
                    dependency.container !== table.projectDoc.getMap("sqlCatalog")
                    || dependency.containerKey === undefined
                    || dependency.container.get(dependency.containerKey) !== dependency.owner
                    || !dependency.owner.doc
                    || !dependency.fields.includes("kind")
                    || !dependency.fields.includes("source")
                )
            ) return undefined;
            selections.set(capture.scopeId, {
                sourceRef: { ...sourceRef },
                outputField: capture.outputField,
                physicalColumn: capture.physicalColumn,
                roles,
                watchKeys: new Set(),
            });
        }
        return selections;
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
        if (
            [...record.roomGenerations].some(([room, generation]) =>
                (this.roomGenerations.get(room) ?? 0) !== generation
            )
        ) {
            void this.retire(record);
            throw new KanbanObservationError("observation_unavailable");
        }
    }

    private assertSelection(record: RecordState, selection: KanbanObservationSelection): void {
        this.assertRecordLive(record);
        if (selection.kanbanId !== record.kanbanId) throw new KanbanObservationError("scope_not_observed");
        if (selection.kind === "table-field") {
            const retained = record.tableSelections.get(selection.scopeId);
            if (
                !retained || !retained.roles.has(selection.role)
                || retained.outputField !== selection.outputField
                || retained.physicalColumn !== selection.physicalColumn
                || !sameSourceRef(retained.sourceRef, selection.sourceRef)
            ) throw new KanbanObservationError("scope_not_observed");
            for (const key of retained.watchKeys) {
                const watch = record.watches.get(key)!;
                if (watch.changed || !watch.current()) throw new KanbanObservationError("observation_changed");
            }
            return;
        }
        if (selection.kind === "outline-field") {
            const watchKeys = record.outlineSelections.get(selection.scopeId);
            if (!watchKeys) throw new KanbanObservationError("scope_not_observed");
            for (const key of watchKeys) {
                const watch = record.watches.get(key)!;
                if (watch.changed || !watch.current()) throw new KanbanObservationError("observation_changed");
            }
            return;
        }
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
            : [];
        for (const key of keys) {
            const watch = record.watches.get(key);
            if (!watch) throw new KanbanObservationError("scope_not_observed");
            if (watch.changed || !watch.current()) throw new KanbanObservationError("observation_changed");
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
    const capturedValue = owner.get(field);
    const captured = snapshotValue(capturedValue);
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
        current: () =>
            identity()
            && (!nested
                || (!transactionTouches(owner, field, capturedValue)
                    && sameCapturedValue(owner.get(field), capturedValue, captured))),
        dispose: nested ? () => owner.unobserveDeep(deepListener) : () => owner.unobserve(mapListener),
    };
    if (nested) owner.observeDeep(deepListener);
    else owner.observe(mapListener);
    return watch;
}

function transactionTouches<T>(owner: Y.Map<T>, field: string, capturedValue: unknown): boolean {
    const transaction = (owner.doc as unknown as {
        _transaction?: { changed: Map<Y.AbstractType<unknown>, Set<string | null>>; };
    } | null)?._transaction;
    if (!transaction) return false;
    const ownerChanges = transaction.changed.get(owner as unknown as Y.AbstractType<unknown>);
    if (ownerChanges?.has(field)) return true;
    return capturedValue instanceof Y.AbstractType && transaction.changed.has(capturedValue);
}

function sameCapturedValue(current: unknown, capturedValue: unknown, capturedSnapshot: string): boolean {
    if (capturedValue instanceof Y.AbstractType && current !== capturedValue) return false;
    return snapshotValue(current) === capturedSnapshot;
}

function observeText(type: Y.Text): Watch {
    const captured = type.toString();
    const watch: Watch = {
        key: "type",
        changed: false,
        current: () => type.doc !== null && type.toString() === captured,
        dispose: () => type.unobserve(listener),
    };
    const listener = () => watch.changed = true;
    type.observe(listener);
    return watch;
}

function snapshotValue(value: unknown): string {
    if (value instanceof Y.AbstractType) return JSON.stringify(value.toJSON()) ?? "undefined";
    return JSON.stringify(value) ?? "undefined";
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
    disposeWatches(watches);
    return undefined;
}

function disposeWatches(watches: Map<string, Watch>): void {
    for (const watch of watches.values()) watch.dispose();
}

function sameSourceRef(
    left: TableFieldObservationCapture["sourceRef"],
    right: TableFieldObservationCapture["sourceRef"],
): boolean {
    return left.kind === right.kind && left.id === right.id && left.sqlName === right.sqlName
        && left.rowId === right.rowId;
}

function safelyResolve(resolve: () => Y.Map<unknown> | undefined): Y.Map<unknown> | undefined {
    try {
        return resolve();
    } catch {
        return undefined;
    }
}

function hasDuplicates(values: readonly string[]): boolean {
    return new Set(values).size !== values.length;
}
