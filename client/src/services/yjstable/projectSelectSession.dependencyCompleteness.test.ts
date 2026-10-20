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
    for (
        const query of [
            "SELECT oid AS oid FROM pg_class LIMIT 1",
            "SELECT id AS id FROM a WHERE EXISTS (SELECT 1 FROM pg_class)",
            "SELECT 1 AS answer",
            "WITH local AS (SELECT id FROM a) SELECT id AS id FROM local",
            "SELECT count(*) AS count FROM a JOIN b ON a.id = b.id",
        ]
    ) {
        it(query, async () => {
            const doc = new Y.Doc();
            for (const name of ["a", "b"]) {
                const handles = getTableHandles(doc, createTable(doc, name, name))!;
                setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY)`);
                addRecord(handles, {}, "same");
            }
            const session = createProjectSelectSession({
                projectDoc: doc,
                query,
                connect: async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} }),
            });
            try {
                // Catalog readiness may replace the initial execution. Await an
                // actual current successful publication, independently of warmup.
                const evidence = await new Promise<ProjectSelectEvidence>((resolve, reject) => {
                    let stop = () => {};
                    const timer = setTimeout(() => {
                        stop();
                        reject(new Error(JSON.stringify(session.state)));
                    }, 20000);
                    stop = session.subscribe(state => {
                        if (state.status === "success") {
                            clearTimeout(timer);
                            stop();
                            resolve(state.evidence);
                        }
                    });
                });
                const unknown = query.includes("pg_class");
                expect(evidence.dependencyStatus).toBe(unknown ? "unknown" : "proven");
                expect(session.isEvidenceCurrent(evidence)).toBe(true);
                const proof = analyzeProjectQueryProvenance(evidence);
                expect(proof.dependencies.status).toBe(evidence.dependencyStatus);
                if (unknown) {
                    expect(proof.status).toBe("unknown");
                    expect(proof.suppliers).toEqual([]);
                    expect(proof.branches).toEqual([]);
                    expect(proof.bareIdSource).toBeUndefined();
                    expect(evidence.sources.map((source) => source.sqlName)).toEqual(
                        query.includes("FROM a") ? ["a"] : [],
                    );
                    expect(evidence.rows.length).toBeGreaterThan(0);
                } else if (query === "SELECT 1 AS answer") {
                    expect(evidence.rows).toEqual([{ answer: 1 }]);
                    expect(proof.dependencies.relations).toEqual([]);
                } else {
                    expect(proof.dependencies.relations.map(source => source.sqlName).sort()).toEqual(
                        query.includes("JOIN") ? ["a", "b"] : ["a"],
                    );
                    expect(proof.status).toBe("unsupported");
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
