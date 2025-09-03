Yjs Snapshot Creation and Fluid Comparison

Purpose

- Generate Yjs-side snapshots automatically during Playwright runs.
- Compare Yjs snapshots with a Fluid baseline to validate functional parity.

How Yjs snapshots are created

- Auto-hook: Import `client/e2e/utils/registerAfterEachSnapshot` at the top of a spec to enable a global afterEach snapshot.
- Snapshot helper: `DataValidationHelpers.trySaveAfterEach(page, testInfo)` writes `client/e2e-snapshots/<title>-auto-<timestamp>-yjs.json`.
- Labeling: The label is derived from the test title; `-auto-<timestamp>` is appended to avoid collisions. Pairing strips this suffix automatically.

Enable per-spec snapshots

- At the top of a spec (example):
- `import "../utils/registerAfterEachSnapshot";`
- Tests run normally; each test emits a Yjs JSON snapshot after completion.

Fluid baseline

- You only need at least one Fluid snapshot file. Store these under `outliner-fluid/client/e2e-snapshots/*-fluid.json`.
- The comparison tool picks a name-matched Fluid file when present; otherwise it falls back to the newest `*-fluid.json` as baseline.

Compare via script

- Inside `client/` run:
- Compare all: `node scripts/compareSnapshots.js`
- Filter by substring: `node scripts/compareSnapshots.js --filter add-text`
- Filter by spec file: `node scripts/compareSnapshots.js --file e2e/basic/add-text-functionality.spec.ts`
- Optional Fluid directory: `--fluid-dir /home/ubuntu/src2/outliner-fluid/client/e2e-snapshots`
- Optional explicit Fluid file: `--fluid some-baseline-fluid.json`

Run end-to-end with server

- Use `client/scripts/run-full-comparison.sh` on the Yjs branch.
- Common options:
- `--yjs-only`: run tests only on Yjs branch.
- `--spec <path>`: run only a single Playwright spec (e.g., `--spec e2e/basic/add-text-functionality.spec.ts`).
- `--compare-only`: skip tests; compare existing snapshots.
- `--fluid-only`: run only Fluid branch tests (rarely needed once baseline exists).
- Examples:
- Run a single spec on Yjs and compare to Fluid baseline:
- `bash client/scripts/run-full-comparison.sh --yjs-only --spec e2e/basic/add-text-functionality.spec.ts`
- Compare existing snapshots for that spec (no test run):
- `bash client/scripts/run-full-comparison.sh --compare-only --spec e2e/basic/add-text-functionality.spec.ts`

Expectations

- If no Yjs snapshot exists for the filtered spec, the comparison will report 0 cases.
- If a Fluid baseline is not name-matched, the newest `*-fluid.json` is used.
- Snapshot differences are printed with simple, strict text comparisons of titles and item texts.

Notes for contributors

- Keep Yjs tests short and deterministic to reduce flakiness.
- Do not mock Firebase Functions; use the emulator as per project policy.
- For large flows, split specs so each remains reliable and snapshot sizes remain small.
