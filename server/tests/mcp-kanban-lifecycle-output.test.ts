import { expect } from "chai";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";

describe("Kanban lifecycle MCP output contracts", () => {
    it("accepts placement identities and actual commit-time location", () => {
        expect(
            toolOutputSchemas.place_kanban.safeParse({
                projectId: "project",
                kanbanId: "board",
                operation: "place",
                dryRun: false,
                applied: true,
                replayed: false,
                placementId: "tree-key",
                itemId: "item-id",
                pageId: "page-id",
                parentId: "layout-id",
            }).success,
        ).to.equal(true);
    });

    it("bounds the deletion placement sample", () => {
        const result = {
            projectId: "project",
            kanbanId: "board",
            operation: "delete",
            dryRun: false,
            applied: true,
            replayed: false,
            removedPlacementCount: 101,
            removedPlacementIds: Array.from({ length: 101 }, (_, index) => `placement-${index}`),
            placementIdsTruncated: true,
        };
        expect(toolOutputSchemas.delete_kanban.safeParse(result).success).to.equal(false);
        expect(
            toolOutputSchemas.delete_kanban.safeParse({
                ...result,
                removedPlacementIds: result.removedPlacementIds.slice(0, 100),
            }).success,
        ).to.equal(true);
    });

    it("rejects unadvertised lifecycle result fields", () => {
        expect(
            toolOutputSchemas.remove_kanban_placement.safeParse({
                projectId: "project",
                kanbanId: "board",
                operation: "remove_placement",
                dryRun: true,
                applied: false,
                replayed: false,
                wouldChange: true,
                sourceRecordsDeleted: 2,
            }).success,
        ).to.equal(false);
    });
});
