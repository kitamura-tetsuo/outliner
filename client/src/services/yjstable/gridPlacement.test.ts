import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { createGrid } from "./gridDocs";
import {
    appendGridPlacement,
    GRID_PLACEMENT_MIME,
    isGridPlacementDrag,
    moveGridPlacement,
    pageContaining,
    readGridPlacementDrag,
    writeGridPlacementDrag,
} from "./gridPlacement";
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

    it("clears Layout-only width when moving a Layout child onto a Page", () => {
        const project = Project.createInstance("Project");
        const source = project.addPage("Source", "user");
        const destination = project.addPage("Destination", "user");
        const layout = source.items.addNode("user");
        layout.componentType = "layout";
        const placement = layout.items.addNode("user");
        placement.columnSpan = 7;
        const gridId = createGrid(project.ydoc, "table", { name: "Grid" });
        bindItemToGrid(placement, gridId, "table");

        moveGridPlacement(project.ydoc, placement.id, destination.id);

        expect(placement.columnSpan).toBeUndefined();
        expect(pageContaining(project, placement)?.id).toBe(destination.id);
    });

    it("recognizes protected dragover data by MIME type", () => {
        const project = Project.createInstance("Project");
        const page = project.addPage("Source", "user");
        const placement = page.items.addNode("user");
        const gridId = createGrid(project.ydoc, "table", { name: "Grid" });
        bindItemToGrid(placement, gridId, "table");
        let payload = "";
        const transfer = {
            types: [GRID_PLACEMENT_MIME],
            effectAllowed: "uninitialized",
            setData: (_type: string, value: string) => {
                payload = value;
            },
            getData: () => payload,
        } as unknown as DataTransfer;
        const start = { dataTransfer: transfer } as DragEvent;
        expect(writeGridPlacementDrag(start, placement, false)?.gridId).toBe(gridId);

        transfer.getData = () => "";
        const protectedDragOver = { dataTransfer: transfer } as DragEvent;
        expect(isGridPlacementDrag(protectedDragOver)).toBe(true);
        expect(readGridPlacementDrag(protectedDragOver)).toMatchObject({ gridId, sourceWritable: false });
    });
});
