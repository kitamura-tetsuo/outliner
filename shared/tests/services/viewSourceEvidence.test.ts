import { describe, expect, it } from "vitest";
import { resolveInsertTarget } from "../../src/services/insertTargetPolicy";
import {
    analyzeProjectQueryProvenance,
    isProjectQueryProvenanceCurrent,
} from "../../src/services/projectQueryProvenance";
import { describeViewSources } from "../../src/services/viewSourceDiagnostics";
import type { SelectProvenanceEvidence } from "../../src/services/viewSourceEvidence";
const evidence: SelectProvenanceEvidence = {
    queryId: "test",
    queryRevision: 1,
    query: "SELECT id AS id FROM a",
    executionGeneration: 1,
    catalogGeneration: 1,
    dependencyStatus: "proven",
    columns: [{ name: "id" }],
    sources: [{ kind: "table", id: "a-id", sqlName: "a", schemaRevision: "CREATE TABLE a (id TEXT)", columns: ["id"] }],
};
describe("independent dependency completeness and public projection", () => {
    it("fingerprints completeness and withholds all authority from partial evidence", async () => {
        const proof = analyzeProjectQueryProvenance(evidence);
        const partial = { ...evidence, dependencyStatus: "unknown" as const };
        expect(isProjectQueryProvenanceCurrent(proof, partial)).toBe(false);
        const unknown = analyzeProjectQueryProvenance(partial);
        expect(unknown.dependencies).toEqual({ status: "unknown", relations: proof.dependencies.relations });
        expect(unknown).toMatchObject({ status: "unknown", suppliers: [], branches: [] });
        expect(unknown.bareIdSource).toBeUndefined();
        let resolves = 0;
        expect(
            (await resolveInsertTarget({
                evidence: partial,
                provenance: unknown,
                isEvidenceCurrent: () => true,
                resolveLiveInsertCandidate: async () => {
                    resolves++;
                    return undefined;
                },
            })).mode,
        ).toBe("unavailable");
        expect(resolves).toBe(0);
    });
    it("projects every nested identity without exposing schema equality evidence", () => {
        const secret = "schema-sentinel".repeat(10000);
        const full = { ...evidence, sources: evidence.sources.map(source => ({ ...source, schemaRevision: secret })) };
        const proof = analyzeProjectQueryProvenance(full);
        expect(proof.bareIdSource?.schemaRevision).toBe(secret);
        const projected = describeViewSources(full, proof, { mode: "automatic" });
        expect(JSON.stringify(projected)).not.toContain("schemaRevision");
        expect(JSON.stringify(projected)).not.toContain("schema-sentinel");
        expect(JSON.stringify(projected).length).toBeLessThan(2000);
        const changed = {
            ...full,
            sources: full.sources.map(source => ({ ...source, schemaRevision: secret + "changed" })),
        };
        expect(isProjectQueryProvenanceCurrent(proof, changed)).toBe(false);
    });
    it("bounds prose and unverified display claims explicitly after full policy evaluation", () => {
        const full = {
            ...evidence,
            query: `SELECT '${"claim".repeat(1000)}' AS source_kind, id AS source_id FROM a`,
            columns: [{ name: "source_kind" }, { name: "source_id" }],
        };
        const proof = analyzeProjectQueryProvenance(full);
        const result = describeViewSources(full, { ...proof, reason: "reason".repeat(1000) }, {
            mode: "unavailable",
            reason: "reason".repeat(1000),
            preferenceDiagnostic: { code: "unavailable", tableId: "a-id", message: "reason".repeat(1000) },
        });
        for (
            const text of [
                result.provenance.reason,
                result.provenance.branches[0]?.claimedSourceKind,
                result.insert.reason,
                result.insert.preferenceDiagnostic?.message,
            ]
        ) {
            expect(text?.length).toBeLessThanOrEqual(512);
            expect(text).toContain("[truncated]");
        }
    });
});
