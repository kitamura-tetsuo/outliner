import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { isDestinationResolvable, listDestinationCandidates } from "./calendarDestinationCandidates";

function seedProject() {
    const projectDoc = new Y.Doc();
    const project = Project.fromDoc(projectDoc);
    return { projectDoc, project };
}

describe("listDestinationCandidates", () => {
    it("lists every page as a candidate destination", () => {
        const { projectDoc, project } = seedProject();
        const tasks = new Items(projectDoc, project.tree, "root").addNode("tester");
        tasks.text = "Tasks";
        const notes = new Items(projectDoc, project.tree, "root").addNode("tester");
        notes.text = "Notes";

        const candidates = listDestinationCandidates(project);

        expect(candidates).toEqual(
            expect.arrayContaining([
                { parentKey: tasks.key, label: "Tasks" },
                { parentKey: notes.key, label: "Notes" },
            ]),
        );
        expect(candidates.length).toBe(2);
    });

    it("labels an untitled page rather than showing empty text", () => {
        const { projectDoc, project } = seedProject();
        const blank = new Items(projectDoc, project.tree, "root").addNode("tester");

        const [candidate] = listDestinationCandidates(project);

        expect(candidate.parentKey).toBe(blank.key);
        expect(candidate.label).toBe("(untitled)");
    });

    it("is empty for a project with no pages", () => {
        const { project } = seedProject();
        expect(listDestinationCandidates(project)).toEqual([]);
    });
});

describe("isDestinationResolvable", () => {
    it("is true for an existing page", () => {
        const { projectDoc, project } = seedProject();
        const page = new Items(projectDoc, project.tree, "root").addNode("tester");
        expect(isDestinationResolvable(project, page.key)).toBe(true);
    });

    it("is false for a key that was never created", () => {
        const { project } = seedProject();
        expect(isDestinationResolvable(project, "no-such-key")).toBe(false);
    });

    it("is false for a page that was subsequently deleted", () => {
        const { projectDoc, project } = seedProject();
        const page = new Items(projectDoc, project.tree, "root").addNode("tester");
        project.tree.deleteNodeAndDescendants(page.key);
        expect(isDestinationResolvable(project, page.key)).toBe(false);
    });
});
