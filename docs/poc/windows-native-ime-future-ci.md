# Future task: permanent native Windows IME regression CI

This is an independent future implementation task. The frozen PoC workflows deliberately reproduce a historical application and are not required CI. No permanent integration is implemented here.

Prerequisites: independently review/merge the necessary production cursor-resolution, browser-WASM and Alt+Click corrections; choose the intended production baseline; validate the oracle against that baseline without weakening document/cursor/native assertions.

The future regression job must build the application revision under review, record its exact SHA separately from the harness SHA, and reject stale/pinned results as evidence for a different revision. Define which PR events and platforms require the test, runner/image support, dependency/toolchain installation, cold-cache behavior, permissions and runtime budget. Keep emulators disposable and authenticated; no production credentials or public emulator exposure.

Retain authoritative Win32 input, active Microsoft Japanese TSF, fresh desktop UIA candidate identity/navigation/selection, native confirmation/cancellation, ordinary `textarea.global-textarea`, canonical Y.Text, complete logical cursor identities/offsets and local selections. All four editing scenarios and all nine demonstrated document/cursor mutation controls must run; native stale-generation/Latin controls remain mandatory too. Process readiness or successful transport cannot substitute for editor outcomes. Failed oracle reads must fail the job.

Add tests for harness state retirement, session/generation correlation, cleanup after partial failure, WSL lifetime, cold dependency installation and genuine application regressions. Demonstrate the final test fails on an independently defective production revision and passes on the corrected revision. Define safe retry policy; distinguish infrastructure errors from rejected state assertions, retain diagnostic evidence and never silently convert failures to success.

Plan durable compact evidence with SHA-256/source identifiers and sensitive-data review, artifact retention, maintenance ownership, runner image upgrades, expected execution time/cost, cancellation and teardown. Decide how branch protection and required statuses will be updated in that separate task.

Long-preedit, general popup placement and Ubuntu Firefox/Fcitx5 verification remain separate coverage decisions; the Windows PoC does not establish them. Do not close Issue #5501 solely because this future job succeeds.

Next-session prompt: proceed sequentially. Review the separated production PRs and their validation limitations first, then implement current-revision CI only when requested. Preserve the strict native and canonical-state oracles and the archive references.
