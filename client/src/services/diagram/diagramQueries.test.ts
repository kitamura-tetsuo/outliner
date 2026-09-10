import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { DiagramAuthorization } from "./diagramAuthorization";
import { readDiagram, readListDiagrams } from "./diagramQueries";
import { createDiagram } from "./diagramService";

function auth(overrides: Partial<DiagramAuthorization["capabilities"]> = {}): DiagramAuthorization {
    return { capabilities: { canRead: true, canWrite: true, ...overrides }, surfaceWritable: true };
}

describe("diagramQueries (#5310, REQ-008)", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("Diagrams");
    });

    it("lists Diagrams when read capability is granted", () => {
        const diagramId = createDiagram(project, { initialSource: "graph TD; A-->B" });
        const result = readListDiagrams(project, auth());
        expect(result).toEqual({ ok: true, data: [{ id: diagramId, format: "mermaid", source: "graph TD; A-->B" }] });
    });

    it("reports denial without exposing Diagram data when read capability is withheld", () => {
        createDiagram(project);
        const result = readListDiagrams(project, auth({ canRead: false }));
        expect(result).toEqual({ ok: false, reason: "capability-denied" });
        expect((result as { data?: unknown; }).data).toBeUndefined();
    });

    it("denies a single Diagram read the same way, even with write granted", () => {
        const diagramId = createDiagram(project);
        const result = readDiagram(project, diagramId, auth({ canRead: false, canWrite: true }));
        expect(result).toEqual({ ok: false, reason: "capability-denied" });
    });

    it("permits a read with write withheld (read-granted/write-withheld case)", () => {
        const diagramId = createDiagram(project);
        const result = readDiagram(project, diagramId, auth({ canRead: true, canWrite: false }));
        expect(result.ok).toBe(true);
    });
});
