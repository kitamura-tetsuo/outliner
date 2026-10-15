import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resolveInsertTarget, validateInsertTargetPreference } from "./insertTargetResolver";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession, type ProjectSelectEvidence } from "./projectSelectSession";
import { createTable, getTableHandles, removeTable, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function table(doc: Y.Doc, name: string, id?: string): string {
    const tableId = createTable(doc, name.toUpperCase(), name, id ? { tableId: id } : undefined);
    setSchemaText(getTableHandles(doc, tableId)!, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value INTEGER)`);
    return tableId;
}

async function fixture(doc: Y.Doc, query: string, preference?: string) {
    const session = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
    const engine = createTableEngineSession({ projectDoc: doc, connect });
    const evidence = await session.runNow();
    expect(evidence).toBeDefined();
    const provenance = analyzeProjectQueryProvenance(evidence!);
    const options = {
        projectDoc: doc,
        evidence: evidence!,
        provenance,
        insertTargetTableId: preference,
        resolveRelation: engine.resolveRelation,
    };
    return {
        evidence: evidence!,
        provenance,
        options,
        resolve: () => resolveInsertTarget(options),
        resolveRelation: engine.resolveRelation,
        dispose: () => {
            session.dispose();
            engine.dispose();
        },
    };
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("INSERT target resolver", { timeout: 30_000 }, () => {
    it("automatically chooses the sole supplier while reporting a stale preference", async () => {
        const doc = new Y.Doc({ guid: "insert-target-single" });
        const a = table(doc, "a");
        const b = table(doc, "b");
        const run = await fixture(doc, "SELECT * FROM a", b);
        try {
            const projectState = Y.encodeStateVector(doc);
            const tableState = Y.encodeStateVector(getTableHandles(doc, a)!.doc);
            expect(await run.resolve()).toEqual({
                mode: "automatic",
                target: { kind: "table", id: a, sqlName: "a", requiresDestination: false },
                preferenceDiagnostic: {
                    code: "not-a-supplier",
                    tableId: b,
                    message: "The saved Table is not a row supplier of the current query",
                },
            });
            expect((await validateInsertTargetPreference(run.options, b)).valid).toBe(false);
            expect((await validateInsertTargetPreference(run.options, undefined)).valid).toBe(true);
            expect(Y.encodeStateVector(doc)).toEqual(projectState);
            expect(Y.encodeStateVector(getTableHandles(doc, a)!.doc)).toEqual(tableState);
        } finally {
            run.dispose();
        }
    });

    it("requires an affirmative permitted choice for UNION ALL regardless of rows or LIMIT", async () => {
        const doc = new Y.Doc({ guid: "insert-target-union" });
        const a = table(doc, "a");
        const b = table(doc, "b");
        const c = table(doc, "c");
        const query = "SELECT * FROM a WHERE false UNION ALL SELECT * FROM b WHERE false LIMIT 0";
        for (
            const [preference, mode, target] of [
                [undefined, "selection-required", undefined],
                [a, "configured", a],
                [b, "configured", b],
                [c, "invalid-selection", undefined],
            ] as const
        ) {
            const run = await fixture(doc, query, preference);
            try {
                const result = await run.resolve();
                expect(result.mode).toBe(mode);
                expect(result.target?.id).toBe(target);
            } finally {
                run.dispose();
            }
        }
    });

    it("uses supplier proof rather than filter-only read dependencies", async () => {
        const doc = new Y.Doc({ guid: "insert-target-exists" });
        const a = table(doc, "a");
        const b = table(doc, "b");
        const run = await fixture(doc, "SELECT a.* FROM a WHERE EXISTS (SELECT 1 FROM b)", b);
        try {
            const result = await run.resolve();
            expect(result.mode).toBe("automatic");
            expect(result.target?.id).toBe(a);
            expect(result.preferenceDiagnostic?.tableId).toBe(b);
        } finally {
            run.dispose();
        }
    });

    it("refuses unsupported and stale execution proof", async () => {
        const doc = new Y.Doc({ guid: "insert-target-proof" });
        table(doc, "a");
        const unsupported = await fixture(doc, "SELECT count(*) FROM a");
        try {
            expect((await unsupported.resolve()).mode).toBe("unsupported");
        } finally {
            unsupported.dispose();
        }
        const current = await fixture(doc, "SELECT * FROM a");
        try {
            const changed: ProjectSelectEvidence = { ...current.evidence, executionGeneration: 999 };
            expect((await resolveInsertTarget({ ...current.options, evidence: changed })).mode).toBe("unavailable");
        } finally {
            current.dispose();
        }
    });

    it("does not resurrect a selected Table by SQL name", async () => {
        const doc = new Y.Doc({ guid: "insert-target-recreated" });
        const oldA = table(doc, "a");
        const b = table(doc, "b");
        const run = await fixture(doc, "SELECT * FROM a UNION ALL SELECT * FROM b", oldA);
        removeTable(doc, oldA);
        const newA = table(doc, "a");
        try {
            const result = await run.resolve();
            expect(newA).not.toBe(oldA);
            expect(result.mode).toBe("unavailable");
            expect(result.target).toBeUndefined();
        } finally {
            run.dispose();
        }
    });

    it("reports provider refusal and a system supplier's real destination requirement", async () => {
        const incapableDoc = new Y.Doc({ guid: "insert-target-incapable" });
        table(incapableDoc, "a");
        const incapable = await fixture(incapableDoc, "SELECT * FROM a");
        try {
            const provider = await incapable.resolveRelation("a");
            Object.defineProperty(provider, "capabilities", { value: { update: true } });
            expect((await incapable.resolve()).mode).toBe("unavailable");
        } finally {
            incapable.dispose();
        }

        const systemDoc = new Y.Doc({ guid: "insert-target-system" });
        const system = await fixture(systemDoc, "SELECT * FROM outline_items");
        try {
            expect(await system.resolve()).toMatchObject({
                mode: "automatic",
                target: {
                    kind: "system",
                    id: "outline_items",
                    sqlName: "outline_items",
                    requiresDestination: true,
                },
            });
        } finally {
            system.dispose();
        }
    });
});
