import { type Page, test as base, type TestInfo } from "@playwright/test";
import fs from "fs/promises";

/**
 * Mirrors `GridRenderTrace` from
 * `client/src/services/yjstable/gridRenderTrace.ts` structurally rather than
 * importing it: e2e/ is a separate TypeScript project from src/ (see
 * client/e2e/tsconfig.json, which excludes ../src), and the trace crosses the
 * page boundary as JSON anyway.
 */
export interface GridRenderTraceSnapshot {
    version: number;
    gridId: string;
    sourceTableId: string;
    projectId?: string;
    generatedAt: string;
    stages: readonly unknown[];
}

interface GridRenderTraceWindow {
    __outlinerGridRenderTraces?: { collect: () => GridRenderTraceSnapshot[]; };
}

/**
 * Pulls every currently-registered Grid render trace out of the page via the
 * always-on bridge installed by `gridRenderTraceRegistry.ts`. Returns `[]`
 * when no Grid is mounted, or when running against a build that predates the
 * registry (older client bundle, or a non-Grid page).
 */
export async function collectGridRenderTraces(page: Page): Promise<GridRenderTraceSnapshot[]> {
    return page.evaluate(() =>
        (window as unknown as GridRenderTraceWindow).__outlinerGridRenderTraces?.collect() ?? []
    );
}

/**
 * Attaches the given traces to the current test's report: one JSON file per
 * Grid plus an index that correlates them with the failing test, its page
 * URL, and every captured Grid's id — everything a coding agent needs to
 * locate and open the right file among the other CI artifacts (screenshots,
 * videos, logs) without touching those.
 *
 * Written to real files under `testInfo.outputPath()` (inside
 * `client/test-results/<test-id>/`) rather than passed as an in-memory
 * `body`: `client/test-results/` is uploaded as a CI artifact unconditionally
 * (see `.github/workflows/ci-test-e2e.yml`), while a `body` attachment is
 * only recoverable from the JSON reporter's own output file, which is not
 * always enabled.
 *
 * Exported standalone (not only wired into the `page` fixture below) so it
 * can be exercised directly and its output files inspected without
 * depending on fixture teardown timing.
 */
export async function attachGridRenderTraces(
    testInfo: TestInfo,
    traces: readonly GridRenderTraceSnapshot[],
    context: { url?: string; } = {},
): Promise<void> {
    if (traces.length === 0) return;

    const index = {
        test: testInfo.titlePath.join(" > "),
        file: testInfo.file,
        project: testInfo.project.name,
        retry: testInfo.retry,
        url: context.url,
        gridIds: traces.map(trace => trace.gridId),
    };
    await writeJsonAttachment(testInfo, "grid-render-trace-index.json", index);

    for (const trace of traces) {
        await writeJsonAttachment(testInfo, `grid-render-trace-${trace.gridId}.json`, trace);
    }
}

async function writeJsonAttachment(testInfo: TestInfo, name: string, content: unknown): Promise<void> {
    const path = testInfo.outputPath(name);
    await fs.writeFile(path, JSON.stringify(content, null, 2), "utf8");
    await testInfo.attach(name, { path, contentType: "application/json" });
}

/**
 * Grid E2E specs should import `test`/`expect` from here instead of
 * `@playwright/test` directly. On a failing (or timed-out) test, its
 * teardown captures whatever Grid render traces are live in the page and
 * attaches them to the test report — see docs/e2e-grid-render-trace-artifacts.md.
 *
 * This never replaces or delays existing screenshot/video/log capture: it
 * only adds attachments after the test body has already run.
 */
export const test = base.extend({
    page: async ({ page }, use, testInfo) => {
        await use(page);

        if (testInfo.status === testInfo.expectedStatus) return;
        try {
            const traces = await collectGridRenderTraces(page);
            await attachGridRenderTraces(testInfo, traces, { url: page.url() });
        } catch (error) {
            // Best-effort diagnostics: a page already closed/crashed after a
            // failure must never mask the original failure or fail the test
            // a second time over missing trace data.
            console.warn("[grid-render-trace] failed to capture render trace artifact:", error);
        }
    },
});

export { expect } from "@playwright/test";
