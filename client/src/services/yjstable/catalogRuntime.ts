import type * as Y from "yjs";

import { readSqlCatalog, type SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import { enqueueWrite } from "./pgliteService";
import { quoteIdent } from "./sqlNames";

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
        this.currentBuild = this.rebuild();
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
        try {
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
        this.listeners.clear();
    }
}
