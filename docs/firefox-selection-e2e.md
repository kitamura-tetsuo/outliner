# Firefox outline-selection E2E

[Issue #5560](https://github.com/kitamura-tetsuo/outliner/issues/5560) adds desktop Firefox execution of the existing outline-selection scenarios. Both engines use the same spec files, input gestures, and semantic assertions. The browser projects live in [client/playwright.config.ts](../client/playwright.config.ts); their Firefox membership is defined in [client/playwright-selection-suite.ts](../client/playwright-selection-suite.ts).

## Required suite

| Firefox project             | Required files                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `firefox-selection-core-4`  | `client/e2e/core/slr-[a-p]*.spec.ts`                                                    |
| `firefox-selection-core-4b` | All other `client/e2e/core/slr-*.spec.ts` files                                         |
| `firefox-selection-new`     | Every `client/e2e/new/slr-*.spec.ts` file                                               |
| `firefox-selection-basic`   | `client/e2e/basic/reproduce_issue_1512.spec.ts` and explicitly retained selection specs |

Every case in these files remains required in Chromium as well. Newly added matching files and cases are included automatically. The collection guard checks actual case membership, so a fixed historical case count is not the definition of completeness.

Firefox launches Playwright's Firefox binary with the Desktop Firefox device settings. Chromium keeps its existing executable override, launch arguments, and clipboard permissions. Firefox's native `dom.events.testing.asyncClipboard` preference permits the real clipboard API in automated tests; copy assertions still read the actual contents transferred by keyboard copy. Optional V8/CDP coverage is recorded as not collected for Firefox. It does not disable the scenarios or their execution evidence.

## Prepare the local runtime and services

Run these commands from the repository root in a dedicated development/test environment. The setup scripts use the repository's local Firebase emulators, Yjs server, log service, and SvelteKit test server. They can restart those test services and clear their existing logs. Use Node.js 22 or newer and Java 21 or newer; the supported Linux setup installs the remaining tools and OS dependencies when available.

```bash
set -euo pipefail
npm ci
npm ci --prefix client
E2E_BROWSER=firefox bash scripts/setup.sh
npx dprint fmt
```

The explicit client install resolves the runner from `client/package-lock.json`. Firefox preparation checks that the installed `@playwright/test`, `playwright`, and `playwright-core` versions agree with that lockfile, runs the installed Playwright CLI to install Firefox and its system dependencies, and probes an actual headless Firefox launch. It repeats the Firefox check even if `.setup-installed` exists or a restored browser cache contains only Chromium. An installation or launch failure stops preparation.

Prepare Firefox explicitly before the first Firefox test on an existing setup: `scripts/test.sh` checks service availability, so already-running services alone do not prove that Firefox is installed.

After dependencies and tools are installed, the narrower service-startup path used by CI can also refresh the local test runtime:

```bash
set -euo pipefail
npm --prefix server run build
E2E_BROWSER=firefox bash -c '
  ROOT_DIR="$PWD"
  source scripts/common-config.sh
  source scripts/common-functions.sh
  ensure_playwright_browsers
'
bash scripts/ci-e2e-start.sh
```

[`scripts/ci-e2e-start.sh`](../scripts/ci-e2e-start.sh) verifies the server build, generates emulator configuration, starts the PM2 test services, and waits for readiness. It assumes the dependency/tool preparation has already completed. The full `scripts/setup.sh` command above already performs local service startup; these are alternative startup paths.

Default endpoints come from [`scripts/common-config.sh`](../scripts/common-config.sh): SvelteKit on `http://127.0.0.1:7090`, Yjs on port `7093`, log service on `7091`, and Firebase Auth/Firestore/Functions/Hosting/Storage on `59099`/`58080`/`57070`/`57000`/`59200`. Tests seed isolated projects through the existing test helpers and authenticate against the Auth emulator. Use these test endpoints and generated `.env.test` configuration. The public demo and production user projects are outside this test workflow.

## List the Firefox suite

This command uses the same configuration as normal CI. Listing loads and collects cases; it does not launch Firefox or establish that any scenario passed.

```bash
E2E_BROWSER=firefox npm --prefix client run github:test:e2e -- \
  --project=firefox-selection-core-4 \
  --project=firefox-selection-core-4b \
  --project=firefox-selection-new \
  --project=firefox-selection-basic \
  --list
```

## Run all required files sequentially

The repository's local E2E rule is to run one spec file at a time. After preparation and the collection guards below, the following Bash command obtains the actual inventory for each Firefox project and feeds one file at a time to `scripts/test.sh`. It uses the existing configuration and keeps a matching expected-case inventory for every invocation.

Each invocation receives a separate execution report and artifact directory. The command stops with a nonzero status on the first collection or test failure. A stopped or interrupted sequence is a partial run; it cannot establish full-suite success. Re-run the complete command after fixing a problem before claiming a complete passing suite.

```bash
(
  set -euo pipefail
  export E2E_BROWSER=firefox
  run_dir="$PWD/job_logs/firefox-local-$(date -u +%Y%m%dT%H%M%S)-$$"
  mkdir -p "$run_dir"
  index=0

  for project in \
    firefox-selection-core-4 \
    firefox-selection-core-4b \
    firefox-selection-new \
    firefox-selection-basic
  do
    inventory="$run_dir/$project.collection.json"
    (
      cd client
      E2E_PROJECT="$project" \
        PLAYWRIGHT_COLLECTION_E2E_DIR="$PWD/e2e" \
        PLAYWRIGHT_COLLECTION_OUTPUT="$inventory" \
        npm run github:test:e2e -- --project="$project" --list \
          --reporter=../scripts/tests/helpers/playwright-collection-reporter.mjs
    ) 2>&1 | tee "$run_dir/$project.collection.log"

    node --input-type=module - "$inventory" <<'NODE_FILES' | tee "$run_dir/$project.files.txt" > /dev/null
import fs from 'node:fs';
const inventory = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(inventory.cases) || inventory.cases.length === 0) {
    throw new Error('The Firefox project inventory is empty or invalid');
}
for (const file of [...new Set(inventory.cases.map(test => test.file))].sort()) {
    console.log(file);
}
NODE_FILES

    while IFS= read -r spec; do
      index=$((index + 1))
      spec_dir="$run_dir/$project-$index"
      mkdir -p "$spec_dir"

      node --input-type=module - "$inventory" "$spec" <<'NODE_SPEC' | tee "$spec_dir/expected.json" > /dev/null
import fs from 'node:fs';
const inventory = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cases = inventory.cases.filter(test => test.file === process.argv[3]);
if (cases.length === 0) throw new Error('The selected spec has no expected cases');
console.log(JSON.stringify({ ...inventory, cases }, null, 2));
NODE_SPEC

      E2E_PROJECT="$project" \
        E2E_EXECUTION_ID="$project-$index" \
        E2E_EXPECTED_COLLECTION="$spec_dir/expected.json" \
        E2E_EXECUTION_REPORT="$spec_dir/execution.json" \
        PLAYWRIGHT_HTML_OUTPUT_DIR="$spec_dir/html" \
        bash scripts/test.sh "client/e2e/$spec" -- \
          --project="$project" --workers=1 --output="$spec_dir/artifacts" \
          2>&1 | tee "$spec_dir/test.log"
    done < "$run_dir/$project.files.txt"
  done
  printf 'Completed all Firefox selection spec files. Evidence: %s\n' "$run_dir"
)
```

`set -euo pipefail` preserves failures through `tee`. The inventory commands deliberately select a collection reporter; execution keeps the configured Firefox execution reporter. A `--reporter` override on the test command would replace that verification and evidence path.

## Run one selected spec

Use the project owning the file from the table above. The `--` separator is required: arguments after it are forwarded by `scripts/test.sh` to Playwright. This example runs the repeated Shift+Arrow regression in actual Firefox and retains its evidence outside the default output directory.

```bash
(
  set -euo pipefail
  run_dir="$PWD/job_logs/firefox-single-$(date -u +%Y%m%dT%H%M%S)-$$"
  mkdir -p "$run_dir"
  E2E_BROWSER=firefox \
    E2E_PROJECT=firefox-selection-basic \
    E2E_EXECUTION_REPORT="$run_dir/execution.json" \
    PLAYWRIGHT_HTML_OUTPUT_DIR="$run_dir/html" \
    bash scripts/test.sh client/e2e/basic/reproduce_issue_1512.spec.ts -- \
      --project=firefox-selection-basic --workers=1 --output="$run_dir/artifacts" \
      2>&1 | tee "$run_dir/test.log"
)
```

For the reverse cross-item drag regression, select `firefox-selection-core-4b` and `client/e2e/core/slr-reverse-drag-matches-forward-drag-9c3f5ad1.spec.ts`. For wrapped-text dragging, use the same project with `client/e2e/core/slr-wrapped-selection-follows-visual-lines-4b7d1e92.spec.ts`. A deliberate local file filter proves only that file's result.

## Coverage and execution guards

Install the locked environment-test dependencies, then run the actual collection guards. They do not need running application services or a browser launch.

```bash
npm ci --prefix scripts/tests --ignore-scripts
(
  cd scripts/tests
  npx vitest run \
    env-playwright-collects-every-spec-7d41ae62.spec.ts \
    env-firefox-selection-coverage-78ad2b91.spec.ts
)
```

The selection guard independently discovers the required paths, obtains an unfiltered case inventory, and compares it with collection from the production projects under the CI engine/project environment. It checks both engines and the Firefox CI matrix. Its adversarial cases cover missing matchers/cases/projects, an incorrectly named Chromium project, new matching files, and retained moved specs.

After preparing Firefox, run the separate execution-boundary tests:

```bash
(
  cd scripts/tests
  npx vitest run env-firefox-execution-results-64ab7e91.spec.ts
)
```

These tests invoke the actual `npm run github:test:e2e` entrypoint with an isolated temporary spec and the production browser configuration/reporters. They verify passing execution, a deliberate assertion failure, initial-attempt artifacts, skip/fixme/expected-failure rejection, zero collection, missing Firefox, collection-only reporting, an omitted case, a missing inventory, late teardown console evidence, and report-persistence failure. They do not exercise the application's selection behavior; the required SLR/basic specs provide that coverage.

## CI behavior and evidence

Whenever normal CI reaches its Chromium E2E phase, [ci-test-e2e.yml](../.github/workflows/ci-test-e2e.yml) schedules all four Firefox projects in the same matrix with `fail-fast: false`. Firefox does not depend on Chromium test success. The independent selection-coverage job verifies project membership. The `firefox-selection-basic` shard also runs the execution-boundary guard.

Before a Firefox shard executes, CI collects that whole project's expected case inventory through the same npm command and environment, then supplies it to the execution reporter as `E2E_EXPECTED_COLLECTION`. A passing subset cannot satisfy that inventory. CI uses project groups to distribute work; local sequential execution above partitions the same inventory into individual spec files.

| Evidence                 | Contents and location                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution JSON           | `E2E_EXECUTION_REPORT`; actual engine/version, installed Playwright version, project/case identities, attempts, statuses/counts, errors, attachments, and inventory violations        |
| Browser runtime probe    | `E2E_BROWSER_RUNTIME_REPORT` in CI; setup's actual Firefox launch, version, executable, and failure details                                                                           |
| Playwright JSON and HTML | Configured JSON report and HTML report; `scripts/test.sh` also writes its JSON report under `logs/tests/`                                                                             |
| Attempt artifacts        | A trace and screenshot retained for every Firefox browser attempt when a page was available, including successful attempts, the first attempt, expected failures, and retries         |
| Browser console          | An attached `browser-console.log` written while the page exists, including console messages, page errors, and failed requests; retained even if failure happens during later teardown |
| Setup and service logs   | CI `job_logs/`, application service logs, and `execution-context.json`, including failed setup/startup when no page or test result exists                                             |

Firefox uses `trace: "on"` and `screenshot: "on"` so Playwright cannot discard artifacts for an expected failure or an attempt that the Firefox reporter later rejects. The CI artifact name is `e2e-artifacts-<engine>-<project>-<run-id>-<run-attempt>`, with a retention period of two days. Attempt directories distinguish Playwright retries, and separate shard artifacts prevent cross-project overwrites. CI retains successful execution reports and attempt artifacts as well as failure evidence. The local commands above also use unique run and spec directories.

A full-suite success requires all required cases from all four projects to have executed passing results in actual Firefox. Zero tests, skipped/fixme/expected-failure cases, missing cases, an unavailable browser, interrupted work, and report-persistence errors produce non-success. Reports with `mode: collection` are inventories only. A successful browser launch probe is setup evidence; it is not a successful selection scenario.

## Handling failures

Inspect `server/logs/test-svelte-kit.log` first for application startup problems, then the per-attempt error, browser console, screenshot, and trace. A trace can be opened with the installed client CLI:

```bash
node client/node_modules/playwright/cli.js show-trace /absolute/path/to/trace.zip
```

Record a timeout with the spec, project, attempted command, and retained evidence. Restricted-host failures that prevent Firefox content processes from running are environment failures and require a suitable runtime; they do not establish a product regression or a passing test.

A Firefox product defect revealed by a required scenario remains a failed assertion and a separate blocker to report with its evidence. Issue #5560 enables the browser suite; it does not authorize changing production selection/rendering semantics, skipping the case, changing Firefox's expected outcome, replacing real gestures with store writes, or repairing selection/style state inside the test to produce a passing result. The suite's existing semantic assertions also do not guarantee reproduction of the darker-highlight screenshot that motivated the issue.

## Moving or renaming a required case

If a required spec moves outside the `core/slr-*`, `new/slr-*`, or basic #1512 paths, add its destination relative to `client/e2e/` to [client/playwright-selection-retained.json](../client/playwright-selection-retained.json) in the same change. For example, a destination `client/e2e/regressions/renamed-selection.spec.ts` is recorded as `regressions/renamed-selection.spec.ts`. Preserve the manifest's other entries. If a case alone moves to a different file, retain that destination file too.

Both Chromium `basic` and `firefox-selection-basic` include these retained destinations. Keep entries pointed at existing files and keep the moved scenario's body/assertions. Run both collection guards and the moved spec in both engines. Files that still match the required globs remain automatic members. A relocation is not a reason to drop a case's dual-engine coverage.
