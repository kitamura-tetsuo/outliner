import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Item, Project } from "../../schema/app-schema";
import type { DiagramAuthorization } from "./diagramAuthorization";

// Svelte store mock as permitted by AGENTS.md: `createVisualNodeAtTarget` (via
// visualNodePlacement.ts) needs to know which item is the page's own row, and
// `insertItemAfterTargetOrAppend` (via itemUtils.ts) needs the current page to
// append to. Everything else runs against a real Y.Doc.
const state: { page: Item | undefined; } = { page: undefined };
vi.mock("../../stores/store.svelte", () => ({
    store: {
        get currentPage() {
            return state.page;
        },
    },
}));

const {
    createMermaidDiagramAtTarget,
    createMermaidDiagramUnderParent,
    insertExistingMermaidDiagramAtTarget,
    insertExistingMermaidDiagramUnderParent,
} = await import("./diagramPlacement");
const { getDiagram, getDiagramSourceYText } = await import("./diagramService");
const { getItemDiagramId } = await import("./diagramBinding");

function fullAuth(): DiagramAuthorization {
    return { capabilities: { canRead: true, canWrite: true }, surfaceWritable: true };
}
function deniedAuth(overrides: Partial<DiagramAuthorization> = {}): DiagramAuthorization {
    return { capabilities: { canRead: true, canWrite: true }, surfaceWritable: true, ...overrides };
}

