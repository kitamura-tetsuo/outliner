import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { setItemDiagramId } from "./diagramBinding";
import { diagramEditingTarget, registerDiagramOccurrence } from "./diagramEditing";
import { createDiagram, getDiagramSourceYText } from "./diagramService";

describe("native Diagram editing target (#5311)", () => {
    let project: Project;
    beforeEach(() => project = Project.createInstance("editing"));

    function occurrence(source: string) {
        const page = project.addPage("Page", "tester");
        const item = page.items.addNode("tester");
        item.componentType = "diagram";
        const diagramId = createDiagram(project, { initialSource: source });
        setItemDiagramId(item, diagramId);
        return { item, diagramId };
    }

    it("edits the project-owned Y.Text and never the occurrence text", () => {
        const { item, diagramId } = occurrence("ab");
        const unregister = registerDiagramOccurrence(item.id, true);
        const target = diagramEditingTarget(project, item)!;
        target.insertTextAt(1, "X");
        expect(getDiagramSourceYText(project, diagramId)?.toString()).toBe("aXb");
        expect(item.text.toString()).toBe("");
        unregister();
    });

    it("preserves literal multiline, tab, bracket, and Unicode input", () => {
        const { item, diagramId } = occurrence("");
        const unregister = registerDiagramOccurrence(item.id, true);
        diagramEditingTarget(project, item)!.insertTextAt(0, "graph TD\n\tA[日本]");
        expect(getDiagramSourceYText(project, diagramId)?.toString()).toBe("graph TD\n\tA[日本]");
        unregister();
    });

    it("refuses writes from a read-only or unmounted occurrence", () => {
        const { item, diagramId } = occurrence("safe");
        const unregister = registerDiagramOccurrence(item.id, false);
        const target = diagramEditingTarget(project, item)!;
        target.insertTextAt(0, "unsafe");
        expect(getDiagramSourceYText(project, diagramId)?.toString()).toBe("safe");
        unregister();
        target.deleteTextAt(0, 4);
        expect(getDiagramSourceYText(project, diagramId)?.toString()).toBe("safe");
    });
});
