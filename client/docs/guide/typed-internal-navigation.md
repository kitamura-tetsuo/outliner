# Typed internal navigation (issue #5629)

Application-owned internal URLs are built with SvelteKit's typed
`resolve()` API from `$app/paths`, not the generic `resolvePath()` wrapper
in `client/src/utils/pathUtils.ts`. Incorrect route IDs or parameter names
fail `tsc`, and the `svelte/no-navigation-without-resolve` rule (error
severity for migrated producers, scoped in `client/eslint.config.js`) keeps
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
  (`/settings`, `/projects/new`, `/error/project-unavailable`, the debug
  back-link, and the non-demo table-schedule redirect stub stay on the
  generic wrapper until the scope follow-up migrates them.)

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
5. Destinations that are not SvelteKit routes (`/search?query=`,
   `/test`) cannot use typed `resolve()` and stay on `resolvePath()` with a
   comment saying so.

## Deferred stages (not this migration)

`resolvePath()` stays until its owning stages migrate: Breadcrumb's second
resolution (and its item call sites), the `YjsTableBlock → YjsTableView`
`sourceTableHref` prop contract, `ScheduleRuleList` reference records,
attachment URLs, Paraglide output, the opaque debug bridge in
`client/src/lib/debug.ts`, and the scope follow-up routes (debug,
error/project-unavailable, projects/new, settings, and the non-demo
table-schedule redirect stub). Final wrapper deletion and global rule
restoration are separate work.

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
