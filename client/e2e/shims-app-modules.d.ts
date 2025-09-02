// Type shims to prevent TypeScript from pulling client/src into the E2E ts project
// We only need runtime behavior for these dynamic imports during tests.
// Declaring them as 'any' keeps E2E type-check focused on e2e/** only.

declare module "../../src/lib/fluidService.svelte.js" {
    const anyModule: any;
    export = anyModule;
}

declare module "../../src/lib/yjsProjectManager.svelte.js" {
    const anyModule: any;
    export = anyModule;
}

// Catch-all shim for any other modules under client/src referenced by E2E via dynamic import
declare module "../../src/*" {
    const anyModule: any;
    export = anyModule;
}
