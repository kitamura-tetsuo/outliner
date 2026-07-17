# Shared schema (`shared/`)

The SharedTree/Yjs document schema — the `Comments`, `Item`, `Items`, and
`Project` wrappers over the `orderedTree` `YTree` + value-map layout — is defined
**once** in the framework-neutral `shared/` workspace and compiled into both the
client and the server. This resolves issue #3798, where three near-identical
copies (`client/src/schema/app-schema.ts`, `client/src/schema/yjs-schema.ts`,
`server/src/schema/app-schema.ts`) had begun to drift.

## Layout

```
shared/
  package.json            # @outliner/shared — declares its yjs/uuid deps (see "Resolution")
  src/
    app-schema.ts         # THE single source of truth
    logger.ts             # framework-neutral logger (console default + setLoggerFactory)
    types/yjs-types.ts
    utils/treeUtils.ts
    utils/itemTraversal.ts
```

`shared/src` contains **no Svelte, DOM-only, or Node-only imports** other than
browser globals guarded by `typeof window !== "undefined"`. It has no
`yjs-orderedtree.d.ts` of its own: each consumer's ambient shim
(`client/src/types/yjs-orderedtree.d.ts`, `server/src/types/yjs-orderedtree.d.ts`)
covers it during that consumer's compile.

## How each side consumes it

The existing `client/src/schema/app-schema.ts`, `client/src/types/yjs-types.ts`,
`client/src/utils/{treeUtils,itemTraversal}.ts` and their server counterparts are
now **thin re-exports** of `shared/`, so the ~50 existing import sites are
unchanged.

- **Client** — `svelte.config.js` aliases `$shared` → `../shared/src`; Vite
  bundles the shared source. `vite.config.ts` sets `resolve.dedupe` for
  `yjs`/`yjs-orderedtree`/`uuid` so the bundle contains a single Yjs instance
  (no "Yjs was already imported" dual-package hazard). The client wires its pino
  logger into the shared logger via `setLoggerFactory` in
  `client/src/schema/app-schema.ts`.
- **Server** — `server/tsconfig.json` sets `rootDir: ".."` and includes
  `../shared/src`, so the shared source compiles together with the server using
  the server's own Yjs. Output is emitted under `dist/server/src/**` and
  `dist/shared/src/**`; the server entry points in `package.json`
  (`main`/`start`/`start:log-service`) point at `dist/server/src/*`.

## Resolution (why `shared/` has its own `node_modules`)

This repo is **not** an npm-workspaces monorepo — `client/`, `server/`, and
`functions/` install independently and CI runs `cd <pkg> && npm ci` per package.
Because `shared/` is a sibling directory, `tsc` cannot resolve `shared/src`'s
bare `import "yjs"` / `import "uuid"` by walking up into a consumer's
`node_modules`. So `shared/node_modules` is created as a **symlink** to an
already-installed consumer's `node_modules` (which has `yjs`, `uuid` and
`yjs-orderedtree`): the client/server `postinstall` scripts and
`scripts/common-functions.sh` create it. A symlink is used deliberately — it
needs no registry access, so it works in the offline/baked CI test container
where a fresh `npm install` would fail (and abort `set -e` setup).

The **client** wins the symlink deterministically: `client`'s `postinstall`
uses `ln -sfn ../client/node_modules` (force), while `server`'s `postinstall`
and `common-functions.sh` only create the link when it is absent. So whenever
the client is present (every e2e shard and every client build) the link points
at `client/node_modules`, and `shared/src`'s `import "yjs"` resolves to the
exact same physical package the client bundles — guaranteeing a single Yjs
instance in `vite dev`'s dep-optimizer graph as well as the production bundle.
Only a server-only image (no client checked out) points the link at
`server/node_modules`, which is all the server's `tsc` type-check needs; the
compiled server always loads `yjs` from `server/node_modules` at runtime.

The symlink is **only** used by the type-checker and is never loaded at runtime:
the client bundles + dedupes to one Yjs instance, and the compiled server
resolves `yjs` from its own `server/node_modules` (its emitted files live under
`server/dist`). This keeps a single Yjs instance per runtime.

## Docker / deploy

Because the server build now needs `../shared`, the server image builds from the
**repository root** context (see `server/Dockerfile`,
`.github/workflows/build-server.yml`, and `docker-compose.yml`).
