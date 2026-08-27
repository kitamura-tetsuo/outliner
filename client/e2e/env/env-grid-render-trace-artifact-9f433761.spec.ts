/** @feature ENV-9f433761 */
import fs from "fs/promises";
import { attachGridRenderTraces, collectGridRenderTraces, expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

// ENV-9f433761 (issue #5129): E2E failure diagnostics reuse the Grid render
// trace introduced by #5128 instead of a separate E2E-only trace path. This
// exercises the exact functions the `page` fixture in
// client/e2e/fixtures/grid-render-trace.ts calls on a failing test, against a
// real mounted Grid, so a regression here (a stage dropped, a field renamed,
// attach() failing) is caught without needing an actually-red CI run.
test.describe("Grid render trace E2E failure artifact", () => {
    test(
        "collects a real Grid's render trace and attaches it as a correlated JSON artifact",
        async ({ page }, testInfo) => {
            await page.goto("/grids/demo/demo-table-routine-occurrences-history-grid");
            await expect(page.getByTestId("yjs-table-view")).toBeVisible({ timeout: 30000 });
            await expect(page.getByTestId("yjs-table-grid")).toBeVisible({ timeout: 30000 });

            const traces = await collectGridRenderTraces(page);
            const trace = traces.find(t => t.gridId === "demo-table-routine-occurrences-history-grid");
            expect(trace).toBeDefined();
            expect(trace!.sourceTableId).toBe("demo-table-routine-occurrences");

            // Answers "what result was observed, and where did it diverge" from
            // the CI validation checklist in docs/e2e-grid-render-trace-artifacts.md.
            const stages = trace!.stages.map(stage => (stage as { stage: string; }).stage);
            expect(stages).toEqual(["config", "client-state", "render"]);

            await attachGridRenderTraces(testInfo, traces, { url: page.url() });

            const index = testInfo.attachments.find(a => a.name === "grid-render-trace-index.json");
            expect(index).toBeDefined();
            const indexBody = JSON.parse(await fs.readFile(index!.path!, "utf8"));
            expect(indexBody.gridIds).toContain("demo-table-routine-occurrences-history-grid");
            expect(indexBody.url).toContain("/grids/demo/demo-table-routine-occurrences-history-grid");

            const gridAttachment = testInfo.attachments.find(
                a => a.name === "grid-render-trace-demo-table-routine-occurrences-history-grid.json",
            );
            expect(gridAttachment).toBeDefined();
            expect(JSON.parse(await fs.readFile(gridAttachment!.path!, "utf8"))).toEqual(trace);
        },
    );

    test("returns no traces for a page with no mounted Grid", async ({ page }) => {
        await page.goto("/demo/Welcome");
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 60000 });

        expect(await collectGridRenderTraces(page)).toEqual([]);
    });
});
