# Windows Firefox native Microsoft Japanese IME in Outliner

**A–K are PROVEN in Linux-backed native Windows run 37802796925 on the ordinary Outliner editor: all four single/two-caret confirm/cancel scenarios pass exact canonical Yjs, rendered-text, logical-cursor and selection assertions. WSL2 Ubuntu, native Linux Docker and Compose run all required services on the standard windows-2025 runner, and native Windows Firefox reaches all five localhost endpoints with HTTP 200. This establishes the tested Windows native IME scenarios, with no long-preedit or general popup-placement claim.**

## Frozen result and evidence verification

The audit checked the actual successful run metadata, complete job logs and original ZIP artifacts against the committed observations. Native run 37800147669 used harness `e8d26d06a76791c538d1528ce48a0ba3d6b1434d`; WSL2 run 37802796925 used `781455fb131150e9c822cb40d45712805eed5ba3`. Both checked out application `0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`. These are historical results, not results for the current PR HEAD or current main.

The original report incorrectly counted ten document/cursor controls. The artifacts and source enumerate 3 single-confirm + 1 single-cancel + 4 dual-confirm + 1 dual-cancel = **nine**, all rejected. The original summaries are retained; no tenth observation has been fabricated. The independent A–I native/stale/Latin controls are additional and are not included in this count.

[Directly reviewable observations](assets/windows-native-ime-observations.json) contain exact before/after documents, cursor identities/offsets, complete local selections, TSF identity, capabilities and every mutation result. [Manifest](assets/windows-native-ime-manifest.json) hashes the [319-entry ZIP](assets/windows-native-ime-evidence.zip), identifies source runs/artifacts and original paths, and records redaction provenance. Raw composition, UIA, candidate navigation, original production snapshots and controls for both successes and the standalone experiment remain inside the archive. The six earlier committed summaries, including failed application/Linux trials, are also retained. Original summaries rename `events` to `nativeEvents` and omit screen/window fields; that projection was checked against the actual artifact snapshots. No experimental observations were regenerated.

```sh
python3 scripts/poc/windows-native-ime/verify-evidence.py
python3 scripts/poc/windows-native-ime/verify-evidence.py --list
python3 scripts/poc/windows-native-ime/verify-evidence.py --cat runs/37802796925/windows-native-ime/production-2-confirm-after.json
python3 scripts/poc/windows-native-ime/verify-evidence.py --cat runs/37802796925/windows-native-ime/candidate-production-2-confirm-navigation.json
```

ZIP DEFLATE uses sorted paths, a fixed 1980-01-01 timestamp, mode 0644 and compression level 9. To reproduce the archive bytes: read entries with `zipfile`, sort their names and write each unchanged byte string with those `ZipInfo` attributes and `compresslevel=9`. The manifest records retained-byte hashes and, for redacted entries, original hashes. Two diagnostic summaries contain a public package-contact email; it is replaced with `[REDACTED package contact]`. All retained entries were decoded and scanned for credential/token/private-key patterns, sensitive JSON keys and email addresses. `test@example.com`/Test User are disposable emulator identities. Browser profiles, cookies, drivers, arbitrary source code and raw unrestricted logs are excluded. Screenshots were inspected; their content is the test editor/native desktop.

Microsoft IME is identified by the observed TSF CLSID/profile, registry identity and exact Windows image/build. **An independent IME DLL file version was not recorded**, so no numeric Microsoft IME version is inferred from the OS. Firefox and Docker versions below are observations.

## Exact application and native evidence

