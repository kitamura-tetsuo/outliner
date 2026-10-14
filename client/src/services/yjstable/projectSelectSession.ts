// Primary-independent SELECT lifecycle for Project views.
//
// Unlike TableQueryRunnerBase this session has no distinguished Table: it
// resolves only relations named by the SELECT and holds those providers for
// its lifetime.  Results carry the evidence needed by later view layers to
// decide provenance; that evidence deliberately carries no mutation handle.

import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { type CatalogRuntimeState } from "./catalogRuntime";
import { ITEMS_RELATION_NAME } from "./itemsRelation";
import { TableSqlError, toTableSqlError } from "./pgliteService";
import type { RelationEvidence, RelationProvider } from "./relationProvider";
import { projectSchemaName } from "./sqlNames";
import { getTableRegistry } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector, type TableEngineSession } from "./tableEngine";
import { executeGridQuery, REQUERY_DEBOUNCE_MS } from "./tableSyncAdapter";

const logger = getLogger("projectSelectSession");

export interface ProjectSelectColumn {
    name: string;
    /** PostgreSQL type OID. */
    typeId?: number;
}

export interface ProjectSelectEvidence {
    queryId: string;
    queryRevision: number;
    query: string;
    executionGeneration: number;
    catalogGeneration: number;
    catalogRevision?: string;
    sources: RelationEvidence[];
    columns: ProjectSelectColumn[];
    rows: Record<string, unknown>[];
}

export type ProjectSelectState =
    | { status: "loading"; previous?: ProjectSelectEvidence; }
    | { status: "incomplete"; reason: "empty-query"; previous?: ProjectSelectEvidence; }
    | { status: "success"; evidence: ProjectSelectEvidence; }
    | {
        status: "error";
        kind: "sql" | "schema" | "catalog";
        message: string;
        previous?: ProjectSelectEvidence;
    }
    | { status: "unavailable"; relation: string; message: string; previous?: ProjectSelectEvidence; }
    | { status: "disposed"; };

export interface ProjectSelectSession {
    readonly state: ProjectSelectState;
    subscribe(listener: (state: ProjectSelectState) => void): () => void;
    setQuery(query: string): void;
    runNow(): Promise<ProjectSelectEvidence | undefined>;
    dispose(): void;
}

export function createProjectSelectSession(options: {
    projectDoc: Y.Doc;
    projectId?: string;
    query: string;
    requireExplicitAliases?: boolean;
    connect?: TableDocConnector;
}): ProjectSelectSession {
    const engine = createTableEngineSession(options);
    return new ProjectSelectSessionImpl(
        options.projectDoc,
        projectSchemaName(options.projectId),
        engine,
        options.query,
        options.requireExplicitAliases ?? true,
    );
}

class ProjectSelectSessionImpl implements ProjectSelectSession {
    private listeners = new Set<(state: ProjectSelectState) => void>();
    private queryRevision = 1;
    private generation = 0;
    private query: string;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;
    private currentEvidence: ProjectSelectEvidence | undefined;
    private catalog: CatalogRuntimeState = { status: "building" };
    private dependencyProviders = new Map<string, RelationProvider>();
    private dependencyUnsubscribes = new Map<string, () => void>();
    private unsubscribeCatalog: () => void;
    private readonly registryObserver: () => void;
    private _state: ProjectSelectState = { status: "loading" };

    constructor(
        private readonly projectDoc: Y.Doc,
        private readonly pgSchema: string,
        private readonly engine: TableEngineSession,
        query: string,
        private readonly requireExplicitAliases: boolean,
    ) {
        this.query = query;
        let initialCatalog = true;
        this.unsubscribeCatalog = engine.subscribeCatalog(state => {
            this.catalog = state;
            if (initialCatalog) {
                initialCatalog = false;
                return;
            }
            this.invalidate();
        });
        this.registryObserver = () => this.invalidate();
        getTableRegistry(projectDoc).observeDeep(this.registryObserver);
        this.schedule();
    }

    get state(): ProjectSelectState {
        return this._state;
    }

    subscribe(listener: (state: ProjectSelectState) => void): () => void {
        this.listeners.add(listener);
        listener(this._state);
        return () => this.listeners.delete(listener);
    }

    setQuery(query: string): void {
        if (this.disposed || query === this.query) return;
        this.query = query;
        this.queryRevision++;
        this.invalidate();
    }

    private invalidate(): void {
        if (this.disposed) return;
        this.generation++;
        this.publish({ status: "loading", previous: this.currentEvidence });
        this.schedule();
    }

