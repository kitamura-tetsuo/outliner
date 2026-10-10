import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import {
    readSqlCatalog,
    removeSqlCatalogObject,
    replaceSqlCatalogSource,
    restoreSqlCatalogObject,
    type SqlCatalogSnapshot,
    type SqlCatalogSourceObject,
} from "../../shared/src/services/sqlCatalog.js";
import {
    compileSqlEnvironment,
    type SqlEnvironmentDescriptor,
    type SqlEnvironmentDiagnostic,
    type SqlEnvironmentInput,
    type SqlInspectionTarget,
    type SqlTableSnapshot,
} from "../../shared/src/services/sqlEnvironmentCompiler.js";
import {
    closeLiveRoom,
    type DirectConnection,
    isLiveRoom,
    openLiveRoom,
    releaseWithoutStore,
} from "./mcp/live-room.js";
import { McpReadError } from "./mcp/mcp-error.js";
import type { DocumentStore } from "./persistence.js";

const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,200}$/;
const MUTATION_ORIGIN = "sql-catalog-service";

export type SqlCatalogMutationIntent =
    | { readonly operation: "create"; readonly object: SqlCatalogSourceObject; }
    | { readonly operation: "replace"; readonly object: SqlCatalogSourceObject; }
    | { readonly operation: "delete"; readonly objectId: string; };

export interface SqlCatalogMutationRequest {
    readonly expectedRevision: string;
    readonly intent: SqlCatalogMutationIntent;
}

export type SqlCatalogRefusalReason =
    | "stale"
    | "occupied-id"
    | "missing-object"
    | "invalid-candidate"
    | "referenced"
    | "reference-unknown";

export interface SqlCatalogRefusal {
    readonly status: "refused";
    readonly applied: false;
    readonly reason: SqlCatalogRefusalReason;
    readonly revision: string;
    readonly diagnostics: readonly SqlEnvironmentDiagnostic[];
    readonly affectedObjectIds: readonly string[];
}

export interface SqlCatalogPreview {
    readonly status: "preview";
    readonly applied: false;
    readonly before: SqlCatalogSnapshot;
    readonly after: SqlCatalogSnapshot;
    readonly descriptor: SqlEnvironmentDescriptor;
    readonly affectedObjectIds: readonly string[];
    readonly referenceObjectIds: readonly string[];
}

export type SqlCatalogApplyResult = SqlCatalogRefusal | {
    readonly status: "applied" | "no-op";
    readonly applied: boolean;
    readonly objectIds: readonly string[];
    readonly before: SqlCatalogSnapshot;
    readonly after: SqlCatalogSnapshot;
} | {
    readonly status: "unconfirmed";
    readonly applied: false;
    readonly objectIds: readonly string[];
    readonly before: SqlCatalogSnapshot;
    readonly liveAfter: SqlCatalogSnapshot;
    readonly reason: string;
};

export type SqlCatalogReconciliation = {
    readonly status: "durable-match" | "live-only-match" | "conflict" | "unavailable";
    readonly objectId: string;
    readonly desired: SqlCatalogSourceObject | undefined;
    readonly live?: SqlCatalogSnapshot;
    readonly durable?: SqlCatalogSnapshot;
};

interface CapturedInput {
    readonly input: SqlEnvironmentInput;
    readonly fingerprint: string;
}

