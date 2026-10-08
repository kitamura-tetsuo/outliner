# Ubuntu Firefox/Fcitx5 native IME experiment

## Actual result: incomplete, no GitHub-hosted proof

This is an infrastructure PoC for [Issue #5501](https://github.com/kitamura-tetsuo/outliner/issues/5501),
not its production implementation. No production source, existing CI matrix, issue requirements, or
[PR #5504](https://github.com/kitamura-tetsuo/outliner/pull/5504) was changed.

No GitHub Actions run was obtained in this session. Consequently no capability is **PROVEN** under
the requested GitHub-hosted definition. Unexecuted harness code is not evidence of feasibility.
This environment is **not yet established as suitable for authoritative REQ-002 acceptance tests**.

| Required execution metadata                | Actual observation                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| GitHub Actions run URL                     | Unavailable: GitHub API access returned `Forbidden` through the session proxy.                               |
| Tested GitHub-hosted commit SHA            | Unavailable: no hosted execution occurred.                                                                   |
| Repository baseline inspected              | `0d83434277463783433d95cf17317a7fec9cd609`                                                                   |
| PR #5504 head inspected by `git ls-remote` | `73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f`; not modified or tested.                                          |
| Hosted artifact links                      | Unavailable: no run exists. Future run artifacts are named `native-ime-<run-id>-<attempt>`.                  |
| Local platform                             | Debian GNU/Linux 13.6, workspace sandbox; not Ubuntu or a GitHub-hosted runner.                              |
| Locally extracted desktop distribution     | Debian desktop Firefox ESR 140.15.0esr, Fcitx5 5.1.12, GTK frontend 5.1.3, Mozc 2.29.5160.102, Xvfb 21.1.16. |
| Local X11 dimensions                       | 1600 × 1000, 24-bit depth, requested 96 DPI, X11 display `:97` (observer control used `:98`).                |

The report accompanies the source patch and local diagnostics in the delivered evidence bundle.
Local diagnostics are explicitly separate from GitHub-hosted evidence.

## Capability classification

| Capability                                   | Classification | Evidence and remaining requirement                                                                                                                                                                                                                    |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Graphical native Firefox under X11        | BLOCKED        | No hosted execution. Local desktop Firefox created a native “Profile Missing” dialog, but did not reach a usable WebDriver browser session or textarea. A process/window launch does not satisfy A.                                                   |
| B. Intended GTK/Fcitx5 input path            | BLOCKED        | Local Fcitx5 loaded its D-Bus frontend and Firefox sent CreateInputContext traffic. Focused textarea activation, real key processing and runtime GTK-module verification were not reached.                                                            |
| C. Japanese composition and selection        | BLOCKED        | No usable native Firefox textarea session; no kana conversion, selection, confirmation, or cancellation was demonstrated.                                                                                                                             |
| D. Identify the actual candidate panel       | BLOCKED        | Local X11 inspection found a hidden `Fcitx5 Input Window` owned by the running Fcitx5 process. It remained unmapped; this is not evidence that candidates appeared.                                                                                   |
| E. Measure geometry and visibility reliably  | PARTIAL        | Live Xlib/root-pixel observation and exact geometry of a real foreign control window worked locally. Candidate geometry, movement and lifecycle during Firefox composition remain unverified.                                                         |
| F. Reject missing/incorrect IME observations | PARTIAL        | Five predicate/anchor unit tests passed. Live X11 controls rejected no window with forced active flags and a foreign-owner window with plausible Fcitx title/class/type. Direct Latin and post-composition controls inside Firefox remain unexecuted. |
| G. Outliner production textarea              | BLOCKED        | No hosted native run. Existing local application checks also failed before usable integration: build reports missing `demoProject` route matcher; client TypeScript configuration is missing; E2E TypeScript reports baseline errors.                 |
| H. Detect original regression                | BLOCKED        | Neither original nor unchanged PR revision was exercised in the target native environment. No before/after comparison or regression oracle has been proven.                                                                                           |

The local Firefox attempt used packages downloaded and extracted into scratch space, without
installing system packages. Both the ordinary attempt and a diagnostic attempt with Firefox child
sandbox overrides reached the same profile error; neither is counted as native IME success. The
diagnostic overrides are not present in the GitHub workflow. Logs also contain a read-only
`/proc/self/uid_map` sandbox warning. The screenshot establishes the profile dialog, not that warning
as its definitive cause. The root cause of the profile error has not been established.

`gh issue view`, `gh pr view` and `gh api user` returned `Forbidden` even with the tool's network
permission enabled. `api.github.com` is absent from the observed destination policy. Public
`github.com` issue/PR pages and Git fetch endpoints were readable. The initial `gh auth status`
message about an invalid token is not conclusive authentication evidence because API access itself
is blocked. No alternate API hostname or proxy bypass was attempted.

## What is implemented

`.github/workflows/poc-native-ime.yml` is a dedicated, non-mandatory **ubuntu-24.04** job. It runs on
manual dispatch, the PoC branch push, or a PR touching its own workflow/harness. It does not modify
the existing E2E workflow or matrix. The branch push trigger permits the first execution before the
new workflow exists on the default branch; manual dispatch requires normal GitHub workflow
availability on the default branch.

The job first installs the native desktop experiment and runs the standalone fixture. Only after
standalone success does it prepare the repository's existing E2E infrastructure, build the server,
start services through `scripts/ci-e2e-start.sh`, and attempt Outliner integration. The existing
setup action's Chromium installation is incidental; no PoC observation uses Chromium.

The setup uses Mozilla's signed desktop Firefox deb repository, verifies its signing-key
fingerprint, and records its apt origin and version. Ubuntu's archive Snap transition package and
Playwright's patched Firefox are not used as native IME evidence. It installs Fcitx5, its GTK3 module,
Mozc, Noto CJK fonts, Xvfb and Openbox. Selenium 4.29.0 reads browser state through geckodriver 0.36.0;
all composition text and candidate keys come from `xdotool`/XTest, not WebDriver key injection.
Desktop/apt versions and transitive Python dependencies are recorded rather than fully frozen;
repeatability across future runner updates is not yet measured.

Each experiment runs inside a fresh D-Bus session with X11, `GDK_BACKEND=x11`,
`MOZ_ENABLE_WAYLAND=0`, `GTK_IM_MODULE=fcitx`, and `XMODIFIERS=@im=fcitx`. XIM and the IBus frontend
are disabled. Its isolated Fcitx profile enables inline preedit and selects Mozc. Starting the
daemons or setting these variables alone cannot pass the native assertions.

## Oracles and their precise observations

1. **A — Usable graphical browser:** stock Firefox must load the visible fixture, report scale 1,
   and accept an OS pointer click into its textarea. A mere successful launch is insufficient.
2. **B — Runtime GTK path:** Fcitx `Controller1.DebugInfo` must report a focused Firefox
   `frontend:dbus` context. Firefox process maps must contain `im-fcitx`; captured D-Bus traffic
   must contain input-context creation and ProcessKeyEvent calls. Trusted browser preedit must be
   active. The XIM frontend is disabled, so it cannot satisfy this test by fallback.
3. **C — Real composition:** type `nihon`, assert trusted `にほん` preedit, extend with `go` and
   assert `にほんご`, open candidates with Space, and use Down to change the selected preedit.
   Enter must commit exactly the selected string into the textarea. A second composition must
   cancel without changing the committed value. No CompositionEvents are constructed or dispatched.
4. **D — Candidate identity:** exactly one viewable X11 window must have name `Fcitx5 Input Window`,
   class `fcitx/fcitx`, `_NET_WM_WINDOW_TYPE_COMBO`, and `_NET_WM_PID` equal to the verified Fcitx5
   process. It must coexist with active trusted composition in the focused textarea. Candidate
   identity must persist through selection. The property signature comes from Fcitx5's Classic UI
   [XCBInputWindow implementation](https://github.com/fcitx/fcitx5/blob/master/src/ui/classic/xcbinputwindow.cpp).
5. **E — Geometry and screen correlation:** Xlib records root coordinates, dimensions and mapped
   state. A full X11 root screenshot includes Firefox and the panel together; a crop named by the
   identified window ID uses exactly its recorded geometry, must lie inside the desktop, and must
   contain rendered pixel variation. Confirmation and cancellation must unmap it across multiple
   samples. A separate reference control moves the real Firefox window through X11 and asserts
   the native panel follows the input's screen translation within 4px. Screenshots remain necessary
   to review the inline glyphs and candidate content; varied pixels alone are not semantic OCR.
6. **F — Negative controls:** direct Latin typing must produce literal Latin text without trusted
   composition or a panel. An absent panel must fail even with active/focused flags forced true.
   A real foreign-owner X11 window with plausible title/class/type/geometry must fail identity.
   This blank adversarial control is never evidence of native candidate UI. An earlier live
   X11 check runs before Fcitx starts; the full Firefox controls run after real composition.
7. **G — Production path:** load the local backend-seeded demo through its normal route, OS-click
   an ordinary item, and use the editor's Enter handling to obtain an empty item. The actual focused
   receiver must be the app-created `textarea.global-textarea`. Repeat the native composition,
   candidate selection, commit and cancellation sequence. No replacement input, `.focus()`,
   store patch, proxy sizing patch or production wrap assignment is performed.
8. **H / placement investigation:** collect 5- and 40-character compositions in Outliner and a
   normal `wrap=off` reference in the same Firefox/IME session. Match computed font and visible
   input-start screen coordinates by adjusting only the standalone reference fixture. Require
   identical conversion text/selection, sufficient desktop space below, no panel overlap with the
   visible composing line, and a reference-relative horizontal offset within 4px. This never
   assumes that the candidate left border equals the first glyph's left edge.

The integration comparison is deliberately diagnostic. Before claiming REQ-002, review whether the
proxy-derived horizontal origin matches the visible first composing glyph in the screenshots,
including prefix text and multi-line rendered composition. The current automated integration case
uses an empty item; prefix cases, shrinkage, selected-candidate variants, scaling, clipping and
repeated-run stability still need validation. The 4px tolerance has not been calibrated on an
authoritative runner. A passing comparison cannot establish H without reproducing the original
defect and comparing the unchanged fix revision in the same controlled environment.

If any intended runtime path, native panel, coordinate conversion, or application startup is
unavailable, the experiment fails or remains blocked. It has no success exit for assertion failures,
`continue-on-error`, synthetic candidate fallback, conditional test skips or XIM substitution.

## Reproduction and artifacts

On a disposable Ubuntu 24.04 machine with sudo and ordinary network access:

```sh
bash scripts/poc/native-ime/setup.sh
python3 -m unittest discover -s scripts/poc/native-ime -p 'test_*.py' -v
bash scripts/poc/native-ime/run.sh standalone
```

For integration, provision the dependency trees and global tools using the repository's existing
`.github/actions/setup-e2e-deps/action.yml`, then:

```sh
(cd server && npm run build)
bash scripts/ci-e2e-start.sh
bash scripts/poc/native-ime/run.sh outliner
```

Local reproduction is not a GitHub-hosted proof. The harness downgrades any locally demonstrated
capability to PARTIAL; PROVEN requires `GITHUB_ACTIONS=true` and `RUNNER_ENVIRONMENT=github-hosted`
plus all corresponding assertions. Runner provenance must also be confirmed from the actual run
page and tested checkout SHA, not just environment variable strings.

`job_logs/native-ime/` contains setup/package/version diagnostics, run URL and tested SHA, separate
standalone/integration logs, `fcitx5-diagnose`, X11 window snapshots, root screenshots and exact
candidate crops, OS keyboard command trace, trusted browser event traces, GTK process maps, D-Bus
traffic, JSON capability results and failure tracebacks. The job generates an execution report
even if setup or application startup fails, and uploads all evidence with `if: always()`. Its
report never turns missing results into a successful native capability. Artifact retention is 14 days.

The [upstream Xvfb wrapper](https://github.com/fcitx/fcitx5/blob/master/test/xvfb_wrapper.sh) and
[Fcitx5 issue #1672](https://github.com/fcitx/fcitx5/issues/1672) are useful investigation references;
they are not evidence that this Firefox integration has passed.

## Checks completed in this session

- Five strict predicate/anchor unit tests passed; Python compilation and Bash syntax checks passed.
- A real local Xvfb/Xlib check measured the foreign window at `(1300,100,200,150)`, captured root
  pixels, and rejected both missing and foreign-owner windows with forced active flags.
- `actionlint` 1.7.7 passed for the dedicated workflow.
- `dprint fmt` ran on the applicable JavaScript/documentation files using a workspace cache.
- Required E2E TypeScript checking failed on existing files (including project rename, mobile
  caret, test helpers, logger and shared/server types). No TypeScript file is changed by this PoC.
- Required client TypeScript checking failed because `$app/types` and `$app/tsconfig` are missing.
- Required client build failed with `No matcher found for parameter 'demoProject'` in the existing
  route. No application implementation change was made to conceal that integration blocker.

The exact local logs and reproduction commands are preserved in the delivered diagnostics bundle.
GitHub-hosted execution, native composition, a production-input observation, and before/after
regression testing remain outstanding. No issue was closed, PR merged, or PR #5504 marked validated.
