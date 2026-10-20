/** @feature ENV-9f433761 */
import fs from "fs/promises";
import { stripVTControlCharacters } from "node:util";
import {
    attachGridRenderTraces,
    collectGridRenderTraces,
    expect,
    readClipboardAndRecord,
    recordGridClipboardDiagnostic,
    test,
} from "../fixtures/grid-render-trace";
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
            await page.goto("/demo/-/grids/demo-table-routine-occurrences-history-grid");
            await expect(page.getByTestId("yjs-table-view")).toBeVisible({ timeout: 30000 });
            await expect(page.getByTestId("yjs-table-grid")).toBeVisible({ timeout: 30000 });

            await expect.poll(async () =>
                (await collectGridRenderTraces(page)).find(trace =>
                    trace.gridId === "demo-table-routine-occurrences-history-grid"
                )?.sourceDiagnostics.execution.current
            ).toBe(true);
            const traces = await collectGridRenderTraces(page);
            const trace = traces.find(t => t.gridId === "demo-table-routine-occurrences-history-grid");
            expect(trace).toBeDefined();
            expect(trace!.sourceDiagnostics.dependencies.relations.map(source => source.id)).toContain(
                "demo-table-routine-occurrences",
            );

            // Answers "what result was observed, and where did it diverge" from
            // the CI validation checklist in docs/e2e-grid-render-trace-artifacts.md.
            const stages = trace!.stages.map(stage => (stage as { stage: string; }).stage);
            expect(stages).toEqual(["config", "query-execution", "client-state", "render"]);

            await attachGridRenderTraces(testInfo, traces, { url: page.url() });

            const index = testInfo.attachments.find(a => a.name === "grid-render-trace-index.json");
            expect(index).toBeDefined();
            const indexBody = JSON.parse(await fs.readFile(index!.path!, "utf8"));
            expect(indexBody.gridIds).toContain("demo-table-routine-occurrences-history-grid");
            expect(indexBody.url).toContain("/demo/-/grids/demo-table-routine-occurrences-history-grid");

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

    test("retains the last invalid pre-copy and clipboard observations when assertions fail", async ({ page }) => {
        await page.goto("/demo/Welcome");
        await page.evaluate(() =>
            (globalThis as any).__gridClipboardDiagnostic = {
                selection: "unavailable",
                focus: "unavailable",
                clipboardText: "unavailable",
            }
        );
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.evaluate(() => navigator.clipboard.writeText("Paste below"));

        const invalidPreCopy = { selection: { startItemId: "wrong-item" }, focus: false };
        await recordGridClipboardDiagnostic(page, invalidPreCopy);
        let originalFailure: Error | undefined;
        try {
            expect(invalidPreCopy.focus).toBe(true);
        } catch (error) {
            originalFailure = error as Error;
        }
        expect(originalFailure).toBeInstanceOf(Error);
        const focusFailure = stripVTControlCharacters(originalFailure!.message);
        expect(focusFailure).toContain("Expected: true");
        expect(focusFailure).toContain("Received: false");

        try {
            expect(await readClipboardAndRecord(page)).toContain("expected Grid header");
        } catch (error) {
            originalFailure = error as Error;
        }
        expect(originalFailure?.message).toContain("expected Grid header");
        expect(await page.evaluate(() => (globalThis as any).__gridClipboardDiagnostic)).toEqual({
            ...invalidPreCopy,
            clipboardText: "Paste below",
        });
    });
});
