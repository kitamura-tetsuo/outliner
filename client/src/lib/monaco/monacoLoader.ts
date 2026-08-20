// Shared, lazy Monaco Editor runtime.
//
// Monaco is an order of magnitude heavier than the native controls it replaces,
// and only the Grid configuration panels use it. It must therefore never sit on
// the critical path of an ordinary page render: nothing imports `monaco-editor`
// statically, and the dynamic import below happens the first time a SQL editor
// is actually mounted.
//
// The promise is module-level so every SqlEditor on the page shares one imported
// runtime (and one worker), instead of paying for the download per Grid.
//
// monaco >= 0.53 splits the ESM build into separate entry points: the API
// (`editor.js`), the editor contributions (`features/*/register.js` — find,
// clipboard, undo, line operations, ...) and the language grammars
// (`languages/definitions/*/register.js`). We take the API, the full feature set
// (Monaco owning Ctrl+F / Ctrl+C / Ctrl+Z is exactly what makes it a clean event
// boundary inside the outliner) and only the SQL grammar, leaving the ~80 other
// languages and the TypeScript/JSON/CSS/HTML language services out of the bundle.

export type MonacoModule = typeof import("monaco-editor/editor.js");

interface MonacoEnvironmentGlobal {
    MonacoEnvironment?: { getWorker?: (workerId: string, label: string) => Worker; };
}

let runtime: Promise<MonacoModule> | undefined;

/**
 * Import (once per page) and return the Monaco runtime.
 *
 * Rejects when called outside a browser: the editor touches `window`, workers
 * and the DOM at import time, so SSR must never reach this.
 */
export function loadMonaco(): Promise<MonacoModule> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Monaco Editor is browser-only and cannot be loaded during SSR"));
    }
    runtime ??= importMonacoRuntime();
    return runtime;
}

async function importMonacoRuntime(): Promise<MonacoModule> {
    // Monaco spawns this worker for the services that must not block typing
    // (link detection, diffing, word-based suggestions). Vite's `?worker`
    // suffix bundles it into its own chunk, so the production build ships the
    // worker asset without any hand-written base-URL configuration.
    const { default: MonacoEditorWorker } = await import("monaco-editor/editor/editor.worker.js?worker");
    const scope = globalThis as typeof globalThis & MonacoEnvironmentGlobal;
    scope.MonacoEnvironment ??= {};
    scope.MonacoEnvironment.getWorker ??= () => new MonacoEditorWorker();

    const [monaco] = await Promise.all([
        import("monaco-editor/editor.js"),
        import("monaco-editor/features/register.all.js"),
        import("monaco-editor/languages/definitions/sql/register.js"),
    ]);
    return monaco;
}