    private schedule(): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.runNow();
        }, REQUERY_DEBOUNCE_MS);
    }

    async runNow(): Promise<ProjectSelectEvidence | undefined> {
        if (this.disposed) return undefined;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        const generation = ++this.generation;
        const revision = this.queryRevision;
        const query = this.query.trim();
        const previous = this.currentEvidence;
        const stale = () => this.disposed || generation !== this.generation || revision !== this.queryRevision;
        if (!query) {
            if (!stale()) this.publish({ status: "incomplete", reason: "empty-query", previous });
            return undefined;
        }
        this.publish({ status: "loading", previous });
        try {
            await this.engine.catalogReady();
            if (stale()) return undefined;

            const names = referencedRelations(query);
            const usedNames = new Set(names);
            const sources: RelationEvidence[] = [];
            for (const name of names) {
                const provider = await this.resolveDependency(name);
                if (stale()) return undefined;
                // A FROM name can be a CTE rather than a Project relation.
                // Let PostgreSQL resolve it; an actually missing source is
                // classified from the authoritative execution error below.
                if (!provider) continue;
                if (provider.evidence) sources.push(provider.evidence);
            }

            const result = await executeGridQuery(query, {
                pgSchema: this.pgSchema,
                registry: {
                    resolveRelation: name => {
                        usedNames.add(name);
                        return this.resolveDependency(name);
                    },
                },
                isStale: stale,
                requireExplicitAliases: this.requireExplicitAliases,
                includeColumnTypes: true,
            });
            if (stale()) return undefined;
            // executeGridQuery may discover a relation that static FROM
            // extraction did not. Its resolver records that source here.
            for (const name of usedNames) {
                const provider = this.dependencyProviders.get(name);
                if (provider?.evidence && !sources.some(source => source.sqlName === name)) {
                    sources.push(provider.evidence);
                }
            }
            for (const [name, unsubscribe] of this.dependencyUnsubscribes) {
                if (usedNames.has(name)) continue;
                unsubscribe();
                this.dependencyUnsubscribes.delete(name);
            }
            const ready = this.catalog;
            if (ready.status !== "ready") throw new Error("SQL catalog changed during query execution");
            const evidence: ProjectSelectEvidence = {
                queryId: `project-query-${revision}-${generation}`,
                queryRevision: revision,
                query,
                executionGeneration: generation,
                catalogGeneration: ready.generation,
                catalogRevision: ready.snapshot.revision,
                sources,
                columns: result.columns.map((name, index) => ({ name, typeId: result.columnTypes?.[index] })),
                rows: result.rows,
            };
            this.currentEvidence = evidence;
            this.publish({ status: "success", evidence });
            return evidence;
        } catch (error) {
            if (stale()) return undefined;
            const converted = error instanceof TableSqlError ? error : toTableSqlError("query", error);
            const missing = /relation "([^"]+)" does not exist/i.exec(converted.message)?.[1];
            if (missing) {
                this.publish({ status: "unavailable", relation: missing, message: converted.message, previous });
            } else {
                this.publish({
                    status: "error",
                    kind: this.catalog.status === "error" ? "catalog" : converted.kind === "schema" ? "schema" : "sql",
                    message: converted.message,
                    previous,
                });
            }
            logger.debug({ error: converted }, "Project SELECT failed");
            return undefined;
        }
    }

    private async resolveDependency(name: string): Promise<RelationProvider | undefined> {
        const existing = this.dependencyProviders.get(name);
        if (existing) {
            this.observeDependency(name, existing);
            return existing;
        }
        const provider = await this.engine.resolveRelation(name);
        if (!provider) return undefined;
        this.dependencyProviders.set(name, provider);
        this.observeDependency(name, provider);
        return provider;
    }

    private observeDependency(name: string, provider: RelationProvider): void {
        if (provider.subscribeInvalidation && !this.dependencyUnsubscribes.has(name)) {
            this.dependencyUnsubscribes.set(name, provider.subscribeInvalidation(() => this.invalidate()));
        }
    }

    private publish(state: ProjectSelectState): void {
        if (this.disposed && state.status !== "disposed") return;
        this._state = state;
        for (const listener of this.listeners) listener(state);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.generation++;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.unsubscribeCatalog();
        getTableRegistry(this.projectDoc).unobserveDeep(this.registryObserver);
        for (const unsubscribe of this.dependencyUnsubscribes.values()) unsubscribe();
        this.dependencyUnsubscribes.clear();
        this.engine.dispose();
        this.publish({ status: "disposed" });
    }
}

/** Relation positions, including UNION branches and nested EXISTS queries. */
function referencedRelations(query: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const expression = /\b(?:from|join)\s+(?:only\s+)?(?:"((?:[^"]|"")+)"|([a-z_][a-z0-9_$]*))/gi;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(query))) {
        const name = match[1]?.replace(/""/g, '"') ?? match[2]!.toLowerCase();
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    // outline_items is a system relation and can exist in a quoted query.
    if (/\boutline_items\b/i.test(query) && !seen.has(ITEMS_RELATION_NAME)) names.push(ITEMS_RELATION_NAME);
    return names;
}