[Linux-backed native run 37802796925](https://github.com/kitamura-tetsuo/outliner/actions/runs/37802796925), harness `781455fb131150e9c822cb40d45712805eed5ba3`, tested application **`0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`**. This is a descendant of the actual #5504 correction **`73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f`**, with three source integration fixes:

- `7b90e6fb7b709cff0f6d6b19ef8e643a2f50eced`: explicit cursor barrel imports avoid Windows case-insensitive `cursor` / `Cursor.ts` resolution.
- `79a976cd8765367ea4f04baa00905822681cf294`: the existing libpg-query package patch exports its ESM loader factory, required by the ordinary browser application.
- `0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`: preserves the first caret during actual native Alt-click on the second row, fixing the demonstrated baseline defect.

The final production run uses standard GitHub-hosted `windows-2025`, native Windows Firefox 156.0.1 and geckodriver 0.37.1 attached to the same visible desktop browser used for A–I. Real Firebase Auth/Firestore/Functions/Hosting emulators, compiled Yjs server and Vite run in Linux Compose and serve the ordinary authenticated editor. Shared imports resolve through the patched client dependencies. The existing test route/navigation hooks and authenticated seed API prepare disposable project/page data; they do not inject editor cursor state or simulate composition.

The browser mounts the app-created `textarea.global-textarea` with its actual `wrap="off"`, geometry and handlers. Its measured proxy is 1 × 1 pixels. No textarea CSS, position, size, wrap or handlers are changed at runtime. This native-popup evidence does not demonstrate long-text wrapping or correct popup placement on every platform.

[Durable structured evidence](assets/windows-native-ime-evidence.zip) retains full item IDs, canonical Y.Text/rendered text, complete cursor IDs/item IDs/offsets, selections, current session/action/generation, trusted native composition events, native UIA candidate lists and actual negative-control snapshots. [Raw artifact](https://github.com/kitamura-tetsuo/outliner/actions/runs/37802796925/artifacts/11562191061) includes browser/server logs, screenshots and complete UIA dumps; its retention is 14 days.

| Scenario            | Result | Exact assertion                                                                                                                                                                                              |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One caret, confirm  | PROVEN | Baseline `prefix\|suffix`; native C=`二本`; canonical/rendered `prefix二本suffix`; same logical cursor moves 6→8.                                                                                            |
| One caret, cancel   | PROVEN | Fresh baseline `prefix\|suffix`; selected native C=`🗾`; Escape ends composition with empty committed text; canonical/rendered `prefixsuffix`, same cursor at 6 and selections exactly restored.             |
| Two carets, confirm | PROVEN | Baselines `prefix\|suffix` and `left\|tail`; native C=`🗾` (UTF-16 length 2); canonical/rendered `prefix🗾suffix` and `left🗾tail`; original cursor IDs move 6→8 and 4→6, with no extra cursor or recipient. |
| Two carets, cancel  | PROVEN | Fresh same two baselines; selected native C=`二本`; exact canonical/rendered `prefixsuffix` and `lefttail`, both original cursor IDs/offsets (6,4) and complete empty selection set restored.                |

All canonical nonrecipient items and their rendered text remain unchanged in the successful scenarios. Expected documents and exact complete cursor sets derive from immutable before-state plus UIA-selected C, never from after-state or the final DOM. A missing canonical Y.Text fails rather than falling back to rendered text. Full IDs and independently derived expected snapshots are in the durable evidence.

Inspected screenshots:

- [Inline preedit](assets/production-1-confirm-preedit-37802796925.png).
- [Actual native selection](assets/production-1-confirm-selected-37802796925.png).
- [Confirmed production editor](assets/production-1-confirm-after-37802796925.png).
- [Production editor after cancel](assets/production-1-cancel-after-37802796925.png).
- [Two-caret native selection](assets/production-2-confirm-selected-37802796925.png).
- [Two-caret exact confirmation](assets/production-2-confirm-after-37802796925.png).
- [Two-caret exact cancellation](assets/production-2-cancel-after-37802796925.png).

## Live strict negative controls

After the successful confirm, controls mutate the attached production Y.Text or logical cursor state, re-read both canonical state and rendered editor, require rejection, and restore the actual state before continuing:

- Omitted confirmed insertion: rejected by exact canonical/rendered recipient-set assertion.
- Duplicated confirmed insertion: rejected by the same exact assertion.
- Incorrect logical caret: rejected by the complete logical cursor-set assertion.
- After cancellation, incorrect restored caret: rejected by the complete logical cursor-set assertion.

The two-caret confirm also runs the **missing-second-recipient** mutation against the live attached Y.Text: only the second recipient loses C while the first remains correct, and the strict canonical/rendered recipient-set assertion rejects it. All nine live document/cursor controls across the four actions reject their focused mutation, restore actual state, and revalidate the unmutated outcome. The native job succeeds only after all four scenarios and their controls pass; process readiness alone cannot make K pass.

## Demonstrated Alt-click defect and source fix

In [earlier native run 37798605290](https://github.com/kitamura-tetsuo/outliner/actions/runs/37798605290), the failed two-caret [before-snapshot](assets/windows-native-ime-evidence.zip) records trusted `mousedown`, `mouseup` and `click` on the second item, each with `altKey=true`. Composition generation is 0, no composition events exist, canonical content is unchanged, and only the second cursor remains. This establishes actual native modifier delivery and an editor baseline defect, rather than an IME insertion result.

`OutlinerItem.svelte` starts editing during mousedown on a row without a cursor. `startEditing` clears the active row's caret and places a new local caret before the existing additive Alt-click handler executes. Source integration commit **`0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`** returns from plain Alt-mousedown before that destructive path; the existing click handler adds the caret. Shift gestures retain their existing path. The updated application pin contains this fix; runs 37800147669 and 37802796925 prove both two-caret outcomes with actual native UI gestures and unchanged strict baseline requirements. No application cursor state is seeded by the harness to bypass this defect.

## Linux backend on the Windows 2025 runner

[Final Linux-backed run 37802796925](https://github.com/kitamura-tetsuo/outliner/actions/runs/37802796925) succeeds on standard GitHub-hosted `windows-2025`, image `win25-vs2026` / `20260925.250.1`, Windows Server 2025 build 26100. All provisioning, startup/readiness, native A–K and cleanup steps succeed.

| Layer                      | Observed result                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------- |
| WSL                        | Version 2.7.14.0; Ubuntu distribution lists WSL version **2**.                     |
| Ubuntu                     | 26.04.1 LTS; actual kernel `6.18.33.2-microsoft-standard-WSL2`.                    |
| Native Linux Docker Engine | 29.1.3; `OSType=linux`, `linux/amd64`, overlayfs, `/var/lib/docker`.               |
| Docker Compose             | 2.40.3+ds1-0ubuntu1; existing backend plus runtime overlay builds and starts.      |
| Source in image            | Image label is exact application `0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`.       |
| Linux/Windows readiness    | All five required service URLs return 200 inside Ubuntu and in Windows PowerShell. |
| Native Windows Firefox     | 156.0.1; all five actual navigations record status 200 and exact endpoint URLs.    |
| Native production editor   | Four scenarios and nine live document/cursor controls pass; A–K all PROVEN.        |

[Durable Linux/platform/browser evidence](assets/windows-native-ime-evidence.zip) records the real kernel/engine, image identity, readiness, exact Firefox responses, full capability results and Compose status. The [production-state evidence](assets/windows-native-ime-evidence.zip) and screenshots above establish J–K separately from process/network readiness.

Earlier boundaries are retained accurately: [trial 37798605301](assets/windows-native-ime-evidence.zip) built/started the Linux image but failed Windows localhost checks and lost service logs on a cleanup path regex. [Trial 37800611798](assets/windows-native-ime-evidence.zip) passed all Linux/Windows HTTP checks and A–I, then the browser probe failed on fetch from Firefox's JSON viewer. The final probe reads actual navigation response status/URL without changing viewer security. A foreground WSL client keeps the distribution alive for the complete test and cleanup collects actual service logs. Neither earlier harness failure establishes a platform blocker.

The implementation is `.github/workflows/poc-windows-wsl2-linux-backend.yml` and `scripts/poc/windows-linux-backend/`. It first records Windows virtualization/features and real WSL commands, provisions Ubuntu with WSL version 2, verifies the actual Linux kernel, installs Ubuntu's native Docker Engine and Compose, and requires Docker's OS type to be Linux. It uses no Docker Desktop or Windows containers.

Compose combines the pinned application's existing `docker-compose.yml` with a PoC runtime overlay for the existing `yjs-server` service. A clean `git archive` enters Ubuntu's ext4 filesystem; Node dependencies and native addons are installed inside the Linux image from their existing lockfiles. The runtime also starts the existing Firebase emulators and ordinary Vite client. Existing Hosting `/api` rewrites and real authentication remain in use. No Linux node_modules are copied into Windows.

Required Windows localhost endpoints:

| Service                                      | Endpoint                            |
| -------------------------------------------- | ----------------------------------- |
| Ordinary client                              | `http://127.0.0.1:7090/`            |
| Yjs/backend health and authenticated seeding | `http://127.0.0.1:7093/health`      |
| Functions through Hosting rewrites           | `http://127.0.0.1:57070/api/health` |
| Auth emulator                                | `http://127.0.0.1:59099/`           |
| Firestore emulator                           | `http://127.0.0.1:58080/`           |

The startup step requires HTTP 200 from all five in Windows PowerShell. The attached native Windows Firefox then navigates to each service and requires its PerformanceNavigationTiming response status to be 200 with the exact response URL, saving `windows-firefox-linux-localhost.json`. Those browser checks establish network transport only. A–I retain the real OS IME/UIA tests, and J–K require the ordinary editor and exact application assertions described above.

WSL2 actually runs on this image despite some WMI virtualization capability fields reporting false; those inventory fields alone are not a platform blocker. The earlier empty PowerShell ArgumentList and shell CRLF errors were corrected harness failures, not proof that WSL2 is unavailable.

A separate Ubuntu runner over a private network is conditional on this approach being unavailable. The complete WSL2/Linux/Windows-Firefox path succeeds, so that fallback is not needed and was not provisioned. If a fallback becomes necessary, paired Ubuntu/Windows jobs would need private-network identity and ACLs, bounded readiness/lifetime coordination, and a verified endpoint configuration for all services. A Tailscale ephemeral-node network supports both operating systems, but current connector access cannot inspect repository secret metadata; no absence of credentials is inferred. For that fallback, Ubuntu would run the same pinned Compose backend; [Tailscale's GitHub Action](https://github.com/tailscale/github-action) would put both hosted runners on ephemeral private nodes with an ACL limited to the backend SSH service. Five TCP forwards from Windows loopback to Ubuntu loopback would preserve the current Firefox localhost URLs, including the Yjs WebSocket, without exposing emulator ports publicly or altering IME input. The workflow would need a ready signal, per-run node identity, bounded job lifetime and teardown; private-network credentials/ACL authorization are deployment prerequisites. Merely running an Ubuntu backend would not establish Windows Firefox access or J–K.

## Preserved native A–I and correlation rules

The [archived standalone report](windows-firefox-native-ime-standalone.md) retains the original `windows-2025` run **37777415483**, SHA **`3e422ff3bb77eeef51956440a0dfc3ef47d9cd07`**, original UIA structure, selected C=`🗾`, screenshots and independent GUI transport proof. Its historical J–K failure is superseded by the production results above.

A–I continue to require: an interactive desktop; active Microsoft Japanese TSF identity; accepted Win32 SendInput and trusted composition; inline native preedit; a fresh visible native candidate window; actual UIA ListItems and SelectionItemPattern; changed selected native text/runtime ID followed by exact confirmation; native cancellation; and strict live negative controls. Candidate existence alone, committed text alone, synthetic composition events and pasted Unicode are insufficient.

Session IDs, action IDs, composition generations and observation sequences scope every current observation. Navigation resets sequences and retires prior sessions. Production actions start fresh compositions. Candidate reads enumerate the desktop root anew and correlate current action/generation, native HWND/PID/class/bounds and current browser observations. A stale candidate from a preceding fixture action fails before production candidate navigation.

The original `preedit-long.json` contains **`にほ`**; `にほｎ` appears only in a later event. This is short preedit growth, with no long-text wrapping coverage.

## Historical reproduction only

Independent durable source references were created before separation:

- `archive/native-ime-2026-10-08-application` points to the exact tested application, preserving #5504 and the three integration corrections in its ancestry. Keep this reference when cleaning up experimental branches.
- `archive/native-ime-2026-10-08-harness` points to audited PoC HEAD `02a62de6`, preserving both successful harness revisions and removed intermediate screenshots/report history. Keep this reference too.

The two experimental workflows are **manual-only** (`workflow_dispatch`), isolated from required CI. Each application checkout uses the durable application branch **and verifies the exact expected SHA before preparation**. The application remains pinned; running the workflows does not test future application revisions. In GitHub Actions, select `poc/windows-firefox-native-ime` as the workflow ref and dispatch either `poc-windows-firefox-native-ime.yml` or `poc-windows-wsl2-linux-backend.yml`. The native workflow needs an interactive hosted Windows desktop and Windows dependencies; the WSL2 workflow provisions Linux Engine/Compose and installs dependencies inside Linux. Read the exact setup scripts rather than substituting readiness for the native assertions. The Linux workflow remains the demonstrated primary reproduction path.

```sh
gh workflow run poc-windows-wsl2-linux-backend.yml --ref poc/windows-firefox-native-ime
# Alternate Windows-native backend:
gh workflow run poc-windows-firefox-native-ime.yml --ref poc/windows-firefox-native-ime
node --test scripts/poc/windows-native-ime/production-oracle.test.mjs
node --test scripts/poc/windows-native-ime/fixture-server.test.mjs
```

A rerun depends on hosted image/software/package availability; the original run versions are preserved, not claimed to be hermetic. This session verified retained evidence and harness tests; it did not rerun a Windows desktop in this Linux workspace.

## Validation and scope

- Hosted native Windows backend run [37800147669](https://github.com/kitamura-tetsuo/outliner/actions/runs/37800147669) on windows-2022 also passes all four scenarios and nine live document/cursor controls; its [durable evidence](assets/windows-native-ime-evidence.zip) provides independent backend-path confirmation. The same source pin passes again in native run 37802796948.
- Independent strict production oracle tests: 3 passed, including astral C, exact cursor identities/counts, unexpected recipients, omissions/duplicates, generation/native agreement and exact cancellation.
- Fixture/session transport test: passed, including reset, retired-session and reordered-observation rejection.
- Pinned application client TypeScript and client build: passed, including the Alt-click source fix.
- Compiled server TypeScript and focused cursor selection test: passed (11 tests).
- Linux scripts: `bash -n` passed; installed Docker Compose 2.40.3 accepts the existing application plus overlay configuration.
- `client/e2e` TypeScript has 27 errors also present unchanged at correction revision `73cf8a42`; no new errors are attributed to this change.
- Basic Playwright E2E was attempted but could not launch the required pinned Chromium executable in this workspace. It supplies no application behavior proof.

PR #5506 remains a draft. No merge, change to PR #5504, or Issue #5501 closure is performed. Windows tests do not prove long-preedit behavior, general native candidate-window placement, or the original Ubuntu Firefox/Fcitx5 defect. The integrated tested application is not identical to the original #5504 commit. Historical PoC success does not establish regression protection for future revisions or verify all of Issue #5501. See the [separation inventory](windows-native-ime-separation.md) and [future CI task](windows-native-ime-future-ci.md).
