# Grid render trace artifacts in E2E failures

When a Playwright test that touches a Grid fails, its report gains one or
more `grid-render-trace-*.json` attachments alongside the existing
screenshot/video/log artifacts. They reuse the structured `GridRenderTrace`
introduced in #5128 (`client/src/services/yjstable/gridRenderTrace.ts`) so
there is exactly one trace format shared by the WebMCP `getCurrentGridTrace`
tool and E2E diagnostics.

## Where the data comes from

- `client/src/services/yjstable/gridRenderTraceRegistry.ts` is an always-on,
  browser-global registry: every mounted `YjsTableView` registers a getter
  for its own `GridRenderTrace` (built the same way as the WebMCP tool) under
  its Grid ID, and unregisters on unmount. It requires no host integration
  (unlike WebMCP, which only activates when `window.WebMCP` is injected by an
  extension), so it works in a plain Playwright-driven Chromium.
- `client/e2e/fixtures/grid-render-trace.ts` exports `test`/`expect` that
  wrap Playwright's `page` fixture. On teardown, when a test's outcome
  differs from its expected status (a genuine failure or timeout — the same
  condition Playwright's own "on-failure" screenshot/trace/video modes use,
  so a `test.fail()`-flagged expected failure is correctly treated as noise,
  not something to diagnose), it calls `window.__outlinerGridRenderTraces.collect()`
  through `page.evaluate()` and attaches the result via `testInfo.attach()`.
  Capture is best-effort: a page that already crashed or closed after the
  failure logs a warning instead of throwing, so it never masks the original
  failure or fails the test a second time.

Grid E2E specs opt in by importing `test`/`expect` from
`client/e2e/fixtures/grid-render-trace.ts` instead of `@playwright/test`
directly (see `client/e2e/tables/*.spec.ts`).

## Artifact format and location

Each file is written directly under `client/test-results/<test-id>/` (via
`testInfo.outputPath()`) and then registered as a `path`-based
`testInfo.attach()`, so it is a real, independently-openable file — not only
recoverable by decoding a reporter's JSON output. `client/test-results/` is
uploaded as a CI artifact whenever a job fails (see
`.github/workflows/ci-test-e2e.yml`), with no dependency on which reporters
are enabled. Two kinds of file are written per failing test that had a Grid
mounted:

- `grid-render-trace-index.json` — one per test, correlating the trace(s)
  with the failure:
  ```json
  {
      "test": "Suite name > test title",
      "file": "/abs/path/to/the.spec.ts",
      "project": "tables",
      "retry": 0,
      "url": "http://localhost:7090/grids/demo/some-grid",
      "gridIds": ["some-grid"]
  }
  ```
- `grid-render-trace-<gridId>.json` — one per mounted Grid, the
  `GridRenderTrace` itself: a `config` stage (query, revision, column
  order/visibility), an optional `query-execution` stage (backend
  provenance), a `client-state` stage (what the sync adapter has), and a
  `render` stage (what was actually drawn, with a bounded row/column
  sample). Comparing stages pairwise shows where a divergence started; see
  `client/src/services/yjstable/gridRenderTrace.ts` for the exact shape and
  its size bounds (row/column/value truncation), which keep the artifact
  small even for a large query result.

If no Grid was mounted when the test failed, no `grid-render-trace-*` files
are attached — existing screenshots, videos, and logs are unaffected either
way, and successful runs never build or attach a trace at all.

## Validating the mechanism

`client/e2e/env/env-grid-render-trace-artifact-9f433761.spec.ts` exercises
the same collection/attachment functions the fixture calls automatically,
against a real mounted demo Grid, so a broken stage or a renamed field is
caught by CI without needing a red run.

To see the mechanism trigger on an actual failure (e.g. after touching the
render pipeline), force one locally:

1. Temporarily break an assertion in a spec that imports `test`/`expect`
   from `client/e2e/fixtures/grid-render-trace.ts` (for example, expect a
   nonexistent column header in `client/e2e/tables/tbl-standalone-grid-page-2e6b9f14.spec.ts`).
2. Run it with `scripts/test.sh client/e2e/tables/tbl-standalone-grid-page-2e6b9f14.spec.ts`.
3. Look under `client/test-results/<the failing test's directory>/` and
   confirm it contains `grid-render-trace-index.json` and a
   `grid-render-trace-<gridId>.json` next to the existing `error-context.md`
   (and any screenshot/video), and that the index's `gridIds`/`url` correlate
   with the failing test.
