import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { createGrid } from "./gridDocs";
import { appendGridPlacement, moveGridPlacement, pageContaining } from "./gridPlacement";
import { bindItemToGrid } from "./itemBinding";

describe("Grid Page placement", () => {
    it("moves a placement to the end of another Page without changing the Grid", () => {
        const project = Project.createInstance("Project");
        const source = project.addPage("Source", "user");
        const destination = project.addPage("Destination", "user");
        const existing = destination.items.addNode("user");
        const placement = source.items.addNode("user");
        const gridId = createGrid(project.ydoc, "table", { name: "Grid" });
        bindItemToGrid(placement, gridId, "table");

        expect(moveGridPlacement(project.ydoc, placement.id, destination.id)).toBe(true);
        expect(pageContaining(project, placement)?.id).toBe(destination.id);
        expect(destination.items.at(0)?.id).toBe(existing.id);
        expect(destination.items.at(1)?.id).toBe(placement.id);
        expect(moveGridPlacement(project.ydoc, placement.id, destination.id)).toBe(false);
    });

    it("appends a duplicate placement to a selected Page", () => {
        const project = Project.createInstance("Project");
        const page = project.addPage("Destination", "user");
        const gridId = createGrid(project.ydoc, "table", { name: "Grid" });
        const placement = appendGridPlacement(project.ydoc, page.id, gridId, "user");
        expect(page.items.at(0)?.id).toBe(placement.id);
    });
});
