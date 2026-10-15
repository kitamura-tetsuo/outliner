# Typed internal navigation (issue #5629)

Application-owned internal URLs are built with SvelteKit's typed
`resolve()` API from `$app/paths`. The retired generic `resolvePath()`
wrapper has been removed. Incorrect route IDs or parameter names fail `tsc`,
and the globally enabled `svelte/no-navigation-without-resolve` rule keeps
new navigation on the typed path.

## Where the helpers live

- `client/src/lib/publicProject.ts`: `projectRoute()`,
  `projectPageRoute()`, `projectPageDiffRoute()`,
  `projectPageScheduleRoute()`. The legacy `projectBasePath()` /
  `projectPagePath()` string builders stay as the specified encoding oracle
  (and for non-navigation uses); the `*Route` twins must produce
  byte-identical URLs for the same accepted inputs.
- `client/src/lib/managementPaths.ts`: one `*Route` per management
  destination, plus `projectObjectsSelectedRoute()` for the
  `?selected=`-bearing Object Manager links.
- Static destinations (`/`) call `resolve()` directly at the call site.
  Project creation and settings links use the typed project helpers, and the
  legacy table-schedule route redirects through `projectSchedulesRoute()`.

## Rules for new producers

1. Pass RAW names and let the helper encode each parameter once with
   `encodeURIComponent`. Never encode a whole URL as one parameter, never
   double-encode, and never collapse a registered demo slug (`demo-ja`).
2. Keep the official `ResolvedPathname` return type end to end — no `string`
   widening, no `any`/`unknown`, no renamed generic string resolvers.
   Helpers returning `ResolvedPathname` satisfy the navigation lint rule;
   plain `.ts` modules (no type-aware lint context) must call `resolve()`
   directly instead.
3. `resolve()` rejects empty params at runtime, while the old string
   builders never threw. Accepted flows guarantee non-empty names;
   transiently-empty renders (defaulted props, pre-mount state) must guard
   with `{#if}` rather than render a typed link.
4. Destinations without a demo twin (import-export, settings, types,
   page-schedule) resolve through the generic route ID; demo slugs fall
   through to it at runtime, which is the same destination as before.
5. Query-bearing internal destinations resolve their registered pathname and
   preserve the encoded query. Opaque resource and already-localized URLs stay
   outside route-ID coercion; document such boundaries at their call sites.

## Enforcement and exception inventory

The navigation rule is enabled globally at error severity with no category-wide
ignore options or directory exclusions. Three documented line-scoped exceptions remain at genuine opaque
boundaries: attachment resource URLs, Paraglide-owned localized URLs, and
debug-bridge URLs. Each exception names its production-origin regression. The debug bridge applies the configured base through the official
path primitive. Shared internal-link props, including the Grid source
Table link, retain `ResolvedPathname` through rendering without a second resolve.

## Regression coverage

- `client/src/lib/typedRoutes.test.ts`: every helper against the legacy
  builders through the real resolver (Japanese text, spaces, `/ % ? #`,
  percent-looking names, demo slugs, query links). No `$app/paths` mock.
- `client/src/lib/typedRoutes.base-spec.ts`: runs only under
  `client/vitest.base.config.ts` (real framework, `paths.base =
  "/test-base"`); the base appears exactly once.
- `client/src/lib/typedResolveNegative.fixture.ts`: invalid route IDs and
  parameter names that must fail `tsc` (never executed).
- Producer tests (`outlineItemNavigation`, `OutlinerToolbar`, `PageList`,
  `BacklinkPanel`, `ProjectSettingsView`) use the real resolver; only
  `$app/navigation` / `$app/state` / persistence boundaries are replaced.
