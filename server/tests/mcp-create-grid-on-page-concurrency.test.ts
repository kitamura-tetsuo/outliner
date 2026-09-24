import { expect } from "chai";
import sinon from "sinon";
import * as Y from "yjs";
import { McpReadError } from "../src/mcp/mcp-error.js";
import { Items, Project } from "../src/schema/app-schema.js";
import {
    afterFirstValidation,
    childKeys,
    createGridFixture,
    gridIds,
    gridPlacements,
} from "./mcp-create-grid-fixture.js";

// Issue #5349: stale validation, concurrent peers, and publication failures.
describe("createGridOnPage: concurrency and all-or-nothing publication", function() {
    this.timeout(30000);

    afterEach(() => sinon.restore());

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

    function request(pageId: string, query = "SELECT id AS id, title AS title FROM tasks") {
        return { sourceTableId: "table-tasks", pageId, query, name: "Created" };
    }

    it("refuses when the source Table or destination Page disappears after validation (AS-004)", async () => {
        for (const remove of ["table", "page"] as const) {
            const { project, page, relations } = createGridFixture();
            const before = { grids: gridIds(project), placements: gridPlacements(project) };
            afterFirstValidation(relations, () => {
                if (remove === "table") project.ydoc.getMap("yjsTables").delete("table-tasks");
                else page.delete();
            });
            await expectRejected(relations.createGridOnPage("uid", "project-1", request(page.id)), "not_found");
            expect({ grids: gridIds(project), placements: gridPlacements(project) }).to.deep.equal(before);
        }
    });

    it("revalidates against changed Table data and publishes only the fresh result (AS-004)", async () => {
        const { project, page, tasks, relations } = createGridFixture();
        const calls = afterFirstValidation(relations, () => {
            const record = new Y.Map<unknown>();
            record.set("id", "t3");
            record.set("title", "Added by a peer");
            tasks.getMap("data").set("t3", record);
        });
        const result = await relations.createGridOnPage("uid", "project-1", request(page.id));
        expect(calls.count).to.equal(2);
        expect(result.validation.sampleRows).to.deep.include({ id: "t3", title: "Added by a peer" });
        expect(gridIds(project)).to.include(result.gridId);
    });

    it("refuses when a changed schema makes the query invalid under revalidation (AS-004)", async () => {
        const { project, page, tasks, relations } = createGridFixture();
        const before = { grids: gridIds(project), children: childKeys(page) };
        afterFirstValidation(relations, () => {
            const schema = tasks.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, owner TEXT)");
        });
        const error = await expectRejected(
            relations.createGridOnPage("uid", "project-1", request(page.id)),
            "validation_failed",
        );
        expect(error.debug?.validation).to.have.property("accepted", false);
        expect({ grids: gridIds(project), children: childKeys(page) }).to.deep.equal(before);
    });

    it("gives up without writing when validation inputs never stop changing", async () => {
        const { project, page, people, relations } = createGridFixture();
        const before = { grids: gridIds(project), children: childKeys(page) };
        let revision = 0;
        afterFirstValidation(relations, () => {
            people.getMap<Y.Map<unknown>>("data").get("p1")!.set("label", `Ada ${++revision}`);
        }, true);
        await expectRejected(relations.createGridOnPage("uid", "project-1", request(page.id)), "stale_revision");
        expect({ grids: gridIds(project), children: childKeys(page) }).to.deep.equal(before);
    });

    it("appends after a peer's concurrent sibling and keeps the peer's edits (AS-005)", async () => {
        const { project, page, first, relations } = createGridFixture();
        const peer = new Y.Doc();
        Y.applyUpdate(peer, Y.encodeStateAsUpdate(project.ydoc));
        const peerProject = Project.fromDoc(peer);
        const peerPage = peerProject.findPage(page.id)!;
        let siblingKey = "";
        afterFirstValidation(relations, () => {
            const vector = Y.encodeStateVector(project.ydoc);
            siblingKey = peerPage.items.addNode("peer").key;
            [...peerPage.items][0].updateText("first child, edited by peer");
            Y.applyUpdate(project.ydoc, Y.encodeStateAsUpdate(peer, vector));
        });
        const before = childKeys(page);

        const result = await relations.createGridOnPage("uid", "project-1", request(page.id));

        expect(childKeys(page)).to.deep.equal([...before, siblingKey, result.placementId]);
        expect(first.text).to.equal("first child, edited by peer");
        expect(first.items.length).to.equal(1);
    });

    it("leaves neither half when publication fails between definition and placement (AS-006)", async () => {
        const { project, page, relations, reads } = createGridFixture();
        const before = { grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) };
        // The Grid entry is written first; the placement write then fails.
        sinon.stub(Items.prototype, "addNode").throws(new Error("injected placement failure"));

        const error = await expectRejected(
            relations.createGridOnPage("uid", "project-1", request(page.id)),
            "internal_failure",
        );

        expect(error.debug?.cause).to.equal("injected placement failure");
        expect({ grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) })
            .to.deep.equal(before);
        const readPage = await reads.getSubtree("uid", "project-1", page.id, 3, 100);
        expect(readPage.root.children?.map(child => child.id)).to.deep.equal(before.children);
    });

    it("discards both halves when the publication transaction reports an error after writing (AS-006)", async () => {
        const { project, page, relations } = createGridFixture();
        const before = { grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) };
        let thrown = false;
        // A server-side observer (e.g. an extension) failing at transaction end:
        // Yjs has already applied both halves when transact() rethrows.
        project.ydoc.getMap("orderedTree").observeDeep(() => {
            if (thrown) return;
            thrown = true;
            throw new Error("observer failed after commit");
        });

        const error = await expectRejected(
            relations.createGridOnPage("uid", "project-1", request(page.id)),
            "internal_failure",
        );

        expect(thrown).to.equal(true);
        expect(error.debug?.cause).to.equal("observer failed after commit");
        expect({ grids: gridIds(project), children: childKeys(page), placements: gridPlacements(project) })
            .to.deep.equal(before);
    });
});
