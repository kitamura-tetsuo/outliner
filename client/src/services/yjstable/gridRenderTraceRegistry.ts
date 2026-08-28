import type { GridRenderTrace } from "./gridRenderTrace";

/**
 * Always-available registry of the live Grid render trace for every currently
 * mounted Grid, keyed by gridId. Unlike the WebMCP tool in `WebMCP.ts`, this
 * does not depend on a `window.WebMCP` host being present, so it also works
 * inside a plain Playwright-driven browser during E2E runs (see
 * `client/e2e/fixtures/grid-render-trace.ts`).
 *
 * A gridId can have more than one mounted view at once (e.g. the same Grid
 * pasted twice, or shown in two panels), so each gridId keeps a set of
 * getters rather than a single one: unregistering one mounted view's getter
 * must not blind the entry to the others still mounted under the same id.
 */
const sources = new Map<string, Set<() => GridRenderTrace | undefined>>();

/** Registers the live trace getter for one mounted Grid view. Returns an unregister function. */
export function registerGridRenderTraceSource(
    gridId: string,
    getTrace: () => GridRenderTrace | undefined,
): () => void {
    const getters = sources.get(gridId) ?? new Set();
    getters.add(getTrace);
    sources.set(gridId, getters);
    return () => {
        getters.delete(getTrace);
        if (getters.size === 0) sources.delete(gridId);
    };
}

/**
 * Builds a fresh trace for every currently mounted Grid id. Grids with no
 * trace yet are skipped; when a gridId has multiple mounted views, the first
 * one that produces a trace is used.
 */
export function collectGridRenderTraces(): GridRenderTrace[] {
    const traces: GridRenderTrace[] = [];
    for (const getters of sources.values()) {
        for (const getTrace of getters) {
            const trace = getTrace();
            if (trace !== undefined) {
                traces.push(trace);
                break;
            }
        }
    }
    return traces;
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
// bundle beyond this one bridge object. Gated the same way as the other
// window-exposed test/debug handles (see AGENTS.md's "no test-specific
// functionality in production code" and ENV-3f7a2b91): the literal MODE
// comparison lets Rollup drop the assignment from a production build, and
// scripts/setup.sh's E2E dev server runs with `--mode test`, so this stays
// available wherever Playwright actually runs.
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    window.__outlinerGridRenderTraces = { collect: collectGridRenderTraces };
}