export interface SqlCatalogServiceOptions {
    /** Production persistence read seam used to distinguish durable reconciliation. */
    readonly loadStoredDocument?: (room: string) => Promise<Y.Doc | undefined>;
    /** Observable barrier after validation and before final authorization/capture. */
    readonly beforePublication?: () => Promise<void>;
    /** Observable boundary after the source transaction and before durable acknowledgement. */
    readonly afterMutationBeforeStore?: () => Promise<void>;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function catalogOrThrow(projectId: string, doc: Y.Doc): SqlCatalogSnapshot {
    // shared/ is compiled into the server build but owns its package-local
    // Yjs type. Runtime uses the same Y.Doc protocol; avoid coupling this
    // boundary to either workspace's nominal private fields.
    const result = readSqlCatalog(projectId, doc as never);
    if (result.status === "ready") return result.snapshot;
    throw new McpReadError("internal_failure", `Project SQL catalog is ${result.status}: ${result.reason}`);
}

function mapString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) =>
                `${JSON.stringify(key)}:${stable(child)}`
            ).join(",")
        }}`;
    }
    return JSON.stringify(value);
}

function applyIntent(doc: Y.Doc, intent: SqlCatalogMutationIntent): void {
    if (intent.operation === "delete") removeSqlCatalogObject(doc as never, intent.objectId);
    else if (intent.operation === "replace") {
        replaceSqlCatalogSource(doc as never, intent.object.id, intent.object.source);
    } else restoreSqlCatalogObject(doc as never, intent.object);
}

function proposedCatalog(current: SqlCatalogSnapshot, intent: SqlCatalogMutationIntent): SqlCatalogSnapshot {
    const doc = new Y.Doc();
    for (const object of current.objects) restoreSqlCatalogObject(doc as never, object);
    applyIntent(doc, intent);
    return catalogOrThrow(current.projectId, doc);
}

function objectFor(snapshot: SqlCatalogSnapshot, id: string): SqlCatalogSourceObject | undefined {
    return snapshot.objects.find(object => object.id === id);
}

/**
 * Authoritative read/preview/apply boundary for project-owned SQL catalog
 * source. All decisions are made from immutable snapshots and the complete
 * descriptor is compared again immediately before the one-document mutation.
 */
export class SqlCatalogMutationService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection" | "documents">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly storeDocument?: DocumentStore,
        private readonly options: SqlCatalogServiceOptions = {},
    ) {}

    async read(uid: string, projectId: string): Promise<SqlCatalogSnapshot> {
        this.assertProjectId(projectId);
        await this.authorize(uid, projectId);
        const connection = await this.open(projectId, uid);
        try {
            this.assertExisting(connection.document as unknown as Y.Doc);
            return catalogOrThrow(projectId, connection.document as unknown as Y.Doc);
        } finally {
            await closeLiveRoom(this.hocuspocus, connection);
        }
    }

    async validate(
        uid: string,
        projectId: string,
        request: SqlCatalogMutationRequest,
    ): Promise<SqlCatalogPreview | SqlCatalogRefusal> {
        this.validateRequest(projectId, request);
        await this.authorize(uid, projectId);
        const connection = await this.open(projectId, uid);
        try {
            const doc = connection.document as unknown as Y.Doc;
            this.assertExisting(doc);
            let captured: CapturedInput;
            try {
                captured = await this.capture(uid, projectId, doc);
            } catch (error) {
                return this.unknownEvidence(doc, projectId, request, error);
            }
            return await this.preview(captured, request);
        } finally {
            await closeLiveRoom(this.hocuspocus, connection);
        }
    }

    async apply(
        uid: string,
        projectId: string,
        request: SqlCatalogMutationRequest,
    ): Promise<SqlCatalogApplyResult> {
        this.validateRequest(projectId, request);
        await this.authorize(uid, projectId);
        let connection = await this.open(projectId, uid);
        try {
            let doc = connection.document as unknown as Y.Doc;
            this.assertExisting(doc);
            let initiallyCaptured: CapturedInput;
            try {
                initiallyCaptured = await this.capture(uid, projectId, doc);
            } catch (error) {
                return this.unknownEvidence(doc, projectId, request, error);
            }
            const validation = await this.preview(initiallyCaptured, request);
            if (validation.status === "refused") return validation;
            await this.options.beforePublication?.();
            const room = `projects/${projectId}`;
            // A delayed unload may orphan a held Hocuspocus Document while
            // validation is running. Re-authorize and reacquire the room's
            // actual live Document rather than either mutating the orphan or
            // treating this storage lifecycle race as a catalog conflict.
            for (let attempt = 1; attempt <= 3; attempt++) {
                await this.authorize(uid, projectId);
                doc = connection.document as unknown as Y.Doc;
                if (isLiveRoom(this.hocuspocus, room, doc)) break;
                releaseWithoutStore(connection);
                connection = await this.open(projectId, uid);
            }
            doc = connection.document as unknown as Y.Doc;
            if (!isLiveRoom(this.hocuspocus, room, doc)) {
                throw new McpReadError("internal_failure", "Project room could not be held for catalog publication");
            }
            let current: CapturedInput;
            try {
                current = await this.capture(uid, projectId, doc);
            } catch (error) {
                return this.unknownEvidence(doc, projectId, request, error);
            }
            // No await follows this comparison until mutation. A same-server
            // competing request therefore cannot publish against the same input.
            if (current.fingerprint !== initiallyCaptured.fingerprint) {
                return this.refusal(current.input.catalog, "stale", [], this.affected(request.intent));
            }
            const before = current.input.catalog;
            if (before.revision !== request.expectedRevision) {
                return this.refusal(before, "stale", [], this.affected(request.intent));
            }
            if (validation.after.revision === before.revision) {
                return {
                    status: "no-op",
                    applied: false,
                    objectIds: this.affected(request.intent),
                    before,
                    after: before,
                };
            }
            let observerError: unknown;
            try {
                doc.transact(() => applyIntent(doc, request.intent), MUTATION_ORIGIN);
            } catch (error) {
                observerError = error;
            }
            const liveAfter = catalogOrThrow(projectId, doc);
            if (liveAfter.revision !== validation.after.revision) {
                if (observerError) {
                    return {
                        status: "unconfirmed",
                        applied: false,
                        objectIds: this.affected(request.intent),
                        before,
                        liveAfter,
                        reason: messageOf(observerError),
                    };
                }
                throw new McpReadError("internal_failure", "Catalog transaction did not produce the validated source");
            }
            try {
                if (observerError) throw observerError;
                await this.options.afterMutationBeforeStore?.();
                await this.storeDocument?.(`projects/${projectId}`, doc);
                return {
                    status: "applied",
                    applied: true,
                    objectIds: this.affected(request.intent),
                    before,
                    after: liveAfter,
                };
            } catch (error) {
                return {
                    status: "unconfirmed",
                    applied: false,
                    objectIds: this.affected(request.intent),
                    before,
                    liveAfter,
                    reason: messageOf(error),
                };
            }
        } finally {
            await closeLiveRoom(this.hocuspocus, connection);
        }
    }

    async reconcile(
        uid: string,
        projectId: string,
        intended: SqlCatalogSourceObject | { readonly objectId: string; readonly object?: SqlCatalogSourceObject; },
    ): Promise<SqlCatalogReconciliation> {
        this.assertProjectId(projectId);
        const desired = "objectId" in intended ? intended.object : intended;
        const objectId = "objectId" in intended ? intended.objectId : intended.id;
        if (!OBJECT_ID.test(objectId) || desired && desired.id !== objectId) {
            throw new McpReadError("invalid_argument", "Invalid reconciliation object identity");
        }
        if (desired) this.assertObject(desired);
        await this.authorize(uid, projectId);
        let live: SqlCatalogSnapshot;
        try {
            live = await this.read(uid, projectId);
        } catch {
            return { status: "unavailable", objectId, desired };
        }
        const matches = (snapshot: SqlCatalogSnapshot) =>
            desired
                ? stable(objectFor(snapshot, objectId)) === stable(desired)
                : objectFor(snapshot, objectId) === undefined;
        const liveMatch = matches(live);
        if (!this.options.loadStoredDocument) {
            return { status: liveMatch ? "live-only-match" : "unavailable", objectId, desired, live };
        }
        let durable: SqlCatalogSnapshot;
        try {
            const stored = await this.options.loadStoredDocument(`projects/${projectId}`);
            if (!stored) return { status: "unavailable", objectId, desired, live };
            durable = catalogOrThrow(projectId, stored);
        } catch {
            return { status: "unavailable", objectId, desired, live };
        }
        if (matches(live) && matches(durable) && live.revision === durable.revision) {
            return { status: "durable-match", objectId, desired, live, durable };
        }
        if (matches(live)) return { status: "live-only-match", objectId, desired, live, durable };
        return { status: "conflict", objectId, desired, live, durable };
    }

    private async preview(
        captured: CapturedInput,
        request: SqlCatalogMutationRequest,
    ): Promise<SqlCatalogPreview | SqlCatalogRefusal> {
        const before = captured.input.catalog;
        const affected = this.affected(request.intent);
        if (before.revision !== request.expectedRevision) return this.refusal(before, "stale", [], affected);
        const existing = objectFor(before, affected[0]);
        if (request.intent.operation === "create" && existing) {
            return this.refusal(before, "occupied-id", [], affected);
        }
        if (request.intent.operation !== "create" && !existing) {
            return this.refusal(before, "missing-object", [], affected);
        }
        let after: SqlCatalogSnapshot;
        try {
            after = proposedCatalog(before, request.intent);
        } catch (error) {
            return this.refusal(
                before,
                "invalid-candidate",
                [{ kind: "catalog", message: messageOf(error) }],
                affected,
            );
        }
        const currentCompiled = await compileSqlEnvironment(captured.input);
        if (currentCompiled.status === "failed") {
            const unknown = currentCompiled.dependencies.some(dependency => dependency.status === "incomplete");
            return this.refusal(
                before,
                unknown ? "reference-unknown" : "invalid-candidate",
                currentCompiled.diagnostics,
                affected,
            );
        }
        const compiled = await compileSqlEnvironment({ ...captured.input, catalog: after });
        if (compiled.status === "failed") {
            await currentCompiled.environment.dispose();
            const unknown = compiled.dependencies.some(dependency => dependency.status === "incomplete");
            return this.refusal(
                before,
                unknown ? "reference-unknown" : "invalid-candidate",
                compiled.diagnostics,
                affected,
            );
        }
        try {
            const previousEnum = currentCompiled.environment.enums.find(metadata => metadata.objectId === affected[0]);
            const candidateEnum = compiled.environment.enums.find(metadata => metadata.objectId === affected[0]);
            const removesLabels = previousEnum !== undefined && candidateEnum !== undefined
                && previousEnum.labels.some(label => !candidateEnum.labels.includes(label));
            const previousReferences = currentCompiled.environment.dependencies
                .filter(dependency => dependency.requiredEnums.some(required => required.objectId === affected[0]))
                .map(dependency => dependency.referencingId);
            if (removesLabels && previousReferences.length > 0) {
                return this.refusal(
                    before,
                    "referenced",
                    [{
                        kind: "dependency",
                        objectId: affected[0],
                        message: `Referenced ENUM labels cannot be removed; referenced by ${
                            previousReferences.join(", ")
                        }`,
                    }],
                    affected,
                );
            }
            const references = compiled.environment.dependencies
                .filter(dependency => dependency.requiredEnums.some(required => affected.includes(required.objectId)))
                .map(dependency => dependency.referencingId);
            return {
                status: "preview",
                applied: false,
                before,
                after,
                descriptor: compiled.environment.descriptor,
                affectedObjectIds: affected,
                referenceObjectIds: [...new Set(references)].sort(),
            };
        } finally {
            await currentCompiled.environment.dispose();
            await compiled.environment.dispose();
        }
    }

    private async capture(uid: string, projectId: string, project: Y.Doc): Promise<CapturedInput> {
        const tables: SqlTableSnapshot[] = [];
        const connections: DirectConnection[] = [];
        try {
            for (const [id, entry] of [...project.getMap<Y.Map<unknown>>("yjsTables").entries()].sort()) {
                if (!(entry instanceof Y.Map)) throw new Error(`Table registry entry is unavailable: ${id}`);
                const connection = await openLiveRoom(
                    this.hocuspocus,
                    `projects/${projectId}/tables/${id}`,
                    uid,
                    { outcome: "not_applied" },
                );
                connections.push(connection);
                const doc = connection.document as unknown as Y.Doc;
                const records = [...doc.getMap<Y.Map<unknown>>("data").entries()].map(([recordId, record]) => ({
                    id: recordId,
                    values: Object.fromEntries(record.entries()),
                }));
                tables.push({ id, schema: doc.getText("schema").toString(), records });
            }
        } catch (error) {
            throw new McpReadError("internal_failure", "Catalog reference evidence is unavailable", {
                outcome: "not_applied",
                cause: messageOf(error),
            });
        } finally {
            for (const connection of connections) await closeLiveRoom(this.hocuspocus, connection).catch(() => {});
        }
        const inspections: SqlInspectionTarget[] = [];
        const collect = (mapName: string, kind: SqlInspectionTarget["kind"], field: string) => {
            project.getMap<Y.Map<unknown>>(mapName).forEach((entry, id) => {
                const sql = entry instanceof Y.Map ? mapString(entry.get(field)) : undefined;
                if (sql === undefined) throw new Error(`${kind} SQL is unavailable: ${id}`);
                inspections.push({ id, kind, sql });
            });
        };
        try {
            collect("yjsGrids", "grid", "query");
            collect("calendars", "calendar", "query");
            collect("schedules", "schedule", "sql");
        } catch (error) {
            throw new McpReadError("internal_failure", "Catalog reference evidence is unavailable", {
                outcome: "not_applied",
                cause: messageOf(error),
            });
        }
        const input = { catalog: catalogOrThrow(projectId, project), tables, inspections };
        return { input, fingerprint: stable(input) };
    }

    private refusal(
        snapshot: SqlCatalogSnapshot,
        reason: SqlCatalogRefusalReason,
        diagnostics: readonly SqlEnvironmentDiagnostic[],
        affectedObjectIds: readonly string[],
    ): SqlCatalogRefusal {
        return {
            status: "refused",
            applied: false,
            reason,
            revision: snapshot.revision,
            diagnostics,
            affectedObjectIds,
        };
    }

    private unknownEvidence(
        doc: Y.Doc,
        projectId: string,
        request: SqlCatalogMutationRequest,
        error: unknown,
    ): SqlCatalogRefusal {
        return this.refusal(
            catalogOrThrow(projectId, doc),
            "reference-unknown",
            [{ kind: "dependency", message: messageOf(error) }],
            this.affected(request.intent),
        );
    }

    private affected(intent: SqlCatalogMutationIntent): string[] {
        return [intent.operation === "delete" ? intent.objectId : intent.object.id];
    }

    private validateRequest(projectId: string, request: SqlCatalogMutationRequest): void {
        this.assertProjectId(projectId);
        if (!request || typeof request !== "object" || typeof request.expectedRevision !== "string") {
            throw new McpReadError("invalid_argument", "A catalog mutation and expected revision are required");
        }
        const intent = request.intent;
        if (!intent || !["create", "replace", "delete"].includes(intent.operation)) {
            throw new McpReadError("invalid_argument", "Invalid catalog mutation operation");
        }
        if (intent.operation === "delete") {
            if (!OBJECT_ID.test(intent.objectId)) {
                throw new McpReadError("invalid_argument", "Invalid catalog object ID");
            }
        } else this.assertObject(intent.object);
    }

    private assertObject(object: SqlCatalogSourceObject): void {
        if (!object || !OBJECT_ID.test(object.id) || object.kind !== "enum" || typeof object.source !== "string") {
            throw new McpReadError("invalid_argument", "Invalid version 1 catalog object");
        }
    }

    private assertProjectId(projectId: string): void {
        if (!PROJECT_ID.test(projectId)) throw new McpReadError("invalid_argument", "Invalid project ID");
    }

    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (!uid || allowed !== true) throw new McpReadError("forbidden", "Project is inaccessible");
    }

    private open(projectId: string, uid: string): Promise<DirectConnection> {
        return openLiveRoom(this.hocuspocus, `projects/${projectId}`, uid, { outcome: "not_applied" });
    }

    private assertExisting(doc: Y.Doc): void {
        if (Y.encodeStateVector(doc).length <= 1) throw new McpReadError("not_found", "Project not found");
    }
}