describe("diagram placement (#5310)", () => {
    let project: Project;
    let page: Item;

    beforeEach(() => {
        project = Project.createInstance("Diagram placement tests");
        page = project.addPage("Page", "tester");
        state.page = page;
    });

    function addText(text: string): Item {
        const item = page.items.addNode("tester");
        item.updateText(text);
        return item;
    }

    function addComponent(componentType: string): Item {
        const item = page.items.addNode("tester");
        item.componentType = componentType;
        return item;
    }

    describe("createMermaidDiagramUnderParent (AS-001, AS-003)", () => {
        it("creates one Diagram with an empty source and one occurrence under a Text parent", () => {
            const text = addText("");
            const result = createMermaidDiagramUnderParent(project, text, "tester", fullAuth());

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("expected success");
            expect(getDiagram(project, result.diagramId)).toEqual({
                id: result.diagramId,
                format: "mermaid",
                source: "",
            });
            const created = [...text.items][0];
            expect(created.componentType).toBe("diagram");
            expect(getItemDiagramId(created)).toBe(result.diagramId);
        });

        it("creates under the project root when parent is undefined", () => {
            const result = createMermaidDiagramUnderParent(project, undefined, "tester", fullAuth());
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("expected success");
            // `undefined` means the project root, a sibling of `page` itself —
            // not a child of it.
            const created = [...project.items].find((i) => i.id === result.itemId);
            expect(created?.componentType).toBe("diagram");
        });

        it("creates directly under a Layout, including an empty one and one already holding Grid/Calendar", () => {
            const layout = addComponent("layout");
            const result = createMermaidDiagramUnderParent(project, layout, "tester", fullAuth(), { columnSpan: 6 });
            expect(result.ok).toBe(true);
            const created = [...layout.items][0];
            expect(created.componentType).toBe("diagram");
            expect(created.columnSpan).toBe(6);

            const layout2 = addComponent("layout");
            layout2.items.addNode("tester").componentType = "yjstable";
            layout2.items.addNode("tester").componentType = "calendar";
            const result2 = createMermaidDiagramUnderParent(project, layout2, "tester", fullAuth());
            expect(result2.ok).toBe(true);
            expect([...layout2.items].map((i) => i.componentType)).toEqual(["yjstable", "calendar", "diagram"]);
        });

        it("rejects a Diagram, Grid or Calendar as parent, before any mutation (AS-003)", () => {
            for (const componentType of ["diagram", "yjstable", "calendar"]) {
                const parent = addComponent(componentType);
                const before = project.diagrams.size;
                const result = createMermaidDiagramUnderParent(project, parent, "tester", fullAuth());
                expect(result).toEqual({ ok: false, reason: "invalid-parent" });
                expect(project.diagrams.size).toBe(before);
                expect([...parent.items].length).toBe(0);
            }
        });

        it("rejects a nonexistent (concurrently deleted) parent, before any mutation", () => {
            const parent = addText("");
            parent.delete();
            const before = project.diagrams.size;
            const result = createMermaidDiagramUnderParent(project, parent, "tester", fullAuth());
            expect(result).toEqual({ ok: false, reason: "parent-not-found" });
            expect(project.diagrams.size).toBe(before);
        });

        it("rejects a destination in another project, before any mutation", () => {
            const other = Project.createInstance("Other project");
            const otherPage = other.addPage("Other page", "tester");
            const before = project.diagrams.size;
            const result = createMermaidDiagramUnderParent(project, otherPage, "tester", fullAuth());
            expect(result).toEqual({ ok: false, reason: "cross-project" });
            expect(project.diagrams.size).toBe(before);
            expect(other.diagrams.size).toBe(0);
        });

        it("denies creation when capability is withheld, before any mutation", () => {
            const text = addText("");
            const before = project.diagrams.size;
            const result = createMermaidDiagramUnderParent(
                project,
                text,
                "tester",
                deniedAuth({ capabilities: { canRead: true, canWrite: false } }),
            );
            expect(result).toEqual({ ok: false, reason: "capability-denied" });
            expect(project.diagrams.size).toBe(before);
            expect([...text.items].length).toBe(0);
        });

        it("denies creation on a read-only presentation even with full project capability", () => {
            const text = addText("");
            const result = createMermaidDiagramUnderParent(
                project,
                text,
                "tester",
                deniedAuth({ surfaceWritable: false }),
            );
            expect(result).toEqual({ ok: false, reason: "capability-denied" });
            expect([...text.items].length).toBe(0);
        });
    });

    describe("insertExistingMermaidDiagramUnderParent (AS-001, AS-002)", () => {
        it("inserts another occurrence of the same Diagram and source, creating nothing new", () => {
            const pageA = addText("");
            const first = createMermaidDiagramUnderParent(project, pageA, "tester", fullAuth());
            if (!first.ok) throw new Error("expected success");

            const pageB = addText("");
            const second = insertExistingMermaidDiagramUnderParent(
                project,
                first.diagramId,
                pageB,
                "tester",
                fullAuth(),
            );
            if (!second.ok) throw new Error("expected success");

            expect(second.diagramId).toBe(first.diagramId);
            expect(second.itemId).not.toBe(first.itemId);
            expect(project.diagrams.size).toBe(1);
            expect(getDiagramSourceYText(project, first.diagramId)).toBe(
                getDiagramSourceYText(project, second.diagramId),
            );
        });

        it("rejects an unknown Diagram id, before any mutation", () => {
            const text = addText("");
            const result = insertExistingMermaidDiagramUnderParent(
                project,
                "does-not-exist",
                text,
                "tester",
                fullAuth(),
            );
            expect(result).toEqual({ ok: false, reason: "diagram-not-found" });
            expect([...text.items].length).toBe(0);
        });

        it("rejects an invalid destination even for a valid Diagram id, before any mutation", () => {
            const created = createMermaidDiagramUnderParent(project, addText(""), "tester", fullAuth());
            if (!created.ok) throw new Error("expected success");
            const grid = addComponent("yjstable");

            const result = insertExistingMermaidDiagramUnderParent(
                project,
                created.diagramId,
                grid,
                "tester",
                fullAuth(),
            );
            expect(result).toEqual({ ok: false, reason: "invalid-parent" });
            expect([...grid.items].length).toBe(0);
        });
    });

    describe("createMermaidDiagramAtTarget / insertExistingMermaidDiagramAtTarget (AS-001, AS-003)", () => {
        it("replaces an eligible empty Text node at the cursor with a Diagram occurrence", () => {
            addText("A");
            const blank = addText("");
            addText("B");

            const result = createMermaidDiagramAtTarget(project, blank, "", "tester", fullAuth());
            expect(result.ok).toBe(true);
            // Order: before, created (replacing blank), after.
            const kinds = [...page.items].map((i) => i.componentType);
            expect(kinds).toEqual([undefined, "diagram", undefined]);
            expect([...page.items].map((i) => String(i.text ?? ""))).toEqual(["A", "", "B"]);
        });

        it("never replaces the page-title node", () => {
            const result = createMermaidDiagramAtTarget(project, page, "", "tester", fullAuth());
            expect(result.ok).toBe(true);
            expect(page.componentType).toBeUndefined();
            expect(page.text).toBe("Page");
        });

        it("creates no orphan Diagram when the underlying placement fails", () => {
            state.page = undefined;
            const before = project.diagrams.size;
            const result = createMermaidDiagramAtTarget(project, undefined, "", "tester", fullAuth());
            expect(result.ok).toBe(false);
            expect(project.diagrams.size).toBe(before);
        });

        it("denies capability before touching the target", () => {
            const blank = addText("");
            const result = createMermaidDiagramAtTarget(
                project,
                blank,
                "",
                "tester",
                deniedAuth({ capabilities: { canRead: true, canWrite: false } }),
            );
            expect(result).toEqual({ ok: false, reason: "capability-denied" });
            expect(blank.componentType).toBeUndefined();
        });

        it("inserts an existing Diagram at a target without creating a new one", () => {
            const created = createMermaidDiagramUnderParent(project, addText(""), "tester", fullAuth());
            if (!created.ok) throw new Error("expected success");
            const blank = addText("");

            const result = insertExistingMermaidDiagramAtTarget(
                project,
                created.diagramId,
                blank,
                "",
                "tester",
                fullAuth(),
            );
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("expected success");
            expect(result.diagramId).toBe(created.diagramId);
            expect(project.diagrams.size).toBe(1);
        });

        it("leaves an unrelated peer edit untouched when a command fails (AS-003)", () => {
            const peerNote = addText("peer's in-flight edit");
            state.page = undefined; // force placement failure
            createMermaidDiagramAtTarget(project, undefined, "", "tester", fullAuth());
            expect(peerNote.text).toBe("peer's in-flight edit");
        });
    });

    describe("occurrence removal survives independently of the Diagram (REQ-005)", () => {
        it("keeps the Diagram and its source after every occurrence is removed", () => {
            const parent = addText("");
            const a = createMermaidDiagramUnderParent(project, parent, "tester", fullAuth());
            if (!a.ok) throw new Error("expected success");
            const occurrenceOnA = [...parent.items].find((i) => i.id === a.itemId)!;

            occurrenceOnA.delete();

            expect(project.diagrams.size).toBe(1);
            expect(getDiagram(project, a.diagramId)).toEqual({ id: a.diagramId, format: "mermaid", source: "" });
        });
    });
});
