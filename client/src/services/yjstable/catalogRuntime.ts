import type * as Y from "yjs";

import { readSqlCatalog, type SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import { compileSqlEnvironment, type SqlTableSnapshot } from "$shared/services/sqlEnvironmentCompiler";
import { enqueueWrite } from "./pgliteService";
import { quoteIdent } from "./sqlNames";
import type { TableHandles } from "./tableDocs";

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
    private currentBuild: Promise<CatalogRuntimeState>;
    private readonly tables = new Map<string, { handles: TableHandles; unobserve: () => void; }>();

    private readonly updateObserver = () => {
        const descriptor = this.readDescriptor();
        if (descriptor === this.lastObserved) return;
        this.lastObserved = descriptor;
        this.currentBuild = this.rebuild();
    };

    constructor(
        private readonly projectDoc: Y.Doc,
        private readonly projectId: string,
        private readonly pgSchema: string,
    ) {
        this.lastObserved = this.readDescriptor();
        this.projectDoc.on("update", this.updateObserver);
        const initial = readSqlCatalog(this.projectId, this.catalogDoc());
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

    registerTable(handles: TableHandles): () => void {
        if (this.tables.has(handles.tableId)) return () => {};
        const changed = () => {
            if (this.hasCatalogObjects()) this.startBuild();
        };
        handles.schemaText.observe(changed);
        handles.data.observeDeep(changed);
        this.tables.set(handles.tableId, {
            handles,
            unobserve: () => {
                handles.schemaText.unobserve(changed);
                handles.data.unobserveDeep(changed);
            },
        });
        if (this.hasCatalogObjects()) this.startBuild();
        return () => {
            const registered = this.tables.get(handles.tableId);
            if (registered?.handles !== handles) return;
            registered.unobserve();
            this.tables.delete(handles.tableId);
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
        try {
            if (snapshot.objects.length > 0) {
                const compiled = await compileSqlEnvironment({ catalog: snapshot, tables, inspections: [] });
                if (compiled.status === "failed") {
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
                    await db.exec(
                        `DROP SCHEMA IF EXISTS ${quoteIdent(this.pgSchema)} CASCADE; CREATE SCHEMA ${
                            quoteIdent(this.pgSchema)
                        };`,
                    );
                    if (snapshot.objects.length > 0) {
                        await db.exec(
                            `BEGIN; SET LOCAL search_path TO ${quoteIdent(this.pgSchema)}; `
                                + snapshot.objects.map(object => object.source).join(";\n")
                                + "; COMMIT;",
                        );
                    }
                } catch (error) {
                    await db.exec("ROLLBACK").catch(() => {});
                    throw error;
                }
            });
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
