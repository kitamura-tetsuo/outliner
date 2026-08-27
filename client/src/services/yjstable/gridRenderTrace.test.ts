import { describe, expect, it } from "vitest";
import { buildGridRenderTrace } from "./gridRenderTrace";

describe("buildGridRenderTrace", () => {
    it("correlates query and client stages and exposes a render projection divergence", () => {
        const trace = buildGridRenderTrace({
            gridId: "grid-1",
            sourceTableId: "table-1",
            projectId: "project-1",
            projectDocumentId: "project-doc",
            tableDocumentId: "table-doc",
            configRevision: "0101a0",
            clientRevision: 7,
            query: "SELECT id, title, completed FROM tasks",
            result: {
                columns: ["id", "title", "completed"],
                rows: [
                    { id: "1", title: "one", completed: false },
                    { id: "2", title: "two", completed: true },
                ],
            },
            execution: {
                queryId: "query-4",
                generation: 4,
                status: "completed",
                startedAt: "2026-08-27T00:00:00.000Z",
                durationMs: 3,
                rowCount: 2,
                columnCount: 3,
            },
            columnOrder: ["title", "completed", "id"],
            hiddenColumns: { completed: true },
        });

        expect(trace.stages).toEqual([
            expect.objectContaining({ stage: "config", revision: "0101a0", hiddenColumns: ["completed"] }),
            expect.objectContaining({ stage: "query-execution", queryId: "query-4", rowCount: 2, columnCount: 3 }),
            expect.objectContaining({
                stage: "client-state",
                queryId: "query-4",
                revision: 7,
                rowCount: 2,
                columnCount: 3,
            }),
            expect.objectContaining({
                stage: "render",
                queryId: "query-4",
                revision: 7,
                rowCount: 2,
                columnCount: 2,
                columns: ["title", "id"],
                appliedTransforms: ["column-order", "hidden-columns:completed"],
                sample: [
                    { title: "one", id: "1" },
                    { title: "two", id: "2" },
                ],
            }),
        ]);
    });

    it("bounds row samples and individual values", () => {
        const trace = buildGridRenderTrace({
            gridId: "grid-1",
            sourceTableId: "table-1",
            projectDocumentId: "project-doc",
            tableDocumentId: "table-doc",
            configRevision: "01",
            clientRevision: 1,
            query: "SELECT value FROM source",
            result: {
                columns: ["value"],
                rows: Array.from({ length: 23 }, (_, index) => ({ value: `${index}-${"x".repeat(300)}` })),
            },
            columnOrder: [],
            hiddenColumns: {},
        });

        const render = trace.stages.find(stage => stage.stage === "render");
        expect(render?.stage).toBe("render");
        if (render?.stage !== "render") throw new Error("render stage missing");
        expect(render.sample).toHaveLength(5);
        expect(render.sampleTruncated).toBe(true);
        expect(String(render.sample[0].value).length).toBe(201);
    });
});
