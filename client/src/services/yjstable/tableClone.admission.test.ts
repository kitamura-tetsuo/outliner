import { Project } from "$shared/app-schema";
import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry } from "./gridDocs";
import { enqueueWrite, resetPgliteForTests } from "./pgliteService";
import { exportGridSlice, exportTableStructures, importTableStructures } from "./tableClone";
import { removeTableWithPolicy } from "./tableDependencies";
import { addRecord, createTable, getTableHandles, getTableRegistry, listTables } from "./tableDocs";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
afterAll(resetPgliteForTests);
describe("Table import binding admission", () => {
    it("rechecks earlier created groups and preserves a peer replacement during later validation", async () => {
        const source = Project.createInstance("independent-groups-source");
        const destination = Project.createInstance("independent-groups-destination");
        const make = (project: Project, name: string, options = {}) =>
            createTable(
                project.ydoc,
                name,
                name,
                options,
                h => h.schemaText.insert(0, `CREATE TABLE ${name} (id TEXT PRIMARY KEY)`),
            );
        const a = make(source, "a", { tableId: "first-a" });
        const b = make(source, "b", { tableId: "second-b" });
        const snapshots = exportTableStructures(source.ydoc, [a, b]);
        for (const snapshot of Object.values(snapshots)) delete snapshot.catalog;
        const registry = getTableRegistry(destination.ydoc);
        const entered = deferred();
        const release = deferred();
        let copiedId: string | undefined;
        registry.observe(() => {
            const created = listTables(destination.ydoc).find(t => t.sqlName === "a");
            if (!created || copiedId) return;
            copiedId = created.tableId;
            void enqueueWrite(async () => {
                entered.resolve();
                await release.promise;
            });
        });
        const importing = importTableStructures(destination.ydoc, snapshots, source.ydoc.guid);
        await entered.promise;
        removeTableWithPolicy(destination, copiedId!, "keep-references");
        const replacementId = make(destination, "a", { tableId: copiedId });
        const replacement = registry.get(replacementId);
        release.resolve();
        await expect(importing).rejects.toThrow("binding changed");
        expect(registry.get(replacementId)).toBe(replacement);
        expect(listTables(destination.ydoc).map(t => t.sqlName)).toEqual(["a"]);
        expect(getGridRegistry(destination.ydoc).size).toBe(0);
    });

    for (const intervention of ["delete", "replace", "row edit"] as const) {
        it(`revalidates reused bindings after real queued validation: ${intervention}`, async () => {
            const source = Project.createInstance(`source-${intervention}`);
            const destination = Project.createInstance(`destination-${intervention}`);
            const table = (project: Project, name: string, sqlName: string, options = {}) =>
                createTable(
                    project.ydoc,
                    name,
                    sqlName,
                    options,
                    h => h.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`),
                );
            const a = table(source, "A", "a");
            const b = table(source, "B", "b");
            const unrelated = table(destination, "Unrelated A", "a");
            addRecord(getTableHandles(destination.ydoc, unrelated)!, { id: "unrelated" }, "unrelated");
            const reused = table(destination, "Copied A", "a_2", {
                sourceProjectId: source.ydoc.guid,
                sourceTableId: a,
            });
            const grid = createGrid(source.ydoc, {
                query: "SELECT a.id FROM a JOIN b ON true",
                insertTargetTableId: a,
            });
            const snapshots = exportTableStructures(source.ydoc, [a, b]);
            const entered = deferred();
            const release = deferred();
            const barrier = enqueueWrite(async () => {
                entered.resolve();
                await release.promise;
            });
            await entered.promise;
            // An empty catalog avoids an earlier catalog-compiler await. The
            // import reaches A reuse synchronously, then queues B validation.
            for (const snapshot of Object.values(snapshots)) delete snapshot.catalog;
            const importing = importTableStructures(destination.ydoc, snapshots, source.ydoc.guid, undefined, true, {
                [grid]: exportGridSlice(source.ydoc, grid),
            });
            const registry = getTableRegistry(destination.ydoc);
            const old = registry.get(reused)!;
            if (intervention !== "row edit") {
                removeTableWithPolicy(destination, reused, "keep-references");
                if (intervention === "replace") table(destination, "Peer A", "a_2", { tableId: reused });
            } else addRecord(getTableHandles(destination.ydoc, reused)!, { id: "peer" }, "peer");
            const baseline = registry.get(reused);
            release.resolve();
            await barrier;
            if (intervention === "row edit") {
                const result = await importing;
                expect(result.reusedTableIdMap[a]).toBe(reused);
                const copied = getGridRegistry(destination.ydoc).get(result.gridIdMap[grid])!;
                expect(copied.get("query")).toContain("a_2");
                expect(copied.get("insertTargetTableId")).toBe(reused);
                expect(getTableHandles(destination.ydoc, reused)!.data.has("peer")).toBe(true);
            } else {
                await expect(importing).rejects.toThrow("binding changed");
                expect(getGridRegistry(destination.ydoc).size).toBe(0);
                expect(registry.get(reused)).toBe(baseline);
                expect(registry.get(reused)).not.toBe(old);
                expect(listTables(destination.ydoc).map(t => t.sqlName)).not.toContain("b");
            }
            expect(getTableHandles(destination.ydoc, unrelated)!.data.has("unrelated")).toBe(true);
        });
    }
    for (const replaceFirst of [false, true]) {
        it(`cleans earlier allocations on a later portable guard rejection; replacement=${replaceFirst}`, async () => {
            const source = Project.createInstance("guard-source");
            const destination = Project.createInstance("guard-destination");
            createSqlCatalogObject(source.ydoc, "enum", "CREATE TYPE choice AS ENUM ('a', 'b')");
            const enumId = createSqlCatalogObject(destination.ydoc, "enum", "CREATE TYPE choice AS ENUM ('a', 'b')");
            const ids = ["a", "b"].map(name =>
                createTable(source.ydoc, name, name, { tableId: name }, handles => {
                    handles.schemaText.insert(0, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value choice)`);
                })
            );
            const entered = deferred();
            const release = deferred();
            let firstId: string | undefined;
            const registry = getTableRegistry(destination.ydoc);
            registry.observe(() => {
                const first = listTables(destination.ydoc).find(table => table.sqlName === "a");
                if (!first || firstId) return;
                firstId = first.tableId;
                void enqueueWrite(async () => {
                    entered.resolve();
                    await release.promise;
                });
            });
            const importing = importTableStructures(
                destination.ydoc,
                exportTableStructures(source.ydoc, ids),
                source.ydoc.guid,
            );
            await entered.promise;
            const peer = new Y.Doc();
            Y.applyUpdate(peer, Y.encodeStateAsUpdate(destination.ydoc));
            replaceSqlCatalogSource(peer, enumId, "CREATE TYPE choice AS ENUM ('b', 'a')");
            Y.applyUpdate(destination.ydoc, Y.encodeStateAsUpdate(peer), "peer");
            if (replaceFirst) {
                removeTableWithPolicy(destination, firstId!, "keep-references");
                createTable(destination.ydoc, "Peer a", "a", { tableId: firstId }, h => {
                    h.schemaText.insert(0, "CREATE TABLE a (id TEXT PRIMARY KEY)");
                });
            }
            const replacement = replaceFirst ? registry.get(firstId!) : undefined;
            release.resolve();
            await expect(importing).rejects.toThrow(/ENUM.*incompatible/);
            expect([...registry.keys()]).toEqual(replaceFirst ? [firstId] : []);
            if (replaceFirst) expect(registry.get(firstId!)).toBe(replacement);
            expect(getGridRegistry(destination.ydoc).size).toBe(0);
            expect(destination.ydoc.getMap("sqlCatalog").toJSON()).toEqual(peer.getMap("sqlCatalog").toJSON());
        });
    }
    it("keeps an independent valid group when another returns a recoverable SQL failure", async () => {
        const destination = new Y.Doc();
        const result = await importTableStructures(destination, {
            a: { sourceTableId: "a", name: "A", sqlName: "a", schemaSql: "CREATE TABLE a (id TEXT PRIMARY KEY)" },
            b: { sourceTableId: "b", name: "B", sqlName: "b", schemaSql: "CREATE TABLE b (id no_such_type)" },
        }, "source");
        expect(Object.keys(result.tableIdMap)).toEqual(["a"]);
        expect(result.failedSourceTableIds).toEqual(["b"]);
        expect(listTables(destination).map(table => table.sqlName)).toEqual(["a"]);
        expect(result.outcomes.some(outcome => outcome.type === "failed-group")).toBe(true);
        result.bindings.assertCurrent();
    });
});
