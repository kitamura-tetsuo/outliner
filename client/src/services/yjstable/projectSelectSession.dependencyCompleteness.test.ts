import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { analyzeProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
import { resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectEvidence } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";
afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("producer-owned dependency completeness", { timeout: 60000 }, () => {
    const cases = [
        {
            name: "ordinary catalog",
            query: "SELECT oid AS oid FROM pg_class LIMIT 1",
            unknown: true,
            sources: [],
            row: "oid",
            provenance: "unknown",
        },
        {
            name: "partial catalog",
            query: "SELECT id AS id FROM a WHERE EXISTS (SELECT 1 FROM pg_class)",
            unknown: true,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "unknown",
        },
        {
            name: "CR comment catalog",
            query: "SELECT oid AS oid -- comment\rFROM pg_class LIMIT 1",
            unknown: true,
            sources: [],
            row: "oid",
            provenance: "unknown",
        },
        {
            name: "TABLE EXISTS catalog",
            query: "SELECT 1 AS answer WHERE EXISTS (TABLE pg_class)",
            unknown: true,
            sources: [],
            rows: [{ answer: 1 }],
            provenance: "unknown",
        },
        {
            name: "TABLE CTE catalog",
            query: "WITH q AS (TABLE pg_class) SELECT oid AS oid FROM q LIMIT 1",
            unknown: true,
            sources: [],
            row: "oid",
            provenance: "unknown",
        },
        {
            name: "own-name catalog CTE",
            query: "WITH pg_class AS (SELECT oid AS oid FROM pg_class) SELECT oid AS oid FROM pg_class LIMIT 1",
            unknown: true,
            sources: [],
            row: "oid",
            provenance: "unknown",
        },
        {
            name: "CR partial A",
            query: "SELECT a.id AS id FROM a -- comment\rWHERE EXISTS (SELECT 1 AS present FROM pg_class)",
            unknown: true,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "unknown",
        },
        {
            name: "TABLE partial A",
            query: "SELECT a.id AS id FROM a WHERE EXISTS (TABLE pg_class)",
            unknown: true,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "unknown",
        },
        {
            name: "exact constant",
            query: "SELECT 1 AS answer",
            unknown: false,
            sources: [],
            rows: [{ answer: 1 }],
            provenance: "unsupported",
        },
        {
            name: "ordinary admitted Table",
            query: "SELECT id AS id FROM a",
            unknown: false,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "proven",
        },
        {
            name: "known CTE",
            query: "WITH local AS (SELECT id FROM a) SELECT id AS id FROM local",
            unknown: false,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "unsupported",
        },
        {
            name: "known own-name CTE",
            query: "WITH a AS (SELECT id FROM a) SELECT id AS id FROM a",
            unknown: false,
            sources: ["a"],
            rows: [{ id: "same" }],
            provenance: "unsupported",
        },
        {
            name: "known JOIN aggregate",
            query: "SELECT count(*) AS count FROM a JOIN b ON a.id = b.id",
            unknown: false,
            sources: ["a", "b"],
            row: "count",
            provenance: "unsupported",
        },
    ];
    for (const fixture of cases) {
        it(fixture.name, async () => {
            const doc = new Y.Doc();
            const identities = new Map<string, string>();
            for (const name of ["a", "b"]) {
                const id = createTable(doc, name, name);
                identities.set(name, id);
                const handles = getTableHandles(doc, id)!;
                setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY)`);
                addRecord(handles, {}, "same");
            }
            const session = createProjectSelectSession({
                projectDoc: doc,
                query: fixture.query,
                connect: async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} }),
            });
            try {
                // Catalog warmup can replace the initial execution. Require an
                // actual completed publication, then independently check currentness.
                const evidence = await new Promise<ProjectSelectEvidence>((resolve, reject) => {
                    let stop = () => {};
                    let settled = false;
                    const timer = setTimeout(() => {
                        stop();
                        reject(new Error(JSON.stringify(session.state)));
                    }, 20000);
                    stop = session.subscribe(state => {
                        if (state.status === "success") {
                            settled = true;
                            clearTimeout(timer);
                            stop();
                            resolve(state.evidence);
                        }
                    });
                    if (settled) stop();
                });
                expect(session.isEvidenceCurrent(evidence)).toBe(true);
                expect(evidence.rows).toHaveLength(1);
                if (fixture.rows) expect(evidence.rows).toEqual(fixture.rows);
                if (fixture.row) expect(evidence.rows[0]).toHaveProperty(fixture.row);
                expect(evidence.dependencyStatus).toBe(fixture.unknown ? "unknown" : "proven");
                expect(evidence.sources.map(source => ({ kind: source.kind, id: source.id, sqlName: source.sqlName })))
                    .toEqual(fixture.sources.map(name => ({ kind: "table", id: identities.get(name), sqlName: name })));
                const proof = analyzeProjectQueryProvenance(evidence);
                expect(proof.dependencies.status).toBe(evidence.dependencyStatus);
                expect(proof.dependencies.relations.map(source => ({ id: source.id, sqlName: source.sqlName })))
                    .toEqual(fixture.sources.map(name => ({ id: identities.get(name), sqlName: name })));
                expect(proof.status).toBe(fixture.provenance);
                if (fixture.provenance !== "proven") {
                    expect(proof.suppliers).toEqual([]);
                    expect(proof.branches).toEqual([]);
                    expect(proof.bareIdSource).toBeUndefined();
                }
            } finally {
                await session.dispose();
            }
        });
    }
    it("keeps invalid SQL an execution error", async () => {
        const session = createProjectSelectSession({ projectDoc: new Y.Doc(), query: "SELECT broken syntax nonsense" });
        try {
            await new Promise<void>((resolve, reject) => {
                let stop = () => {};
                const timer = setTimeout(() => {
                    stop();
                    reject(new Error("No SQL error publication"));
                }, 20000);
                stop = session.subscribe(state => {
                    if (state.status === "error") {
                        clearTimeout(timer);
                        stop();
                        resolve();
                    }
                });
            });
            expect(session.state.status).toBe("error");
        } finally {
            await session.dispose();
        }
    });
});
