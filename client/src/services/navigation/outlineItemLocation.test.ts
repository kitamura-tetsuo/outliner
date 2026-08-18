// Resolving an item identity (a calendar entry's `source_id`, #4982) to the
// page that owns it and the ancestors that must be expanded to see it.

import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { resolveOutlineItemLocation } from "./outlineItemLocation";

function seedProject(): { project: Project; } {
    const project = Project.createInstance("Test");
    return { project };
}

describe("resolveOutlineItemLocation", () => {
    it("resolves a top-level item to itself as its own page", () => {
        const { project } = seedProject();
        const page = project.addPage("Plans", "tester");

        const location = resolveOutlineItemLocation(project, page.key);

        expect(location).toBeDefined();
        expect(location!.pageKey).toBe(page.key);
        expect(location!.pageTitle).toBe("Plans");
        expect(location!.itemId).toBe(page.id);
        expect(location!.isPageRoot).toBe(true);
        expect(location!.ancestorIds).toEqual([]);
    });

    it("resolves a nested item to its owning page and the ancestors to expand, outermost first", () => {
        const { project } = seedProject();
        const page = project.addPage("Plans", "tester");
        const section = page.items.addNode("tester");
        section.updateText("Q3");
        const task = section.items.addNode("tester");
        task.updateText("Ship it");

        const location = resolveOutlineItemLocation(project, task.key);

        expect(location).toBeDefined();
        expect(location!.pageKey).toBe(page.key);
        expect(location!.pageTitle).toBe("Plans");
        expect(location!.itemKey).toBe(task.key);
        expect(location!.itemId).toBe(task.id);
        expect(location!.isPageRoot).toBe(false);
        // The page first, then each intermediate ancestor: expanding in this
        // order never re-hides what a previous step revealed.
        expect(location!.ancestorIds).toEqual([page.id, section.id]);
    });

    it("resolves the deep case with every intermediate ancestor present", () => {
        const { project } = seedProject();
        const page = project.addPage("Deep", "tester");
        const a = page.items.addNode("tester");
        const b = a.items.addNode("tester");
        const c = b.items.addNode("tester");
        const leaf = c.items.addNode("tester");

        const location = resolveOutlineItemLocation(project, leaf.key);

        expect(location!.ancestorIds).toEqual([page.id, a.id, b.id, c.id]);
    });

    it("returns undefined for an id that names no node — a table row, or a concurrently deleted item", () => {
        const { project } = seedProject();
        project.addPage("Plans", "tester");

        expect(resolveOutlineItemLocation(project, "generated-table-row-7")).toBeUndefined();
    });

    it("returns undefined for a deleted item, so a stale calendar row simply is not navigable", () => {
        const { project } = seedProject();
        const page = project.addPage("Plans", "tester");
        const task = page.items.addNode("tester");
        const key = task.key;
        task.delete();

        expect(resolveOutlineItemLocation(project, key)).toBeUndefined();
    });

    it("returns undefined for the root sentinel, an empty id and a missing project", () => {
        const { project } = seedProject();

        expect(resolveOutlineItemLocation(project, "root")).toBeUndefined();
        expect(resolveOutlineItemLocation(project, "")).toBeUndefined();
        expect(resolveOutlineItemLocation(project, undefined)).toBeUndefined();
        expect(resolveOutlineItemLocation(undefined, "anything")).toBeUndefined();
    });

    it("carries a non-ASCII page title through verbatim, leaving URL encoding to the route helper", () => {
        const { project } = seedProject();
        const page = project.addPage("設計メモ & notes", "tester");
        const task = page.items.addNode("tester");

        const location = resolveOutlineItemLocation(project, task.key);

        expect(location!.pageTitle).toBe("設計メモ & notes");
    });
});
