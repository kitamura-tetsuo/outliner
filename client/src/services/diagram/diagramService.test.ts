import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    createDiagram,
    diagramExists,
    getDiagram,
    getDiagramMap,
    getDiagramSourceYText,
    listDiagrams,
    MERMAID_DIAGRAM_FORMAT,
    observeDiagrams,
    setDiagramSource,
} from "./diagramService";

describe("diagramService (#5310)", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("Diagrams");
    });

    it("creates a Diagram with an empty source, addressable by a stable id", () => {
        const diagramId = createDiagram(project);
        expect(diagramId).toBeDefined();
        expect(getDiagram(project, diagramId)).toEqual({ id: diagramId, format: MERMAID_DIAGRAM_FORMAT, source: "" });
        expect(diagramExists(project, diagramId)).toBe(true);
    });

    it("lists every Diagram, including one with zero occurrences", () => {
        const a = createDiagram(project, { initialSource: "graph TD; A-->B" });
        const b = createDiagram(project);
        expect(listDiagrams(project)).toEqual(
            expect.arrayContaining([
                { id: a, format: MERMAID_DIAGRAM_FORMAT, source: "graph TD; A-->B" },
                { id: b, format: MERMAID_DIAGRAM_FORMAT, source: "" },
            ]),
        );
    });

    it("keeps empty and syntactically invalid source as valid stored content", () => {
        const diagramId = createDiagram(project, { initialSource: "not even close to mermaid syntax {{{" });
        expect(getDiagram(project, diagramId)?.source).toBe("not even close to mermaid syntax {{{");
        setDiagramSource(project, diagramId, "");
        expect(getDiagram(project, diagramId)?.source).toBe("");
    });

    it("mutates the existing Y.Text instance rather than replacing it on a source update", () => {
        const diagramId = createDiagram(project, { initialSource: "graph TD; A-->B" });
        const before = getDiagramSourceYText(project, diagramId);
        setDiagramSource(project, diagramId, "graph TD; A-->C");
        const after = getDiagramSourceYText(project, diagramId);
        expect(after).toBe(before);
        expect(after?.toString()).toBe("graph TD; A-->C");
    });

    it("never fabricates a source for an unknown Diagram id", () => {
        expect(getDiagram(project, "does-not-exist")).toBeUndefined();
        expect(getDiagramSourceYText(project, "does-not-exist")).toBeUndefined();
        expect(() => setDiagramSource(project, "does-not-exist", "x")).toThrow();
    });

    it("stores Diagrams in a project-level registry, not the outline tree", () => {
        createDiagram(project);
        expect(project.diagrams.size).toBe(1);
        expect(project.items.length).toBe(0);
        expect(getDiagramMap(project, [...project.diagrams.keys()][0])).toBeInstanceOf(Y.Map);
    });

    it("notifies observers when a Diagram is created or its source changes", () => {
        let notifications = 0;
        const unobserve = observeDiagrams(project, () => {
            notifications++;
        });
        const diagramId = createDiagram(project);
        expect(notifications).toBeGreaterThan(0);
        const before = notifications;
        setDiagramSource(project, diagramId, "graph TD; A-->B");
        expect(notifications).toBeGreaterThan(before);
        unobserve();
    });
});
