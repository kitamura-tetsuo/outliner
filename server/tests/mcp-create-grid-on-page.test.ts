import { expect } from "chai";
import * as Y from "yjs";
import { McpReadError } from "../src/mcp/mcp-error.js";
import { childKeys, createGridFixture, gridIds, gridPlacements } from "./mcp-create-grid-fixture.js";

// Issue #5349: server-side atomic Grid creation with Page placement.
describe("createGridOnPage: Grid definition plus Page placement", function() {
    this.timeout(30000);

    async function expectRejected(promise: Promise<unknown>, code: string) {
        try {
            await promise;
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            expect((error as McpReadError).code).to.equal(code);
            return error as McpReadError;
        }
        throw new Error(`expected ${code} rejection`);
    }

    it("creates exactly one Grid and one appended placement that production reads resolve (AS-001)", async () => {
        const { project, page, relations, reads } = createGridFixture();
        const beforeGrids = gridIds(project);
        const beforeChildren = childKeys(page);
        const query = "SELECT id AS id, title AS title FROM tasks ORDER BY id";

        const result = await relations.createGridOnPage("uid", "project-1", {
            sourceTableId: "table-tasks",
            pageId: page.id,
            query,
            name: "My tasks",
        });

        expect(result).to.include({
            sourceTableId: "table-tasks",
            pageId: page.id,
            name: "My tasks",
            query,
        });
        expect(gridIds(project)).to.deep.equal([...beforeGrids, result.gridId].sort());
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(result.gridId)!;
        expect(Object.fromEntries([...grid.entries()].filter(([key]) => key !== "components"))).to.deep.equal({
            sourceTableId: "table-tasks",
            name: "My tasks",
            query,
            sqlAliasPolicyVersion: 1,
        });
        expect((grid.get("components") as Y.Map<unknown>).size).to.equal(0);

        expect(childKeys(page)).to.deep.equal([...beforeChildren, result.placementId]);
        const placement = [...page.items][page.items.length - 1];
        expect(placement.componentType).to.equal("yjstable");
        expect(placement.yjsGridId).to.equal(result.gridId);
        expect(placement.yjsTableId).to.equal("table-tasks");
        expect(placement.items.length).to.equal(0);

        // The normal production read models resolve both returned IDs.
        const readGrid = await reads.getGrid("uid", "project-1", result.gridId);
        expect(readGrid).to.include({ id: result.gridId, name: "My tasks", sourceTableId: "table-tasks", query });
        const readItem = await reads.getItem("uid", "project-1", result.placementId);
        expect(readItem).to.include({ id: result.placementId, kind: "grid", gridId: result.gridId });
        const ancestors = await reads.getAncestors("uid", "project-1", result.placementId);
        expect(ancestors.map(node => node.id)).to.deep.equal([page.id, result.placementId]);
        const validation = await relations.validateGridQuery("uid", "project-1", result.gridId, query);
        expect(validation.accepted).to.equal(true);
    });

    it("defaults the name to the source Table's current display name (REQ-004)", async () => {
        const { project, page, relations } = createGridFixture();
        project.ydoc.getMap<Y.Map<unknown>>("yjsTables").get("table-tasks")!.set("name", "Renamed tasks");
        const result = await relations.createGridOnPage("uid", "project-1", {
            sourceTableId: "table-tasks",
            pageId: page.id,
            query: "SELECT id AS id FROM tasks",
        });
        expect(result.name).to.equal("Renamed tasks");
        expect(project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(result.gridId)!.get("name"))
            .to.equal("Renamed tasks");
    });

    it("accepts a SELECT that joins another relation, keeping the requested source Table (AS-002)", async () => {
        const { project, page, tasks, people, relations } = createGridFixture();
        const tasksBefore = Y.encodeStateAsUpdate(tasks);
        const peopleBefore = Y.encodeStateAsUpdate(people);
        const tableRegistryBefore = JSON.stringify(project.ydoc.getMap("yjsTables").toJSON());
        const query =
            "SELECT t.id AS id, t.title AS title, p.label AS owner FROM tasks t JOIN people p ON p.id = t.owner";

        const result = await relations.createGridOnPage("uid", "project-1", {
            sourceTableId: "table-tasks",
            pageId: page.id,
            query,
            name: "With owners",
        });

        expect(result.validation.dependencies).to.have.members(["tasks", "people"]);
        expect(result.validation.sampleRows).to.deep.include({ id: "t1", title: "Write spec", owner: "Ada" });
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(result.gridId)!;
        expect(grid.get("sourceTableId")).to.equal("table-tasks");
        expect(grid.get("query")).to.equal(query);
        // The source Table (and the joined one) are neither mutated nor cloned.
        expect(Y.encodeStateAsUpdate(tasks)).to.deep.equal(tasksBefore);
        expect(Y.encodeStateAsUpdate(people)).to.deep.equal(peopleBefore);
        expect(JSON.stringify(project.ydoc.getMap("yjsTables").toJSON())).to.equal(tableRegistryBefore);
    });

    it("saves the exact supplied query text rather than a normalized form (REQ-003)", async () => {
        const { project, page, relations } = createGridFixture();
        const query = "  select id as id\n  from tasks  ";
        const result = await relations.createGridOnPage("uid", "project-1", {
            sourceTableId: "table-tasks",
            pageId: page.id,
            query,
        });
        expect(result.query).to.equal(query);
        expect(project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(result.gridId)!.get("query")).to.equal(query);
    });

    it("rejects missing sources, missing Pages, and non-Page items before any write (REQ-001)", async () => {
        const { project, page, nested, first, relations } = createGridFixture();
        const snapshot = () => ({ grids: gridIds(project), placements: gridPlacements(project) });
        const before = snapshot();
        const base = { pageId: page.id, query: "SELECT id AS id FROM tasks" };
        await expectRejected(
            relations.createGridOnPage("uid", "project-1", { ...base, sourceTableId: "missing-table" }),
            "not_found",
        );
        await expectRejected(
            relations.createGridOnPage("uid", "project-1", { ...base, sourceTableId: "table-tasks", pageId: "nope" }),
            "not_found",
        );
        for (const item of [first, nested]) {
            await expectRejected(
                relations.createGridOnPage("uid", "project-1", {
                    ...base,
                    sourceTableId: "table-tasks",
                    pageId: item.id,
                }),
                "invalid_argument",
            );
        }
        await expectRejected(
            relations.createGridOnPage("uid", "project-1", { ...base, sourceTableId: "table-tasks", query: "  " }),
            "invalid_argument",
        );
        expect(snapshot()).to.deep.equal(before);
        expect(childKeys(first)).to.have.length(1);
    });

    it("refuses invalid, writable, implicit-alias, and failing SELECTs without side effects (AS-003)", async () => {
        const { project, page, relations } = createGridFixture();
        const before = { grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) };
        const invalid = [
            "SELEC id FROM tasks",
            "DELETE FROM tasks",
            "SELECT title value FROM tasks",
            "SELECT id AS id FROM no_such_relation",
            "SELECT missing_column AS x FROM tasks",
        ];
        for (const query of invalid) {
            const error = await expectRejected(
                relations.createGridOnPage("uid", "project-1", {
                    sourceTableId: "table-tasks",
                    pageId: page.id,
                    query,
                }),
                "validation_failed",
            );
            expect(error.debug?.validation).to.have.property("accepted", false);
        }
        expect({ grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) })
            .to.deep.equal(before);
    });
});
