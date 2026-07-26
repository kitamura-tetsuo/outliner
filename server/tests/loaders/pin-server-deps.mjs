/**
 * ESM resolve hook that pins duplicate-sensitive dependencies to the server's
 * own node_modules for the duration of a server test run.
 *
 * Why this exists:
 *   `server/src` and `../shared/src` are compiled and executed together (see the
 *   rootDir note in server/tsconfig.json). `shared/src` imports `yjs` bare, and
 *   resolves it through `shared/node_modules`, which scripts/common-functions.sh
 *   deliberately points at `client/node_modules` — the client's vite dev server
 *   serves shared/src as source and must resolve its bare imports to the exact
 *   yjs copy vite pre-bundled, otherwise it re-optimizes mid-run and reloads the
 *   page under in-flight e2e seeds.
 *
 *   That leaves the server test process loading two Yjs instances: the client's
 *   (via shared/src) and server/node_modules/yjs (via server/src). Yjs registers
 *   its content types in module-scoped state, so a second instance fails with
 *   "Yjs was already imported" and any cross-instance value throws
 *   "Unexpected content type" (e.g. inside registerDemoTables).
 *
 * The fix is scoped to the test process rather than global: bare `yjs`
 * specifiers are re-resolved as if they came from this file, i.e. out of
 * server/node_modules, so both halves of the build share one instance. The
 * symlink keeps pointing at the client, so the client's dev server and e2e
 * setup are unaffected.
 *
 * Resolution is delegated to the default resolver with a rewritten parentURL
 * (rather than require.resolve) so package export conditions are still honoured
 * and the ESM build is selected, exactly as an unpinned import would.
 */

// Bare specifiers that must resolve to a single instance per process.
const PINNED_SPECIFIERS = new Set(["yjs"]);

export async function resolve(specifier, context, nextResolve) {
    if (PINNED_SPECIFIERS.has(specifier)) {
        return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    }
    return nextResolve(specifier, context);
}
