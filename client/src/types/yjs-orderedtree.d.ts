declare module "yjs-orderedtree" {
    // Minimal type shim to satisfy TypeScript in this repo.
    // The library ships types under dist/types but package exports prevent resolution.
    // We only need the symbol names; detailed typing is not required for our usage.
    export class YTree {}
}
