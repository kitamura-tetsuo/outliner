# Native IME regression (Issue #5501)

`.github/workflows/native-ime-regression.yml` verifies the shared editor input
(`textarea.global-textarea`) with real OS-level Japanese input against a freshly built
copy of the revision under test. It runs on pull requests that touch the input path or
the harness, and on manual dispatch. Unlike the prepared PoC workflows, it never tests the
archived PoC application pin.

Both jobs record the application revision separately from the harness revision. Before
any native test runs, `scripts/native-ime-regression/verify-served-revision.mjs` fetches
the client source that Vite actually serves for `GlobalTextArea.svelte`,
`KeyEventHandler.ts` and `EditorOverlay.svelte`, compares it byte for byte with the
checkout's `HEAD`, and requires the application source trees to have no tracked
modifications. A missing identity, failed assertion or unavailable observation makes the
job fail. Nothing is skipped or downgraded to a pass.

## Ubuntu/X11 Firefox + Fcitx5 (AS-002)

`scripts/native-ime-regression/ubuntu/` runs graphical Mozilla Firefox under Xvfb
(1600×1600, 96 DPI, `devicePixelRatio` 1) and Openbox. It uses Fcitx5 with the GTK
frontend (`GTK_IM_MODULE=fcitx`), Mozc, and inline preedit enabled. XTest
(`xdotool`) supplies every keystroke. Selenium only navigates and reads the page.

- **Calibration.** The harness moves the real X11 pointer to commanded screen points and
  reads the trusted `mousemove` that Firefox reports. The CSS→screen conversion
  (`mozInnerScreenX/Y`) must agree within 1px. The reference tab and the application tab
  must share the same screen origin.
- **Positive runs.** Four runs cover an empty item and an item after existing text, each
  ending once with confirmation and once with cancellation.
  - The run enters the editor through an OS click, then creates the item with ordinary
    End/Enter handling and ordinary typing.
  - A single composition grows from 5 to 40 kana and shrinks to 10.
  - At each stage the harness converts, opens the native list, changes its selection with
    Down, and samples placement.
  - The run fails unless all of the following hold:
    - the panel highlight changes and the inline preedit changes;
    - exactly one trusted composition covers the whole sequence;
    - the composing text is rendered inline in the item;
    - after confirmation, the canonical Y.Text and the rendered text equal the existing
      text plus the selected candidate, with the caret right after it;
    - after cancellation, the existing text and caret are restored;
    - the native panel closes.
- **Candidate identity.** The prepared PoC observer matches the published window
  properties. On top of that, `identity.py` requires the X server's own record of the
  window's owning client (X-Resource extension) to be the launched Fcitx5 daemon.
  `_NET_WM_PID` alone can be forged; the owning client cannot.
- **Placement verdict** (`verdict.py`). Every sample is compared with a normal
  `wrap="off"` textarea in a second tab of the same window. That reference has the
  item's font and line height, sits at the item's visible input-start position, and
  receives the same keystrokes. The reference runs before the application in each pair,
  so Mozc's learning from a confirmation cannot change the candidate order between the
  two. A sample passes only if all of these hold:
  - the text, reading, font and input start match the reference;
  - there is room below the line for the panel in both observations;
  - the panel covers neither observation's displayed composing glyphs by more than 2px;
  - `(panel left − first composing glyph)` differs from the reference by at most 2px.
- **Tolerances.** They are declared in `verdict.py` before any observation and come from
  rounding alone. Each relative offset mixes one integer X11 coordinate with one
  sub-pixel layout coordinate. Calibration error is common to both tabs.
- **Live negative controls.**
  - Latin input with no panel is rejected, including when the active flags are forced.
  - A foreign X11 window that copies the panel's name, class, type and even the daemon's
    `_NET_WM_PID` is rejected.
  - A deliberately defective proxy shifted 60px right (displacement without overlap) and
    one shifted up 1.25em (overlap without displacement) each fail for exactly the
    expected reason only, by more than the tolerance. The defect is injected as a style
    that exists only during that run and is verified removed afterwards.

`results.json` contains every assertion with its measured values. The other evidence is
`calibration.json`, root screenshots, panel crops and per-sample window records.
`report.py` turns these into `verdict.json` and the job summary.

## Windows Firefox + Microsoft Japanese IME (AS-003)

The Windows job reuses the prepared harness unchanged: Win32 `SendInput`, native UI
Automation candidate selection, and strict canonical Y.Text/cursor assertions. The
application, however, is the evaluated revision checked out separately into
`work/native-ime-app`. `scripts/native-ime-regression/windows/start-backend.ps1` builds
it in the same WSL2 Linux Compose backend and verifies the image label and the served
source. All PoC capabilities A–K must pass. `report.py` additionally requires:

- the one- and two-caret confirmation and cancellation scenarios, with confirmed text
  taken from the selected native candidate;
- all nine live document/cursor mutation controls rejected.

## Running

Manually dispatch **Native IME regression** on the branch to evaluate. Its jobs need
GitHub-hosted `ubuntu-24.04` and `windows-2025` runners. Locally, on a disposable
Ubuntu 24.04 machine with sudo, run as a non-root user (Mozc refuses to start as root):

```sh
bash scripts/poc/native-ime/setup.sh
(cd server && npm run build) && bash scripts/ci-e2e-start.sh
node scripts/native-ime-regression/verify-served-revision.mjs . http://127.0.0.1:7090 job_logs/native-ime-regression/ubuntu/application-identity.json
bash scripts/native-ime-regression/ubuntu/run.sh
python3 scripts/native-ime-regression/report.py ubuntu job_logs/native-ime-regression/ubuntu
```

The PoC reports under `docs/poc/` remain historical evidence for their pinned revisions.
