// Production-origin coverage for SQL-only Kanbans over the built-in
// `outline_items` relation. The runner, ProjectSelectSession, provider and
// PGlite query path are all real; only the remote subdoc connector is local.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { listGrids } from "./gridDocs";
import { createKanban, getKanban, getKanbanHandles } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { listTables } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

const QUERY = "SELECT id, text, CASE WHEN text = 'Literal lane' THEN 'NULL' ELSE NULL END AS lane "
    + "FROM outline_items ORDER BY text";

async function waitForProjection(
    projections: KanbanProjection[],
    predicate: (value: KanbanProjection) => boolean,
): Promise<KanbanProjection> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const projection = projections.at(-1);
        if (projection && predicate(projection)) return projection;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Timed out waiting for outline_items Kanban projection");
}

function startRunner(projectDoc: Y.Doc, kanbanId: string) {
    const projections: KanbanProjection[] = [];
    const runner = new KanbanQueryRunner({
        projectDoc,
        kanbanId,
        kanban: getKanbanHandles(projectDoc, kanbanId)!,
        connect: localConnector,
    });
    runner.subscribeProjection(projection => projections.push(projection));
    runner.start();
    return { runner, projections };
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("SQL-only Kanban over outline_items", { timeout: 30000 }, () => {
    it("renders real scheduled items, reconstructs, and refreshes to successful empty without a Table", async () => {
        const projectDoc = new Y.Doc({ guid: `kanban-items-${crypto.randomUUID()}` });
        const tree = Project.fromDoc(projectDoc).tree;
        const page = new Items(projectDoc, tree, "root").addNode("tester");
        page.text = "Board page";
        const nullLane = new Items(projectDoc, tree, page.key).addNode("tester");
        nullLane.text = "SQL null lane";
        nullLane.due = "2026-10-18T09:00:00Z";
        const literalLane = new Items(projectDoc, tree, page.key).addNode("tester");
        literalLane.text = "Literal lane";
        literalLane.start = "2026-10-19";
        literalLane.allDay = true;

        const kanbanId = createKanban(projectDoc, {
            kanbanId: "outline-only-board",
            name: "Outline board",
            query: QUERY,
            groupField: "lane",
            titleField: "text",
            laneOrder: [null, "NULL"],
        });
        expect(listTables(projectDoc)).toEqual([]);
        expect(listGrids(projectDoc)).toEqual([]);

        const initial = startRunner(projectDoc, kanbanId);
        await initial.runner.runQueryNow();
        const projected = await waitForProjection(
            initial.projections,
            value => value.status === "success" && value.current,
        );
        expect(projected.lanes.map(lane => ({
            key: lane.key,
            titles: lane.cards.map(card => card.row.text),
        }))).toEqual([
            { key: null, titles: ["SQL null lane"] },
            { key: "NULL", titles: ["Literal lane"] },
        ]);
        expect(projected.provenance?.analysis?.suppliers.map(source => source.sqlName)).toEqual(["outline_items"]);
        initial.runner.dispose();
        await resetTableEngineForTests();

        const restarted = new Y.Doc({ guid: projectDoc.guid });
        Y.applyUpdate(restarted, Y.encodeStateAsUpdate(projectDoc));
        expect(getKanban(restarted, kanbanId)).toEqual(getKanban(projectDoc, kanbanId));
        expect(listTables(restarted)).toEqual([]);
        expect(listGrids(restarted)).toEqual([]);
        const restored = startRunner(restarted, kanbanId);
        await restored.runner.runQueryNow();
        expect((await waitForProjection(
            restored.projections,
            value => value.status === "success" && value.current && value.result?.rows.length === 2,
        )).lanes.flatMap(lane => lane.cards.map(card => card.row.text))).toEqual([
            "SQL null lane",
            "Literal lane",
        ]);

        const restoredTree = Project.fromDoc(restarted).tree;
        new Items(restarted, restoredTree, page.key).at(0)!.due = undefined;
        new Items(restarted, restoredTree, page.key).at(1)!.start = undefined;
        const empty = await waitForProjection(
            restored.projections,
            value => value.status === "success" && value.current && value.result?.rows.length === 0,
        );
        expect(empty.lanes).toEqual([]);
        expect(listTables(restarted)).toEqual([]);
        restored.runner.dispose();
    });
});
