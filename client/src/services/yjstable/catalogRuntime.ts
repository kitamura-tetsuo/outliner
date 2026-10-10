import type * as Y from "yjs";

import { readSqlCatalog, type SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import { compileSqlEnvironment, type SqlTableSnapshot } from "$shared/services/sqlEnvironmentCompiler";
import { enqueueWrite } from "./pgliteService";
import { quoteIdent } from "./sqlNames";
import { getTableSqlName, type TableHandles } from "./tableDocs";

export type CatalogRuntimeState =
    | { status: "building"; revision?: string; }
    | { status: "ready"; snapshot: SqlCatalogSnapshot; generation: number; }
    | { status: "error"; message: string; revision?: string; };

type Listener = (state: CatalogRuntimeState) => void;

/**
 * Project-scoped owner of the catalog objects installed in the shared PGlite
 * schema. It deliberately publishes a generation only after the complete
 * replacement transaction succeeded and the captured catalog is still the
 * document's current catalog.
 */
export class CatalogRuntime {
    private state: CatalogRuntimeState = { status: "building" };
    private readonly listeners = new Set<Listener>();
    private buildGeneration = 0;
    private readyGeneration = 0;
    private disposed = false;
    private lastObserved = "";
    private catalogObjectCount = 0;
    private currentBuild: Promise<CatalogRuntimeState>;
    private readonly tables = new Map<string, { handles: TableHandles; unobserve: () => void; }>();
    private dependentTableIds = new Set<string>();

    private readonly updateObserver = () => {
        const catalog = readSqlCatalog(this.projectId, this.catalogDoc());
        const descriptor = this.readDescriptor();
        if (descriptor === this.lastObserved) return;
        this.lastObserved = descriptor;
        const nextObjectCount = catalog.status === "ready" ? catalog.snapshot.objects.length : 0;
        const catalogRemainedEmpty = this.catalogObjectCount === 0 && nextObjectCount === 0;
        this.catalogObjectCount = nextObjectCount;
        // Legacy projects share this Y.Doc with their Table records. Their
        // catalog revision can therefore advance on an ordinary record edit,
        // but an empty-to-empty transition has no SQL environment to rebuild
        // and must not revoke a multi-cell write between its individual field
        // updates.
        if (catalogRemainedEmpty && catalog.status === "ready") return;
        this.currentBuild = this.rebuild();
    };

    constructor(
        private readonly projectDoc: Y.Doc,
        private readonly projectId: string,
        private readonly pgSchema: string,
        private readonly restoreLiveRelations: () => Promise<void> = async () => {},
    ) {
        this.lastObserved = this.readDescriptor();
        const initial = readSqlCatalog(this.projectId, this.catalogDoc());
        this.catalogObjectCount = initial.status === "ready" ? initial.snapshot.objects.length : 0;
        this.projectDoc.on("update", this.updateObserver);
        if (initial.status === "ready" && initial.snapshot.objects.length === 0) {
            this.state = { status: "ready", snapshot: initial.snapshot, generation: ++this.readyGeneration };
            this.currentBuild = Promise.resolve(this.state);
        } else {
            this.currentBuild = this.rebuild();
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    async ready(): Promise<CatalogRuntimeState> {
        return await this.currentBuild;
    }

    get current(): CatalogRuntimeState {
        return this.state;
    }

    dependsOnTable(tableId: string): boolean {
        return this.dependentTableIds.has(tableId);
    }

    registerTable(handles: TableHandles): () => void {
        const previous = this.tables.get(handles.tableId);
        if (previous?.handles === handles) return () => {};
        // Cache eviction can release the old adapter after a reopened view
        // has registered its successor. Only the latest handles own the
        // captured inputs; the old unregister closure is fenced below.
        previous?.unobserve();
        const schemaChanged = () => {
            if (this.state.status !== "ready" || this.hasCatalogObjects()) this.startBuild();
        };
        const dataChanged = () => {
            // Every registered Table is captured by a replacement, including
            // scalar Tables and the build that removes the last catalog type.
            // A changed input must schedule a successor before the older
            // completion is discarded. Ready scalar Tables still use their
            // normal incremental writes without rebuilding the catalog.
            if (this.state.status !== "ready" || this.dependentTableIds.has(handles.tableId)) {
                this.startBuild();
            }
        };
        handles.schemaText.observe(schemaChanged);
        handles.data.observeDeep(dataChanged);
        this.tables.set(handles.tableId, {
            handles,
            unobserve: () => {
                handles.schemaText.unobserve(schemaChanged);
                handles.data.unobserveDeep(dataChanged);
            },
        });
        if (this.state.status !== "ready" || this.hasCatalogObjects()) this.startBuild();
        return () => {
            const registered = this.tables.get(handles.tableId);
            if (registered?.handles !== handles) return;
            registered.unobserve();
            this.tables.delete(handles.tableId);
            if (this.state.status !== "ready") this.startBuild();
        };
    }

    private hasCatalogObjects(): boolean {
        const catalog = readSqlCatalog(this.projectId, this.catalogDoc());
        return catalog.status === "ready" && catalog.snapshot.objects.length > 0;
    }

    private startBuild(): void {
        this.currentBuild = this.rebuild();
    }

    private tableSnapshots(): SqlTableSnapshot[] {
        return [...this.tables.values()].map(({ handles }) => ({
            id: handles.tableId,
            schema: handles.schemaText.toString(),
            records: [...handles.data.entries()].map(([id, record]) => ({
                id,
                values: Object.fromEntries(record.entries()),
            })),
        }));
    }

    private readDescriptor(): string {
        const result = readSqlCatalog(this.projectId, this.catalogDoc());
        return result.status === "ready" ? `ready:${result.snapshot.revision}` : JSON.stringify(result);
    }

    private publish(state: CatalogRuntimeState): void {
        this.state = state;
        for (const listener of this.listeners) listener(state);
    }

    private async rebuild(): Promise<CatalogRuntimeState> {
        const token = ++this.buildGeneration;
        const result = readSqlCatalog(this.projectId, this.catalogDoc());
        const revision = result.status === "ready" ? result.snapshot.revision : undefined;
        this.publish({ status: "building", revision });
        if (result.status !== "ready") {
            const state: CatalogRuntimeState = {
                status: "error",
                message: `SQL catalog is ${result.status}: ${"reason" in result ? result.reason : "unavailable"}`,
                revision,
            };
            if (token === this.buildGeneration) this.publish(state);
            return state;
        }

        const snapshot = result.snapshot;
        const tables = this.tableSnapshots();
        const inputIdentity = JSON.stringify([snapshot.revision, tables]);
        let dependentTableIds = new Set<string>();
        try {
            if (snapshot.objects.length > 0) {
                const compiled = await compileSqlEnvironment({ catalog: snapshot, tables, inspections: [] });
                const dependencies = compiled.status === "ready"
                    ? compiled.environment.dependencies
                    : compiled.dependencies;
                dependentTableIds = new Set(
                    dependencies
                        .filter(dependency => dependency.requiredEnums.length > 0)
                        .map(dependency => dependency.referencingId),
                );
                if (compiled.status === "failed") {
                    // A record correction must be able to recover the first
                    // failed build. Dependency discovery is authoritative even
                    // when validation fails, so retain it before reporting the
                    // diagnostic and keep observing those Table records.
                    if (token === this.buildGeneration) this.dependentTableIds = dependentTableIds;
                    throw new Error(compiled.diagnostics.map(diagnostic => diagnostic.message).join("; "));
                }
                await compiled.environment.dispose();
            }
            const beforeInstall = readSqlCatalog(this.projectId, this.catalogDoc());
            if (
                this.disposed || token !== this.buildGeneration || beforeInstall.status !== "ready"
                || JSON.stringify([beforeInstall.snapshot.revision, this.tableSnapshots()]) !== inputIdentity
            ) return this.state;
            await enqueueWrite(async db => {
                try {
                    await db.exec("BEGIN;");
                    await db.exec(`DROP SCHEMA IF EXISTS ${quoteIdent(this.pgSchema)} CASCADE;`);
                    await db.exec(`CREATE SCHEMA ${quoteIdent(this.pgSchema)};`);
                    await db.exec(`SET LOCAL search_path TO ${quoteIdent(this.pgSchema)};`);
                    for (const object of snapshot.objects) await db.exec(object.source);
                    // Reconstruct every captured relation in the same
                    // transaction as the catalog. Replacing an ENUM requires
                    // DROP ... CASCADE, which also removes scalar relations in
                    // the project schema; publishing ready before restoring
                    // them would make an unrelated Table disappear until a
                    // later schema edit or cold restart.
                    for (const table of tables) {
                        const tableName = getTableSqlName(this.projectDoc, table.id);
                        if (!tableName) throw new Error(`SQL name for Table ${table.id} is unavailable`);
                        await db.exec(table.schema);
                        for (const record of table.records) {
                            const columns = Object.keys(record.values);
                            if (columns.length === 0) {
                                await db.exec(`INSERT INTO ${quoteIdent(tableName)} DEFAULT VALUES`);
                                continue;
                            }
                            await db.query(
                                `INSERT INTO ${quoteIdent(tableName)} (${columns.map(quoteIdent).join(",")}) VALUES (${
                                    columns.map((_, index) => `$${index + 1}`).join(",")
                                })`,
                                columns.map(column => record.values[column]),
                            );
                        }
                    }
                    await db.exec("COMMIT;");
                } catch (error) {
                    await db.exec("ROLLBACK").catch(() => {});
                    throw error;
                }
            });
            if (!this.disposed && token === this.buildGeneration) await this.restoreLiveRelations();
        } catch (error) {
            const state: CatalogRuntimeState = {
                status: "error",
                message: error instanceof Error ? error.message : String(error),
                revision: snapshot.revision,
            };
            if (token === this.buildGeneration) this.publish(state);
            return state;
        }

        const latest = readSqlCatalog(this.projectId, this.catalogDoc());
        if (
            this.disposed || token !== this.buildGeneration || latest.status !== "ready"
            || latest.snapshot.revision !== snapshot.revision
            || JSON.stringify([latest.snapshot.revision, this.tableSnapshots()]) !== inputIdentity
        ) return this.state;
        const state: CatalogRuntimeState = {
            status: "ready",
            snapshot,
            generation: ++this.readyGeneration,
        };
        this.dependentTableIds = dependentTableIds;
        this.publish(state);
        return state;
    }

    private catalogDoc(): Parameters<typeof readSqlCatalog>[1] {
        return this.projectDoc as unknown as Parameters<typeof readSqlCatalog>[1];
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.buildGeneration++;
        this.projectDoc.off("update", this.updateObserver);
        for (const table of this.tables.values()) table.unobserve();
        this.tables.clear();
        this.listeners.clear();
    }
}
