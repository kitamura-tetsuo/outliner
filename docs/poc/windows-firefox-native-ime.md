# Windows Firefox native Microsoft Japanese IME PoC

The standard hosted Windows runner supports GUI Firefox, real Microsoft Japanese composition and a visibly native candidate list. The tested UIA query returns no `IME_Candidate_Window`, so automated selected-candidate observation is not established. Overall A–K success, Issue #5501/REQ-005 and PR #5504 compatibility remain unverified.

## Executed environment

Primary [Actions run 37772921746](https://github.com/kitamura-tetsuo/outliner/actions/runs/37772921746), 2026-10-08, tested SHA `ff675b832e1419231f79df10183e8b25fe3b93ca`. Base main: `0d83434277463783433d95cf17317a7fec9cd609`; PR #5504 was not tested.

| Fact                | Recorded value                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| Runner              | Standard GitHub-hosted `windows-2025`                                         |
| OS                  | Windows Server 2025 Datacenter, 10.0.26100, build 26100                       |
| Image               | `win25-vs2026`, `20260925.250.1`                                              |
| Firefox             | Regular preinstalled desktop 156.0.1, fresh profile, non-headless             |
| Desktop             | Session 2, input desktop `Default`                                            |
| Display             | 1024 × 768, DPR 1, window DPI 96                                              |
| Initial input       | en-US, `0409:00000409`, no default override                                   |
| Activated input     | Microsoft Japanese TIP, language 0411, foreground HKL `4110411`               |
| Optional capability | `Language.Basic~~~ja-JP~0.0.1.0`: state 0, NotPresent; actual IME still works |

[Primary artifact](https://github.com/kitamura-tetsuo/outliner/actions/runs/37772921746/artifacts/11548393612) contains 74 files: environment and profile observations, Firefox IME logs, browser events, UIA snapshots, keyboard traces, screenshots and failure/results. Upload succeeded after the native assertion failed. Artifacts expire after 14 days; these inspected screenshots are committed for durable review:

- [Native candidate list](assets/windows-firefox-candidates-37772921746.png), primary run: 日本, 二本 and other candidates, with 二本 highlighted. Visual proof does not establish an automated selection oracle.
- [Inline preedit and prediction UI](assets/windows-firefox-preedit-37771721892.png), [run 37771721892](https://github.com/kitamura-tetsuo/outliner/actions/runs/37771721892), SHA `244a4d2b1e81ffc6066c18dc0f0edd9fe48adf9f`.
- [Independent GUI transport](assets/windows-firefox-transport-37768108913.png), [run 37768108913](https://github.com/kitamura-tetsuo/outliner/actions/runs/37768108913), SHA `41362f4d33d4497047ddf47bf88a32456da706ce`: real abc in Firefox.

## Capability results

The report distinguishes inspected native screenshots from executable UIA assertions. The pipeline's E assertion fails; candidate appearance itself is visually proven.

| Capability                                 | Classification | Authoritative evidence and limits                                                                                                                                                                                 |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. GUI Firefox                             | PROVEN         | Actual HWND/PID, desktop snapshot and inspected Firefox screenshots.                                                                                                                                              |
| B. Microsoft Japanese IME activated        | PROVEN         | Exact Microsoft active TSF profile and language 0411 after session-wide activation; both HRESULTs 0. Native Japanese Firefox composition follows.                                                                 |
| C. OS input reaches Firefox through IME    | PROVEN         | Virtual-key SendInput accepts two events per key; foreground Firefox produces trusted compositionstart/update after romaji. Input trace and browser events.                                                       |
| D. Inline Japanese composition             | PROVEN         | Preedit short: に; extended: にほｎ; composing true, same generation 1. Trusted native updates and screenshots.                                                                                                   |
| E. Native candidate appears                | PROVEN         | Inspected candidate-open.png after two Space keys shows a numbered native popup and highlighted 二本. Automated identity assertion fails.                                                                         |
| F. Candidate contents/selection observable | PARTIAL        | Screen text/highlight is visible. Fresh desktop UIA query returns []; no machine-readable selected candidate established.                                                                                         |
| G. Navigation and confirmation             | BLOCKED        | Primary run stops before Down/Enter because the selected-item oracle is unavailable.                                                                                                                              |
| H. Cancellation                            | BLOCKED        | Primary run stops before the cancellation sequence.                                                                                                                                                               |
| I. Negative controls                       | PARTIAL        | Latin input in the same textarea plus fresh empty UIA query rejects the candidate assertion; explicit missing-window rejection succeeds. Positive restoration and remaining adversarial controls are not reached. |
| J. Production textarea                     | BLOCKED        | Standalone candidate observation did not pass. Production global textarea not exercised; Linux bootstrap boundary below.                                                                                          |
| K. Outliner document/cursor                | BLOCKED        | No production Yjs text or logical cursor observation. REQ-005 is not verified.                                                                                                                                    |

## Reproduction and input mechanism

The isolated workflow `.github/workflows/poc-windows-firefox-native-ime.yml` provides independent inventory, GUI transport and native IME jobs on windows-2025. It runs on its dedicated branch through push or workflow_dispatch and is not a required CI gate. On a disposable Windows desktop with Node 22:

```powershell
powershell -NoProfile -File scripts/poc/windows-native-ime/run.ps1
```

The fixture has a normal visible textarea. A real Win32 mouse click focuses it using read-only browser geometry. Foreground PID, actual accepted input and browser focus are checked; UIA enumeration alone never establishes an interactive desktop. Virtual-key SendInput delivers romaji, mode keys, Space, arrows, Enter and Escape. No Unicode injection, clipboard paste, WM_CHAR, synthetic DOM composition or browser input API is used. PostMessage is used only for WM_INPUTLANGCHANGEREQUEST.

Setup adds ja-JP to the current user's language list, selects the Microsoft Japanese TIP, loads the Japanese layout and requests the Firefox input language. Native COM then activates the TSF profile with `TF_IPPMF_FORSESSION | TF_IPPMF_ENABLEPROFILE` (`0x20000001`) and queries the active keyboard-category profile:

```text
CLSID 03B5835F-F03C-411B-9CE2-AA23E1171E36
profile A76C93D9-5523-4E90-AAFA-4DB112F9AC76
language 0411
activationHRESULT=00000000 queryHRESULT=00000000 activeMicrosoft=True
```

Culture, HKL and configured settings alone cannot prove activation. The exact live TSF identity and actual native composition support B. The active query runs in the caller in the same session after session-wide activation, not directly inside Firefox's private TSF thread manager.

No capability installation is needed in the primary run. If native preedit fails, a supported Add-WindowsCapability fallback runs in a bounded child process; reboot-required results fail explicitly because reboot/resume is not implemented. Earlier installations exceeded the 300-second bound. Earlier false preedit failures were traced to Windows PowerShell 5 decoding HTTP JSON without an explicit charset; the primary run corrects it to `application/json; charset=utf-8`. Those earlier failures do not establish IME absence.

## Native observation and failure sensitivity

Each candidate query starts freshly at the desktop root. Records include AutomationId, control type, process/PID, HWND, runtime ID, bounds, visibility, SelectionItem state, composition generation and foreground profile. The assertion requires one visible native window during the current focused Firefox composition. Browser events supplement native observations.

Exact primary failure:

```text
PHASE E: querying native desktop candidate UI
CANDIDATE RAW open []
PROBE FAILURE at E : Missing or ambiguous visible native candidate window
```

The inspected screen nevertheless contains a native candidate popup. It resembles a classic list; its owning HWND, process/provider and selected-item pattern are not established by the screenshot. Desktop snapshots are preserved. An additional diagnostic run inspects RawView and logs native desktop records; alternate structures must be investigated before accepting them.

UIA/OS calls run in isolated, bounded PowerShell processes. Errors, inaccessible providers, malformed arrays, timeouts and ambiguity throw rather than pass or imply absence. Basic Latin and explicit missing-window rejection ran. Implemented controls also reject unchanged selection, post-confirmation stale activity and old composition generations when reached. Navigation currently requires changed native selected identity/text, and confirmation requires selected native text to equal committed text; unfamiliar naming/virtualization fails for investigation.

Screen capture availability is recorded separately. The harness samples snapshots; it does not subscribe to MenuOpened, MenuClosed or ElementSelected and does not claim those event notifications were observed. Overall exit requires all A–K PROVEN; the actual native job exits 1.

## Outliner integration boundary

Source inspection of `.github/actions/setup-e2e-deps/action.yml`, `scripts/ci-e2e-start.sh` and `scripts/common-functions.sh` shows an Ubuntu path requiring npm trees, Java 21, Firebase tools, a built Yjs server and PM2 services. It references dpkg, apt-get, ln -sfn, pgrep, pkill and lsof and expects `server/dist/server/src/index.js` from an upstream build artifact.

This is a source-level integration blocker, not proof an equivalent Windows stack is impossible. Production startup was not attempted because standalone candidate observation did not pass. No full infrastructure rewrite is included. Existing Chromium tests and `client/e2e/utils/treeValidation.ts` / `cursorValidation.ts` provide document-state references but cannot replace native selection evidence. Any production follow-up must retain the real global textarea and read canonical Yjs text plus logical cursor state.

## Validation and scope

Primary hosted inventory and independent GUI transport jobs succeed. Native composition works; its candidate assertion fails and artifacts survive. Local Node syntax checking, HTTP/monotonic telemetry smoke checks, dprint and git diff --check pass.

Required repository checks were attempted: E2E TypeScript reports 27 errors in existing code; client TypeScript lacks generated $app config/types; client build fails on a missing demoProject route matcher in the cached dependency environment. These checks do not validate production Windows Firefox.

All changes are confined to the isolated workflow, `scripts/poc/windows-native-ime/`, this report and evidence images. The editor, Issue #5501 and PR #5504 remain unchanged. This result is insufficient for an authoritative automated Windows Firefox compatibility test.
