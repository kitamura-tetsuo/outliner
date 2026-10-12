# Browser dependency regression tests

From the repository root, install root dependencies with `npm ci`, then install client dependencies with `npm ci --prefix client`. Run:

```sh
node --test client/tests/browser/libpg-query-browser.test.mjs
```

The test launches headless Playwright Chromium. Install its supported Chromium first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an available system Chromium. It starts its own loopback Vite server and needs no backend or Firebase credentials.

The test compiles the actual production `shared/src/services/explicitSelectAlias.ts`, retains its package import, and lets Vite resolve the installed browser ESM entry and module-relative WASM. It checks successful initialization/explicit SQL aliases, rejected implicit aliases and invalid SQL, the actual WASM HTTP response, and the unmodified Node/CJS parser path. It fails when the browser loader has no default factory export. This isolates the dependency boundary; it does not replace full application build/startup checks.
