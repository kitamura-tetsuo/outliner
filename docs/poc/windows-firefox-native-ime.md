# Windows Firefox native Microsoft Japanese IME in Outliner

**A–I remain PROVEN. J is PROVEN on the ordinary Outliner editor. K is PARTIAL: single-caret confirm and cancel pass exact canonical Yjs, rendered-text and logical-cursor assertions; two-caret scenarios are blocked by a demonstrated Alt-click cursor-loss bug. The Linux WSL2 backend trial is in progress. Overall REQ-005 success is not established.**

## Exact application and native evidence

[Native run 37798605290](https://github.com/kitamura-tetsuo/outliner/actions/runs/37798605290), harness `dfd2ca98bb14e9bd51fe799aa1f03dffc6b38916`, tested application **`79a976cd8765367ea4f04baa00905822681cf294`**. This is a descendant of the actual #5504 correction **`73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f`**, with two source integration fixes:

- `7b90e6fb7b709cff0f6d6b19ef8e643a2f50eced`: explicit cursor barrel imports avoid Windows case-insensitive `cursor` / `Cursor.ts` resolution.
- `79a976cd8765367ea4f04baa00905822681cf294`: the existing libpg-query package patch exports its ESM loader factory, required by the ordinary browser application.

The production run uses standard GitHub-hosted `windows-2022`, native Firefox 157.0 and geckodriver 0.37.1 attached to the same visible desktop browser used for A–I. Real Firebase Auth/Firestore/Functions/Hosting emulators, compiled Yjs server and Vite serve the ordinary authenticated editor. Shared imports resolve through the patched client dependencies. The existing test route/navigation hooks and authenticated seed API prepare disposable project/page data; they do not inject editor cursor state or simulate composition.

The browser mounts the app-created `textarea.global-textarea` with its actual `wrap="off"`, geometry and handlers. Its measured proxy is 1 × 1 pixels. No textarea CSS, position, size, wrap or handlers are changed at runtime. This native-popup evidence does not demonstrate long-text wrapping or correct popup placement on every platform.

[Durable structured evidence](assets/windows-firefox-production-37798605290.json) retains full item IDs, canonical Y.Text/rendered text, complete cursor IDs/item IDs/offsets, selections, current session/action/generation, trusted native composition events, native UIA candidate lists and actual negative-control snapshots. [Raw artifact](https://github.com/kitamura-tetsuo/outliner/actions/runs/37798605290/artifacts/11559334098) includes browser/server logs, screenshots and complete UIA dumps; its retention is 14 days.

| Scenario            | Result                     | Exact assertion                                         |
| ------------------- | -------------------------- | ------------------------------------------------------- |
| One caret, confirm  | PROVEN                     | Baseline `prefix                                        | suffix``; independently observed selected native C=``二本``; canonical/rendered ``prefix二本suffix`; same logical cursor moves 6→8. |
| One caret, cancel   | PROVEN                     | Fresh baseline `prefix                                  | suffix``; selected native C=``🗾``; Escape ends composition with empty committed text; canonical/rendered ``prefixsuffix`, same cursor at 6 and selections exactly restored. |
| Two carets, confirm | BLOCKED before composition | Native Alt-click leaves only the second `left           | tail` cursor at offset 4; the required first cursor at offset 6 is absent. No successful two-recipient insertion is claimed. |
| Two carets, cancel  | NOT REACHED                | The preceding invalid two-caret baseline fails the job. |

All canonical nonrecipient items and their rendered text remain unchanged in the successful scenarios. Expected documents and exact complete cursor sets derive from immutable before-state plus UIA-selected C, never from after-state or the final DOM. A missing canonical Y.Text fails rather than falling back to rendered text. Full IDs and independently derived expected snapshots are in the durable evidence.

Inspected screenshots:

- [Inline preedit](assets/production-1-confirm-preedit-37798605290.png).
- [Actual native selection](assets/production-1-confirm-selected-37798605290.png).
- [Confirmed production editor](assets/production-1-confirm-after-37798605290.png).
- [Production editor after cancel](assets/production-1-cancel-after-37798605290.png).

## Live strict negative controls

After the successful confirm, controls mutate the attached production Y.Text or logical cursor state, re-read both canonical state and rendered editor, require rejection, and restore the actual state before continuing:

- Omitted confirmed insertion: rejected by exact canonical/rendered recipient-set assertion.
- Duplicated confirmed insertion: rejected by the same exact assertion.
- Incorrect logical caret: rejected by the complete logical cursor-set assertion.
- After cancellation, incorrect restored caret: rejected by the complete logical cursor-set assertion.

The two-recipient omission control is implemented and locally covered by the independent oracle tests, but **has not yet run against a valid live two-caret production baseline**. The native job exits nonzero while K is incomplete; no skipped assertion or process readiness can make K pass.

## Demonstrated Alt-click defect and source fix

The failed two-caret before-snapshot records trusted `mousedown`, `mouseup` and `click` on the second item, each with `altKey=true`. Composition generation is 0, no composition events exist, canonical content is unchanged, and only the second cursor remains. This establishes actual native modifier delivery and an editor baseline defect, rather than an IME insertion result.

`OutlinerItem.svelte` starts editing during mousedown on a row without a cursor. `startEditing` clears the active row's caret and places a new local caret before the existing additive Alt-click handler executes. Source integration commit **`0b5e6b0b1d3985e6789a6d826c5a76a180642a6d`** returns from plain Alt-mousedown before that destructive path; the existing click handler adds the caret. Shift gestures retain their existing path. The updated application pin contains this fix; its native rerun remains necessary to establish the two-caret outcomes. No application cursor state is seeded by the harness to bypass this defect.

## Linux backend on the Windows 2025 runner

[WSL2 trial 37798605301](https://github.com/kitamura-tetsuo/outliner/actions/runs/37798605301) uses a standard GitHub-hosted `windows-2025` runner. Ubuntu WSL2 and a native Linux Docker Engine have provisioned successfully. Compose startup and Windows/Firefox localhost reachability remain under test; these platform facts are not J–K proof.

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

The startup step requires HTTP 200 from all five in Windows PowerShell. The attached native Windows Firefox then navigates to each service and performs a same-origin fetch, saving `windows-firefox-linux-localhost.json`. Those browser checks establish network transport only. A–I subsequently retain the real OS IME/UIA tests, and J–K require the ordinary editor and exact application assertions described above.

WSL2 actually runs on this image despite some WMI virtualization capability fields reporting false; those inventory fields alone are not a platform blocker. The earlier empty PowerShell ArgumentList and shell CRLF errors were corrected harness failures, not proof that WSL2 is unavailable.

A separate Ubuntu runner over a private network is conditional on this approach being unavailable. Since WSL2 and Linux Docker provision successfully, that fallback is not yet needed. If a fallback becomes necessary, paired Ubuntu/Windows jobs would need private-network identity and ACLs, bounded readiness/lifetime coordination, and a verified endpoint configuration for all services. A Tailscale ephemeral-node network supports both operating systems, but current connector access cannot inspect repository secret metadata; no absence of credentials is inferred. Merely running an Ubuntu backend would not establish Windows Firefox access or J–K.

## Preserved native A–I and correlation rules

The [archived standalone report](windows-firefox-native-ime-standalone.md) retains the original `windows-2025` run **37777415483**, SHA **`3e422ff3bb77eeef51956440a0dfc3ef47d9cd07`**, original UIA structure, selected C=`🗾`, screenshots and independent GUI transport proof. Its historical J–K failure is superseded by the production results above.

A–I continue to require: an interactive desktop; active Microsoft Japanese TSF identity; accepted Win32 SendInput and trusted composition; inline native preedit; a fresh visible native candidate window; actual UIA ListItems and SelectionItemPattern; changed selected native text/runtime ID followed by exact confirmation; native cancellation; and strict live negative controls. Candidate existence alone, committed text alone, synthetic composition events and pasted Unicode are insufficient.

Session IDs, action IDs, composition generations and observation sequences scope every current observation. Navigation resets sequences and retires prior sessions. Production actions start fresh compositions. Candidate reads enumerate the desktop root anew and correlate current action/generation, native HWND/PID/class/bounds and current browser observations. A stale candidate from a preceding fixture action fails before production candidate navigation.

The original `preedit-long.json` contains **`にほ`**; `にほｎ` appears only in a later event. This is short preedit growth, with no long-text wrapping coverage.

## Validation and remaining work

- Independent strict production oracle tests: 3 passed, including astral C, exact cursor identities/counts, unexpected recipients, omissions/duplicates, generation/native agreement and exact cancellation.
- Fixture/session transport test: passed, including reset, retired-session and reordered-observation rejection.
- Pinned application client TypeScript and client build: passed, including the Alt-click source fix.
- Compiled server TypeScript and focused cursor selection test: passed (11 tests).
- Linux scripts: `bash -n` passed; installed Docker Compose 2.40.3 accepts the existing application plus overlay configuration.
- `client/e2e` TypeScript has 27 errors also present unchanged at correction revision `73cf8a42`; no new errors are attributed to this change.
- Basic Playwright E2E was attempted but could not launch the required pinned Chromium executable in this workspace. It supplies no application behavior proof.

PR #5506 remains open; no merge or Issue #5501 closure is performed. Next session: proceed sequentially—inspect the Linux hosted run, validate Windows Firefox access, rerun all four native production scenarios on the explicit fixed application pin, retain exact canonical/cursor/selection and live-control evidence, then update the classifications. Do not infer REQ-005 success from startup or relax the two-caret baseline.
