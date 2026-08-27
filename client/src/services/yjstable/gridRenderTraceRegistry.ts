import type { GridRenderTrace } from "./gridRenderTrace";

/**
 * Always-available registry of the live Grid render trace for every currently
 * mounted Grid, keyed by gridId. Unlike the WebMCP tool in `WebMCP.ts`, this
 * does not depend on a `window.WebMCP` host being present, so it also works
 * inside a plain Playwright-driven browser during E2E runs (see
 * `client/e2e/fixtures/grid-render-trace.ts`).
 */
const sources = new Map<string, () => GridRenderTrace | undefined>();

/** Registers the live trace getter for one mounted Grid. Returns an unregister function. */
export function registerGridRenderTraceSource(
    gridId: string,
    getTrace: () => GridRenderTrace | undefined,
): () => void {
    sources.set(gridId, getTrace);
    return () => {
        if (sources.get(gridId) === getTrace) sources.delete(gridId);
    };
}

/** Builds a fresh trace for every currently mounted Grid. Grids with no trace yet are skipped. */
export function collectGridRenderTraces(): GridRenderTrace[] {
    return [...sources.values()]
        .map(getTrace => getTrace())
        .filter((trace): trace is GridRenderTrace => trace !== undefined);
}

interface GridRenderTraceWindowBridge {
    collect: () => GridRenderTrace[];
}

declare global {
    interface Window {
        __outlinerGridRenderTraces?: GridRenderTraceWindowBridge;
    }
}

// Exposes the registry to Playwright's page.evaluate() so E2E failure
// diagnostics can pull it without any test-only code shipping in the app
// bundle beyond this one bridge object.
if (typeof window !== "undefined") {
    window.__outlinerGridRenderTraces = { collect: collectGridRenderTraces };
}
