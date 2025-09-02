// Shim to prevent TypeScript in e2e project from type-checking app source modules.
// Any import like "../src/..." or "../../src/..." from e2e specs will be treated as any-typed.
// This keeps e2e tsc focused on e2e code only.

declare module "../src/*" {
    const mod: any;
    export = mod;
}

declare module "../src/*/*" {
    const mod: any;
    export = mod;
}

declare module "../src/*/*/*" {
    const mod: any;
    export = mod;
}

declare module "../../src/*" {
    const mod: any;
    export = mod;
}

declare module "../../src/*/*" {
    const mod: any;
    export = mod;
}

declare module "../../src/*/*/*" {
    const mod: any;
    export = mod;
}

declare module "../../src/lib/*" {
    const mod: any;
    export = mod;
}

declare module "../../src/lib/fluidService.svelte.js" {
    const mod: any;
    export = mod;
}
