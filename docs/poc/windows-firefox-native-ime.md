# Windows Firefox native Microsoft Japanese IME PoC

This isolated experiment concerns Issue #5501 and does not change the editor or PR #5504.
It is not a mandatory CI gate. Overall success requires capabilities A through K.

## Execution

The workflow `.github/workflows/poc-windows-firefox-native-ime.yml` runs on the standard
GitHub-hosted `windows-2025` image. It can run on its PoC branch through push or
`workflow_dispatch`. Run `powershell -File scripts/poc/windows-native-ime/run.ps1`
locally on Windows for the same procedure. The initial experiment uses the ordinary
Firefox desktop installation, a fresh profile and a visible standalone textarea.

Results and runner facts are written to `artifacts/windows-native-ime/` and uploaded
on success or failure. `results.json` records the tested commit SHA and run URL.
`environment.json` records OS build, image version, session, input desktop, display,
and language/input settings. `interactive-desktop.json` requires actual SendInput
mouse and keyboard delivery to the foreground Firefox textarea, not UIA enumeration.

Japanese provisioning uses `Add-WindowsCapability` for `Language.Basic~~~ja-JP~...`
if absent, followed by `Set-WinUserLanguageList` and the Microsoft Japanese TSF TIP
`0411:{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}`.
Installation results, reboot requirements and before/after settings are retained.
Setting culture is not used as activation evidence. Active foreground HKL and IMM
engine description are logged; configured TIP alone is not exact TSF activation proof.

## Observation contract

Input uses virtual-key `SendInput`; no Unicode injection, clipboard, WM_CHAR,
synthetic DOM composition, or browser input API is used. Browser trusted composition
and text/selection telemetry supplements native evidence. UIA searches start at the
desktop root and freshly query `IME_Candidate_Window` for every observation. Candidate
ownership must be a Windows input host, with Firefox still foreground and composing.
Missing, inaccessible, ambiguous or unchanged observations throw rather than pass.
Selected native candidate identity and text must change on navigation, and the selected
text must match the committed textarea value. Unrecognized UIA structures remain
unproven and are retained in desktop snapshots for investigation.

Screen capture availability is recorded separately from UIA metadata. Screenshots
need inspection before asserting visual candidate visibility. The harness takes
snapshots rather than subscribing to UIA menu/selection events; appearance and
disappearance are sampled, not claimed as event notifications.

## Outliner integration boundary

Existing Ubuntu E2E uses `.github/actions/setup-e2e-deps`, a Bash startup script
`scripts/ci-e2e-start.sh`, PM2 services, Firebase emulators and the Yjs server.
The startup uses `ln -sfn`, `pgrep`, `pkill` and Linux port cleanup. Existing Chromium
IME tests and `client/e2e/utils/treeValidation.ts` / `cursorValidation.ts` provide
application-state oracles but do not observe Windows native candidate selection.
No complete Windows service migration is included. A standalone success does not
verify Outliner's production `textarea.global-textarea`, canonical Yjs text or cursor.
PR #5504 is not the tested revision unless a report explicitly identifies its SHA.

## Run evidence and capability results

Pending first hosted run. No capability is yet claimed PROVEN. This section will be
updated with the real run URL, SHA, Windows/Firefox versions, artifacts and exact
failure observations. REQ-005 and PR #5504 Windows compatibility remain unverified.
