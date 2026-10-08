# Windows Firefox native Microsoft Japanese IME PoC

**Standalone native IME automation is demonstrated on a standard GitHub-hosted windows-2025 runner: A–I are PROVEN. Outliner production integration and authoritative document/cursor state remain BLOCKED (J–K). Overall PoC success and Issue #5501/REQ-005 are not established. PR #5504 was not tested or modified.**

## Executed environment and evidence

Final [Actions run 37777415483](https://github.com/kitamura-tetsuo/outliner/actions/runs/37777415483), 2026-10-08, tested commit **`3e422ff3bb77eeef51956440a0dfc3ef47d9cd07`**. Base main: `0d83434277463783433d95cf17317a7fec9cd609`.

| Fact                | Recorded value                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Runner              | Standard GitHub-hosted `windows-2025`; no self-hosted runner                                                      |
| OS                  | Windows Server 2025 Datacenter, 10.0.26100, build 26100                                                           |
| Image               | `win25-vs2026`, version `20260925.250.1`                                                                          |
| Firefox             | Regular preinstalled desktop 156.0.1, `C:\Program Files\Mozilla Firefox\firefox.exe`; fresh profile, non-headless |
| Desktop             | Session 2, input desktop `Default`                                                                                |
| Display             | 1024 × 768, DPR 1, window DPI 96                                                                                  |
| Initial input       | en-US, `0409:00000409`, default override unset                                                                    |
| Activated input     | Microsoft Japanese TIP, language 0411, foreground HKL `4110411`                                                   |
| Optional capability | `Language.Basic~~~ja-JP~0.0.1.0`: state 0 (NotPresent); actual Microsoft Japanese IME nevertheless works          |

[Final native artifact](https://github.com/kitamura-tetsuo/outliner/actions/runs/37777415483/artifacts/11551445491) contains 104 files: environment, TSF/input profile observations, Firefox IME logs, browser events, UIA snapshots, candidate selection observations, keyboard traces, screenshots, integration startup logs and results. [Initial inventory artifact](https://github.com/kitamura-tetsuo/outliner/actions/runs/37777415483/artifacts/11550620951) survives independently. The inventory and independent GUI transport jobs succeed; the native job correctly exits 1 because J–K are not PROVEN. Artifact upload succeeds. Artifacts expire after 14 days.

Durable, inspected screenshots:

- [Native candidate list, final run](assets/windows-firefox-candidates-37777415483.png): numbered native popup, 二本 highlighted; corresponds to the native UIA selected item.
- [Native inline preedit, final run](assets/windows-firefox-preedit-37777415483.png): Japanese inline preedit and a separate native prediction popup.
- [Confirmed native selection, final run](assets/windows-firefox-confirmed-37777415483.png): 🗾 remains after Enter, matching the selected native item and trusted compositionend.
- [Text retained after cancellation, final run](assets/windows-firefox-cancelled-37777415483.png): 🗾 remains after a fresh composition is cancelled; exact caret restoration is recorded in cancellation.json.
- [Independent GUI keyboard transport](assets/windows-firefox-transport-37768108913.png), [run 37768108913](https://github.com/kitamura-tetsuo/outliner/actions/runs/37768108913), SHA `41362f4d33d4497047ddf47bf88a32456da706ce`: actual abc in GUI Firefox.

The final run's `preedit-long.json` contains **にほ**. `にほｎ` appears in a later event. This demonstrates short preedit growth only; it provides no long-text wrapping coverage.

## Capability results

Every PROVEN entry below was exercised on the final hosted Windows run.

| Capability                          | Classification | Authoritative observation                                                                                                                                                                                     |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Firefox GUI                      | PROVEN         | Actual Firefox HWND/PID 1932, desktop snapshot and inspected screenshots.                                                                                                                                     |
| B. Microsoft Japanese IME activated | PROVEN         | Exact active Microsoft TSF profile/language after session-wide activation; activation/query HRESULTs 0; real native Firefox composition follows.                                                              |
| C. OS keyboard input through IME    | PROVEN         | Win32 virtual-key SendInput accepts two events per key; foreground Firefox produces trusted native compositionstart/update after romaji.                                                                      |
| D. Real inline composition          | PROVEN         | preedit-short.json: に; preedit-long.json: にほ (にほｎ occurs in a later event); composing true in generation 1; trusted updates and native screen evidence.                                                 |
| E. Native candidate appears         | PROVEN         | Fresh desktop UIA native HWND 197366, class mscandui40.candidate, name Microsoft Candidate UI, Firefox PID 1932, visible bounds matching the inspected popup.                                                 |
| F. Candidate contents/selection     | PROVEN         | Native Primary Candidate List exposes ListItem text and SelectionItemPattern; 二本 has IsSelected true.                                                                                                       |
| G. Navigation and confirmation      | PROVEN         | Down changes selected runtime ID/text from 二本 to 🗾; Enter commits exactly 🗾, trusted compositionend agrees, and the fresh candidate query becomes empty.                                                  |
| H. Cancellation                     | PROVEN         | New native composition, bounded Escape cancellation, then exact restoration of 🗾 and textarea selection start/end 2/2; no current composition or candidate remains.                                          |
| I. Negative controls                | PROVEN         | Actual direct Latin typing rejects candidate assertion; restored Japanese opens a fresh native list. Missing, unchanged, retained-after-disappearance, committed-only and old-generation observations reject. |
| J. Production textarea              | BLOCKED        | Existing startup attempted on Windows; exit 1 because the compiled Yjs server artifact is absent. No ready production global-textarea path established.                                                       |
| K. Outliner document/cursor         | BLOCKED        | No production Yjs document or logical cursor observation; fixture caret 2 is a UTF-16 textarea offset, not Outliner's logical cursor proof.                                                                   |

## Reproduction and input mechanism

The isolated workflow `.github/workflows/poc-windows-firefox-native-ime.yml` has independent inventory, GUI transport and native IME jobs. It runs on its dedicated branch through push or workflow_dispatch. It is not added to required CI and does not depend on the Ubuntu PoC.

On a **disposable** Windows desktop with Node 22, run from the repository root:

```powershell
powershell -NoProfile -File scripts/poc/windows-native-ime/run.ps1
```

Setup changes the current user's language/default input configuration. The harness starts ordinary Firefox with a fresh profile and a normal visible textarea. A real Win32 mouse click focuses it using read-only browser geometry. Accepted OS input, browser focus and foreground PID establish actual interactivity; UIA enumeration alone is insufficient.

Virtual-key SendInput delivers romaji, IME mode keys, Space, arrows, Enter and Escape. No Unicode injection, clipboard paste, WM_CHAR, synthetic DOM composition or browser input API is used. PostMessage is used only for WM_INPUTLANGCHANGEREQUEST. Browser text/selection and trusted composition events are supplementary telemetry.

Setup adds ja-JP to the user's language list, selects the Microsoft Japanese TIP, loads the Japanese layout and requests the Firefox input language. Native COM activates the TSF profile with `TF_IPPMF_FORSESSION | TF_IPPMF_ENABLEPROFILE` (`0x20000001`) and queries the active keyboard-category profile:

```text
CLSID 03B5835F-F03C-411B-9CE2-AA23E1171E36
profile A76C93D9-5523-4E90-AAFA-4DB112F9AC76
language 0411
activationHRESULT=00000000 queryHRESULT=00000000 activeMicrosoft=True
```

Culture, HKL and configured settings alone do not prove activation. The exact live TSF identity plus real native composition support B. The query runs in the caller in the same session after session-wide activation, not directly inside Firefox's private TSF thread manager.

The final run installs no capability because composition already works. Language packs/layouts and TSF registry facts are retained in language-packs.txt, keyboard-layouts.txt, user-keyboards.txt and microsoft-japanese-tsf-registry.txt. If native preedit fails, supported Add-WindowsCapability runs in a bounded child process. Earlier installations exceeded 300 seconds; reboot-required results fail explicitly because reboot/resume is not implemented. NotPresent Japanese Basic is not evidence of IME absence.

## Actual native UIA structure

The published `IME_Candidate_Window` AutomationId is absent in this configuration. An earlier exact-ID query returned [] even while a native list was plainly visible ([run 37772921746](https://github.com/kitamura-tetsuo/outliner/actions/runs/37772921746), SHA `ff675b832e1419231f79df10183e8b25fe3b93ca`). Raw desktop investigation established this alternate native structure:

```text
Desktop
  Firefox
    Pane: Microsoft Candidate UI
      HWND 197366, native class mscandui40.candidate
      PID 1932 (Firefox), AutomationId empty
      bounds left=10 top=327 width=184 height=256, IsOffscreen=false
      Custom: Primary Candidate List
        List: Primary Candidate List [SelectionPattern]
          ListItem 日本 [SelectionItemPattern, IsSelected=false]
          ListItem 二本 [SelectionItemPattern, IsSelected=true]
          ListItem 🗾   [SelectionItemPattern, IsSelected=false]
          ...actual remaining native candidates...
```

This is a native Microsoft candidate HWND hosted inside the Firefox process, not a DOM dropdown or a TextInputHost-owned modern popup. Acceptance requires its exact observed native class/name, nonzero HWND, matching foreground Firefox PID, visible bounds, active focused textarea and current composition generation. A name alone cannot pass. Modern published-ID candidates retain a separate Windows input-host ownership check. The fixture itself creates no candidate UI.

Each query starts freshly at the **desktop root**, not the DOM or a Firefox-only subtree. Candidate ownership, class, bounds, visibility, UIA runtime identity, contents, selected state and composition generation are recorded. A native HWND MSAA probe is supplementary; successful selection assertions in the final run use UIA SelectionItemPattern.

The selected runtime IDs actually change from `42,197366,4,2,0,1` (二本) to `42,197366,4,2,0,2` (🗾). The chosen native text exactly equals the committed textarea value. Candidate ordering is learned from the live list, not hard-coded. Candidate appearance/disappearance is freshly sampled; UIA MenuOpened, MenuClosed and ElementSelected subscriptions were not implemented or claimed.

## Negative controls and cancellation

The final sequence observes:

1. Initial actual abc input with no composition/candidate; direct-Latin and explicit missing-window assertions reject.
2. Real Japanese preedit and visible native candidate; positive assertion succeeds.
3. Unchanged native selected item fails the navigation predicate.
4. After confirmation the candidate query is []; the captured old candidate also rejects because composition ended. Committed 🗾 alone cannot pass despite older trusted composition events.
5. After cancellation, VK_IME_OFF followed by actual abc yields 🗾abc without composition and no candidate; the assertion rejects.
6. OS Backspace removes abc; VK_IME_ON/Hiragana restore Japanese input. Generation 3 opens a new native candidate HWND 197300. The generation-1 record rejects; the new record passes.
7. Bounded Escape presses follow conversion back through reading/clearing states until composition ends and committed text is restored. A final fresh query is [].

Missing, ambiguous, inaccessible, malformed or timed-out UIA observations never imply PASS. UIA/OS calls run in isolated, bounded PowerShell processes; worker errors throw. A failed observation worker actually produced a failed native job in [run 37774760065, attempt 2](https://github.com/kitamura-tetsuo/outliner/actions/runs/37774760065/attempts/2) when a managed legacy-pattern type was unavailable; that harness defect was corrected. A deliberate OS access-denied UIA tree was not separately induced.

Screen capture availability has independent records and the native screenshots were inspected. Earlier false preedit failures were traced to Windows PowerShell 5 decoding JSON without an explicit charset; responses now declare application/json; charset=utf-8. Diagnostics preserve those failures rather than attributing them to an absent IME.

## Production Outliner integration blocker

After standalone A–I passed, the final job attempted the **existing** `scripts/ci-e2e-start.sh` through the runner's Git Bash, with a 60-second bound. Bash exists; root/client dependency trees and the server build are absent. Startup generated emulator configuration and disposable environment files, then returned exit 1:

```text
Verifying server build artifact...
Error: server/dist/server/src/index.js is missing.
The prepare-e2e-runtime job should have built and uploaded it as an artifact.
```

See integration-preflight.json, integration-startup.json and integration-startup-stdout/stderr.txt in the final artifact. No production editor or authoritative Yjs state was reached.

Source inspection of `.github/actions/setup-e2e-deps/action.yml`, `scripts/ci-e2e-start.sh` and `scripts/common-functions.sh` shows the existing Ubuntu bootstrap restores multiple npm trees, Java 21, Firebase tools, a compiled Yjs server and PM2 services, with dpkg/apt-get, ln -sfn, pgrep, pkill and lsof references. This minimal independent Windows job does not port that bootstrap or import an Ubuntu PoC service/artifact.

The missing build/dependencies are a **PoC integration boundary**, not an inherent inability of Windows or GitHub-hosted runners to run Outliner. A Windows-compatible dependency/build/service startup path is still required. No complete E2E infrastructure redesign is included. A follow-up must use the real `textarea.global-textarea`, exercise the same native sequence, and read canonical Yjs text plus the logical cursor. Existing `client/e2e/utils/treeValidation.ts` and `cursorValidation.ts` offer application-state references but cannot replace native selection evidence.

## Validation and scope

Final hosted A–I assertions pass; J–K remain BLOCKED. Overall exit is 1 until every A–K entry is PROVEN. There are no skipped native assertions or continue-on-error success substitutions.

Local Node syntax, HTTP/monotonic telemetry smoke checks, dprint and git diff --check pass. Required repository checks were attempted: E2E TypeScript reports 27 errors in existing code; client TypeScript lacks generated $app config/types; client build fails on a missing demoProject route matcher in the cached dependency environment. No production editor changes were made to address these separate failures.

Changes are confined to this isolated workflow, `scripts/poc/windows-native-ime/`, this report and evidence images. Issue #5501 and PR #5504 are unchanged. The result establishes a usable native candidate-selection oracle for standalone hosted Windows Firefox; it does **not** establish Outliner REQ-005 or PR #5504 Windows compatibility.
