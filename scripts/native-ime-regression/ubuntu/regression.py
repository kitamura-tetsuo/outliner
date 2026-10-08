"""Automated Ubuntu/X11 Firefox + Fcitx5 native IME regression for Issue #5501 (AS-002).

Graphical Firefox, OS-level XTest keystrokes, real Fcitx5/Mozc composition through the GTK
frontend, and the native candidate panel read back from the X server. Selenium only
navigates and reads the page; it never dispatches composition events, supplies Japanese
text, focuses the production receiver, or changes the application under test. The only
page mutation is the deliberately defective style injected in the negative-control runs,
which is removed and verified absent afterwards.
"""
import json
import os
import subprocess
import time
import traceback
from pathlib import Path

from PIL import Image, ImageChops
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

from identity import NativeDesktop, native_candidates, require_native_candidate
from verdict import (HORIZONTAL_TOLERANCE_PX, OVERLAP_TOLERANCE_PX, CALIBRATION_LIMIT_PX, ROOM_BELOW_MARGIN_PX,
                     calibration_verdict, failed_checks, placement_verdict, utf16_length)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = Path(os.environ["IME_ARTIFACTS"])
FCITX_PID = int(os.environ["IME_FCITX_PID"])
APP_URL = os.environ.get("IME_APP_URL", "http://127.0.0.1:7090/demo/Welcome")
REFERENCE_URL = os.environ.get("IME_REFERENCE_URL", "http://127.0.0.1:8765/reference.html")
# Short -> long -> shrunk within one composition. Each stage converts, opens the native
# panel, changes its selection and samples placement.
STAGES = [("short", "a" * 5, 0), ("long", "a" * 35, 0), ("shrunk", "", 30)]
RUNS = [("empty-confirm", "", "confirm"), ("empty-cancel", "", "cancel"),
        ("after-text-confirm", "prefix", "confirm"), ("after-text-cancel", "prefix", "cancel")]
NEGATIVE_STYLE_ID = "native-ime-negative-control"

driver = desktop = None
handles = {}
assertions = []
log = []


class Failed(AssertionError):
    pass


def save(name, value):
    (OUT / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2))


def record(name, passed, **measured):
    entry = dict(name=name, passed=bool(passed), **measured)
    assertions.append(entry)
    print(f"{'PASS' if passed else 'FAIL'} {name} {json.dumps(measured, ensure_ascii=False, default=str)[:600]}",
          flush=True)
    if not passed:
        raise Failed(f"{name}: {json.dumps(measured, ensure_ascii=False)[:2000]}")
    return entry


def command(*args):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
    log.append(dict(time=time.monotonic(), args=list(args), output=result.stdout))
    return result.stdout.strip()


def wait(predicate, description, timeout=15):
    end = time.monotonic() + timeout
    last = None
    while time.monotonic() < end:
        try:
            last = predicate()
            if last:
                return last
        except Exception as error:  # Transient read during re-render; the deadline still applies.
            last = repr(error)
        time.sleep(.1)
    raise Failed(f"Timed out: {description}; last={last!r}"[:2000])


def key(name):
    command("xdotool", "key", "--clearmodifiers", name)


def type_text(text):
    if text:
        command("xdotool", "type", "--clearmodifiers", "--delay", "60", text)


def ime(on):
    command("fcitx5-remote", "-s", "mozc") if on else None
    command("fcitx5-remote", "-o" if on else "-c")
    if on:
        record("mozc-active", command("fcitx5-remote", "-n") == "mozc")


def tab(name):
    driver.switch_to.window(handles[name])
    driver.execute_script((HERE / "probe.js").read_text())


def screen():
    return driver.execute_script("return {x: mozInnerScreenX, y: mozInnerScreenY, dpr: devicePixelRatio}")


def state(selector):
    return driver.execute_script("""
      const el = document.querySelector(arguments[0]), p = window.__nativeImeProbe;
      return {focused: document.hasFocus() && document.activeElement === el, composing: p.composing,
              preedit: p.preedit, compositions: p.compositions, events: p.events.length,
              value: el ? el.value : null, wrap: el ? el.getAttribute('wrap') : null,
              className: el ? el.className : null, style: el ? el.getAttribute('style') : null,
              minWidth: el ? getComputedStyle(el).minWidth : null};
    """, selector)


def os_click(x, y):
    command("xdotool", "mousemove", str(round(x)), str(round(y)), "click", "1")


def capture(label):
    path = OUT / f"{label}.png"
    desktop.screenshot(str(path))
    return path


def crop(path, rect, label):
    image = Image.open(path)
    box = tuple(round(v) for v in (rect["left"], rect["top"], rect["right"], rect["bottom"]))
    record(f"{label}-inside-desktop", box[0] >= 0 and box[1] >= 0 and box[2] <= image.width and box[3] <= image.height,
           box=box)
    region = image.crop(box)
    region.save(OUT / f"{label}.png")
    return region


def ink(region):
    """Dark (text) pixels in an RGB region."""
    return sum(1 for pixel in region.convert("L").getdata() if pixel < 140)


# --- Calibration --------------------------------------------------------------------------

def calibrate():
    tab("reference")
    origin = screen()
    record("device-pixel-ratio-is-one", origin["dpr"] == 1, dpr=origin["dpr"])
    points = []
    for index, (cx, cy) in enumerate([(120, 120), (700, 160), (1200, 520), (300, 640)]):
        commanded = [round(origin["x"] + cx), round(origin["y"] + cy)]
        command("xdotool", "mousemove", str(commanded[0]), str(commanded[1]))
        pointer = wait(lambda: (p if (p := driver.execute_script("return window.__nativeImeProbe.pointer"))
                                and p["trusted"] and abs(p["clientX"] - cx) <= 3 and abs(p["clientY"] - cy) <= 3
                                else None), f"trusted pointer calibration event {index}")
        points.append(dict(commanded=commanded, reported=[origin["x"] + pointer["clientX"], origin["y"] + pointer["clientY"]],
                           screen=[pointer["screenX"], pointer["screenY"]], client=[pointer["clientX"], pointer["clientY"]]))
    verdict = calibration_verdict(points)
    save("calibration", dict(origin=origin, verdict=verdict, points=points))
    record("css-to-screen-calibration", verdict["ok"], **verdict)
    tab("application")
    app_origin = screen()
    record("application-and-reference-share-screen-origin", app_origin == origin, application=app_origin,
           reference=origin)
    return verdict


# --- Application ---------------------------------------------------------------------------

APP_RECEIVER = "textarea.global-textarea"


def app_state():
    return state(APP_RECEIVER)


def app_item():
    return driver.execute_script("""
      const store = window.editorOverlayStore, id = store.getActiveItem();
      const y = window.__YJS_STORE__, project = y?.yjsClient?.getProject();
      let canonical = null;
      const walk = items => { for (const item of items) { if (item.id === id) canonical = item.yMap.get('text')?.toString(); walk(item.items); } };
      if (project) walk(project.items);
      const el = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`);
      const cursors = Object.values(store.cursors).filter(c => (c.userId ?? 'local') === 'local')
        .map(c => ({itemId: c.itemId, offset: c.offset, isActive: c.isActive}));
      const selections = Object.values(store.selections).filter(s => (s.userId ?? 'local') === 'local').length;
      return {id, canonical, rendered: el ? el.textContent : null, cursors, selections};
    """)


def app_start_geometry(item_id):
    """Predicted visible input start of the next composition, from the rendered item."""
    return driver.execute_script("""
      const el = document.querySelector(`.outliner-item[data-item-id="${arguments[0]}"] .item-text`);
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const left = r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
      const top = r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth);
      const contentHeight = r.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)
        - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth);
      let start = left;
      if (el.textContent.length) {
        const range = document.createRange(); range.selectNodeContents(el);
        start = range.getBoundingClientRect().right;
      }
      const lineHeight = parseFloat(s.lineHeight);
      return {left: start, top, lineHeight: Number.isFinite(lineHeight) ? lineHeight : contentHeight,
              font: {fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
                     fontStyle: s.fontStyle, letterSpacing: s.letterSpacing}};
    """, item_id)


def font_key(font):
    return f"{font['fontStyle']} {font['fontWeight']} {font['fontSize']} {font['fontFamily']} ls={font['letterSpacing']}"


def app_line(item_id, start, length):
    """Screen rectangles of the displayed composing glyphs in the rendered item."""
    return driver.execute_script("""
      const [id, start, length] = arguments;
      const el = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
      for (let n; (n = walker.nextNode());) nodes.push(n);
      const point = offset => { let rest = offset; for (const n of nodes) { if (rest <= n.length) return [n, rest]; rest -= n.length; }
        throw Error('Composing text is not rendered inline'); };
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(start + length));
      const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
        .map(r => ({left: mozInnerScreenX + r.left, top: mozInnerScreenY + r.top, right: mozInnerScreenX + r.right,
                    bottom: mozInnerScreenY + r.bottom}));
      const s = getComputedStyle(el);
      return {rects, text: el.textContent, font: {fontFamily: s.fontFamily, fontSize: s.fontSize,
              fontWeight: s.fontWeight, fontStyle: s.fontStyle, letterSpacing: s.letterSpacing}};
    """, item_id, start, length)


def reference_line(preedit):
    return driver.execute_script("""
      const ta = document.getElementById('reference'), m = document.getElementById('measure');
      const s = getComputedStyle(ta), r = ta.getBoundingClientRect();
      for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight']) m.style[p] = s[p];
      m.textContent = arguments[0];
      const g = m.getBoundingClientRect(), lineHeight = parseFloat(s.lineHeight);
      const top = mozInnerScreenY + r.top + (lineHeight - g.height) / 2, left = mozInnerScreenX + r.left;
      return {rects: [{left, top, right: left + g.width, bottom: top + g.height}],
              font: {fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
                     fontStyle: s.fontStyle, letterSpacing: s.letterSpacing}};
    """, preedit)


def place_reference(start):
    driver.execute_script("""
      const [g] = arguments, ta = document.getElementById('reference');
      ta.value = '';
      Object.assign(ta.style, {left: g.left + 'px', top: g.top + 'px', lineHeight: g.lineHeight + 'px',
                               height: g.lineHeight + 'px', ...g.font});
    """, start)


# --- Native composition -------------------------------------------------------------------

def panel_snapshot(selector, label):
    wait(lambda: native_candidates(desktop.windows(), FCITX_PID), f"{label}: native candidate panel becomes visible")
    windows = desktop.windows()
    current = state(selector)
    panel = require_native_candidate(windows, FCITX_PID, current["composing"], current["focused"])
    path = capture(label)
    region = crop(path, dict(left=panel["x"], top=panel["y"], right=panel["x"] + panel["width"],
                             bottom=panel["y"] + panel["height"]), f"{label}-panel-{panel['id']}")
    record(f"{label}-panel-renders-candidates", len(region.getcolors(region.width * region.height) or []) > 8)
    save(label, dict(windows=windows, state=current, panel=panel))
    return panel, region, path


def stage(env, selector, label, line_of):
    """Convert, open the native panel, change its selection and sample placement."""
    reading = state(selector)["preedit"]
    key("space")
    key("space")
    first_panel, first_region, _ = panel_snapshot(selector, f"{label}-open")
    first = state(selector)["preedit"]
    key("Down")
    wait(lambda: state(selector)["preedit"] != first, f"{label}: native selection changes the inline preedit")
    panel, region, path = panel_snapshot(selector, f"{label}-selected")
    selected = state(selector)
    record(f"{label}-same-native-panel", panel["id"] == first_panel["id"], before=first_panel["id"], after=panel["id"])
    changed = first_region.size != region.size or ImageChops.difference(first_region.convert("RGB"),
                                                                         region.convert("RGB")).getbbox() is not None
    record(f"{label}-native-selection-highlight-changed", changed, before=first, after=selected["preedit"])
    record(f"{label}-one-ongoing-composition", selected["composing"], compositions=selected["compositions"])
    line = line_of(selected["preedit"])
    visible = sum(ink(Image.open(path).crop(tuple(round(v) for v in (r["left"], r["top"], r["right"], r["bottom"]))))
                  for r in line["rects"])
    record(f"{label}-composing-text-visible-inline", visible >= 20, dark_pixels=visible)
    return dict(env=env, text=selected["preedit"], reading=reading, before_selection=first, font=font_key(line["font"]),
                glyph_left=line["rects"][0]["left"], line_rects=line["rects"], panel=panel,
                screenshot=path.name, compositions=selected["compositions"])


def compose(env, selector, label, line_of, end):
    """One composition: short -> long -> shrunk, sampling at each stage, then end it."""
    before = state(selector)
    record(f"{label}-receiver-focused", before["focused"] and not before["composing"], state=before)
    ime(True)
    samples, kana = [], 0
    for index, (name, typed, backspaces) in enumerate(STAGES):
        type_text(typed)
        for _ in range(backspaces):
            key("BackSpace")
        # Mozc hiragana mode reads each OS "a" keystroke as あ.
        kana += len(typed) - backspaces
        expected = (before["compositions"] + 1)
        wait(lambda: (s := state(selector))["composing"] and s["compositions"] == expected
             and s["preedit"] == "あ" * kana, f"{label}-{name}: trusted Japanese preedit in one ongoing composition")
        samples.append(stage(env, selector, f"{label}-{name}", line_of))
        if index < len(STAGES) - 1:
            key("Escape")  # Mozc: leave conversion; the same composition continues as its reading.
            wait(lambda: (s := state(selector))["composing"] and s["preedit"] == samples[-1]["reading"],
                 f"{label}-{name}: conversion returns to the ongoing reading")
    lengths = [len(s["reading"]) for s in samples]
    if len(samples) == 3:
        record(f"{label}-composition-grows-then-shrinks", lengths[0] < lengths[1] and lengths[2] < lengths[1],
               reading_lengths=lengths)
    selected = samples[-1]["text"]
    if end == "confirm":
        key("Return")
    else:
        key("Escape")
        key("Escape")
    after = wait(lambda: (s := state(selector)) if not s["composing"] else None, f"{label}: composition ends")
    record(f"{label}-exactly-one-composition", after["compositions"] == before["compositions"] + 1,
           before=before["compositions"], after=after["compositions"])
    end_event = driver.execute_script("return window.__nativeImeProbe.events.filter(e => e.type === 'compositionend').at(-1)")
    record(f"{label}-trusted-native-end", end_event and end_event["trusted"]
           and end_event["data"] == (selected if end == "confirm" else ""), event=end_event, selected=selected)
    wait(lambda: not native_candidates(desktop.windows(), FCITX_PID), f"{label}: native panel closes")
    for _ in range(5):  # Bounded interval, not one lucky sample.
        record(f"{label}-native-panel-stays-closed", not native_candidates(desktop.windows(), FCITX_PID))
        time.sleep(.1)
    capture(f"{label}-ended")
    return samples, selected, after


def reference_run(label, start, keys_end="cancel"):
    tab("reference")
    place_reference(start)
    rect = driver.execute_script("const r=document.getElementById('reference').getBoundingClientRect();"
                                 "return [mozInnerScreenX+r.left+20, mozInnerScreenY+r.top+r.height/2]")
    ime(False)
    os_click(*rect)
    wait(lambda: state("#reference")["focused"], f"{label}: OS click focuses the reference textarea")
    samples, _, after = compose("reference", "#reference", label, reference_line, keys_end)
    record(f"{label}-reference-cancel-restores-empty-value", after["value"] == "", value=after["value"])
    return samples


def application_run(label, prefix, end, matched, mutation=None, expect_failure=None):
    tab("application")
    current = refocus_application(label, prefix)
    record(f"{label}-production-receiver", current["className"].split()[0] == "global-textarea"
           and current["wrap"] == "off", className=current["className"], wrap=current["wrap"])
    record(f"{label}-normal-proxy-sizing", "min-width" not in (current["style"] or "")
           and current["minWidth"] in ("0px", "auto"), style=current["style"], minWidth=current["minWidth"])
    item = app_item()
    if mutation:
        driver.execute_script(
            "const s=document.createElement('style');s.id=arguments[0];s.textContent=arguments[1];document.head.append(s);",
            NEGATIVE_STYLE_ID, mutation)
    try:
        start = utf16_length(prefix)
        samples, selected, after = compose("application", APP_RECEIVER, label,
                                           lambda preedit: app_line(item["id"], start, utf16_length(preedit)), end)
    finally:
        if mutation:
            driver.execute_script("document.getElementById(arguments[0])?.remove()", NEGATIVE_STYLE_ID)
            record(f"{label}-negative-mutation-removed",
                   not driver.execute_script("return !!document.getElementById(arguments[0])", NEGATIVE_STYLE_ID))
    verdicts = []
    for app_sample, reference_sample in zip(samples, matched):
        verdict = placement_verdict(app_sample, reference_sample, desktop.root.get_geometry().height)
        verdicts.append(dict(application=app_sample, reference=reference_sample, verdict=verdict))
    outcome = app_item()
    expected_text = prefix + (selected if end == "confirm" else "")
    result = dict(label=label, item=item, outcome=outcome, selected=selected, expected_text=expected_text,
                  samples=verdicts, final_state=after)
    if expect_failure is None:
        for index, entry in enumerate(verdicts):
            record(f"{label}-{STAGES[index][0]}-placement", entry["verdict"]["ok"],
                   failed=failed_checks(entry["verdict"]), displacement_px=entry["verdict"]["displacement_px"],
                   covered=entry["verdict"]["covered"])
        record(f"{label}-canonical-and-rendered-text", outcome["canonical"] == expected_text
               and outcome["rendered"] == expected_text, canonical=outcome["canonical"],
               rendered=outcome["rendered"], expected=expected_text)
        record(f"{label}-caret-after-result", outcome["cursors"] == [dict(itemId=item["id"],
               offset=utf16_length(expected_text), isActive=True)] and outcome["selections"] == 0,
               cursors=outcome["cursors"], selections=outcome["selections"])
        record(f"{label}-receiver-still-production", after["wrap"] == "off" and after["focused"], state=after)
    return result


def refocus_application(label, prefix):
    """Return input focus to the production receiver after the reference tab was used.

    Firefox may not hand document focus back to the editor when its tab is re-selected. In
    that case an ordinary OS click on the item, just after its existing text, restores it;
    the logical caret must then be exactly where the baseline left it.
    """
    try:
        return wait(lambda: (s := app_state()) if s["focused"] else None, "focus returns with the tab", 3)
    except Failed:
        pass
    item = app_item()
    point = driver.execute_script("""
      const el = document.querySelector(`.outliner-item[data-item-id="${arguments[0]}"] .item-text`);
      const range = document.createRange(); range.selectNodeContents(el);
      const text = range.getBoundingClientRect(), box = el.getBoundingClientRect();
      const x = el.textContent.length ? text.right + 2 : box.left + 4;
      return [mozInnerScreenX + x, mozInnerScreenY + box.top + box.height / 2];
    """, item["id"])
    os_click(*point)
    current = wait(lambda: (s := app_state()) if s["focused"] else None,
                   f"{label}: OS click returns focus to the production receiver")
    after = app_item()
    record(f"{label}-refocus-keeps-baseline-caret", after["cursors"] == item["cursors"]
           and after["cursors"][0]["offset"] == utf16_length(prefix), before=item["cursors"], after=after["cursors"])
    return current


def new_app_item(label, prefix):
    tab("application")
    ime(False)
    key("End")
    key("Return")
    wait(lambda: (s := app_item())["canonical"] == "" and s["rendered"] == "" and app_state()["value"] == "",
         f"{label}: ordinary Enter creates an empty item")
    type_text(prefix)
    wait(lambda: app_item()["canonical"] == prefix, f"{label}: ordinary typing writes the existing text")
    item = app_item()
    record(f"{label}-baseline-caret", item["cursors"] == [dict(itemId=item["id"], offset=utf16_length(prefix),
                                                                isActive=True)], cursors=item["cursors"])
    return app_start_geometry(item["id"])


def matched_pair(label, prefix, end, mutation=None, expect_failure=None):
    start = new_app_item(label, prefix)
    reference = reference_run(f"{label}-reference", start)
    return application_run(f"{label}-application", prefix, end, reference, mutation, expect_failure)


# --- Scenarios -----------------------------------------------------------------------------

def enter_application():
    tab("application")
    driver.get(APP_URL)
    driver.execute_script((HERE / "probe.js").read_text())
    items = wait(lambda: (f if len(f := driver.find_elements(By.CSS_SELECTOR, ".outliner-item .item-content")) >= 2
                          else None), "ordinary editor items", 120)
    rect = driver.execute_script("const r=arguments[0].getBoundingClientRect();"
                                 "return [mozInnerScreenX+r.left+r.width/2, mozInnerScreenY+r.top+r.height/2]", items[1])
    os_click(*rect)
    wait(lambda: app_state()["focused"], "OS click focuses the app-created production receiver")
    record("production-receiver-created-by-app", app_state()["className"].split()[0] == "global-textarea")


def negative_identity_controls(results):
    """Missing panel and a foreign window presented as the panel must be rejected live."""
    label = "control-missing-and-foreign"
    new_app_item(label, "latin")
    current = app_state()
    windows = desktop.windows()
    record(f"{label}-latin-has-no-composition", not current["composing"] and not native_candidates(windows, FCITX_PID))
    rejections = []
    for name, observed, composing, focused in [("missing-with-forced-active-flags", windows, True, True),
                                                ("inactive-composition", windows, False, True)]:
        try:
            require_native_candidate(observed, FCITX_PID, composing, focused)
        except AssertionError as error:
            rejections.append(dict(control=name, rejected=True, reason=str(error)))
        else:
            rejections.append(dict(control=name, rejected=False))
    foreign = desktop.spoofed_candidate(FCITX_PID)
    try:
        windows = desktop.windows()
        spoof = next(w for w in windows if w["id"] == foreign.id)
        capture(f"{label}-foreign-window")
        try:
            require_native_candidate(windows, FCITX_PID, True, True)
        except AssertionError as error:
            rejections.append(dict(control="foreign-window-with-copied-properties-and-pid", rejected=True,
                                   reason=str(error), window=spoof))
        else:
            rejections.append(dict(control="foreign-window-with-copied-properties-and-pid", rejected=False, window=spoof))
    finally:
        foreign.destroy()
        desktop.display.sync()
    results.append(dict(name=label, kind="identity", rejections=rejections))
    for entry in rejections:
        record(f"{label}-{entry['control']}-rejected", entry["rejected"], **entry)


def placement_control(results, name, mutation, expected_check, magnitude):
    global STAGES
    saved = STAGES
    STAGES = saved[:1]  # The short stage isolates one deliberate placement defect.
    try:
        result = matched_pair(name, "", "cancel", mutation=mutation, expect_failure=expected_check)
    finally:
        STAGES = saved
    verdict = result["samples"][0]["verdict"]
    failures = failed_checks(verdict)
    defect = magnitude(verdict)
    results.append(dict(name=name, kind="placement", mutation=mutation, expected=expected_check,
                        failed=failures, defect_px=defect, result=result))
    record(f"{name}-rejected-for-expected-reason-only", failures == [expected_check], failed=failures)
    tolerance = HORIZONTAL_TOLERANCE_PX if "horizontal" in expected_check else OVERLAP_TOLERANCE_PX
    record(f"{name}-defect-outside-tolerance", defect > tolerance, defect_px=defect, tolerance_px=tolerance)


def run():
    global driver, desktop
    OUT.mkdir(parents=True, exist_ok=True)
    desktop = NativeDesktop()
    options = Options()
    options.binary_location = os.environ.get("IME_FIREFOX_BINARY", "/usr/bin/firefox")
    options.set_preference("layout.css.devPixelsPerPx", "1.0")
    options.set_preference("intl.locale.requested", "ja")
    options.set_preference("browser.shell.checkDefaultBrowser", False)
    driver = webdriver.Firefox(options=options, service=Service(str(ROOT / "work/native-ime/geckodriver"),
                                                                 log_output=str(OUT / "geckodriver.log")))
    # Fixed browser geometry for every matched pair: a 1600x1200 desktop leaves room for the
    # 424px native list below the composing line, so desktop-edge relocation cannot occur.
    driver.set_window_rect(x=40, y=40, width=1450, height=880)
    handles["application"] = driver.current_window_handle
    driver.switch_to.new_window("tab")
    handles["reference"] = driver.current_window_handle
    driver.get(REFERENCE_URL)
    calibration = calibrate()
    enter_application()
    scenarios, controls, errors = [], [], []
    for label, prefix, end in RUNS:
        isolated(errors, label, lambda: scenarios.append(matched_pair(label, prefix, end)))
    isolated(errors, "control-missing-and-foreign", lambda: negative_identity_controls(controls))
    # Deliberately defective proxy placements, confined to these runs: the textarea moves by
    # a fixed 60px to the right, or up by 1.25 of its own (item-matched) font size.
    isolated(errors, "control-horizontal", lambda: placement_control(
        controls, "control-horizontal-displacement-without-overlap",
        "textarea.global-textarea{margin-left:60px!important}",
        "no-additional-horizontal-displacement", lambda verdict: abs(verdict["displacement_px"])))
    isolated(errors, "control-overlap", lambda: placement_control(
        controls, "control-overlap-without-horizontal-displacement",
        "textarea.global-textarea{margin-top:-1.25em!important}",
        "application-panel-does-not-cover-composing-line",
        lambda verdict: min(verdict["covered"]["width"], verdict["covered"]["height"])))
    return dict(calibration=calibration, scenarios=scenarios, negative_controls=controls, scenario_errors=errors)


def isolated(errors, name, action):
    """Run one scenario; record its failure and restore a neutral input state for the next."""
    try:
        action()
    except Exception:
        errors.append(dict(scenario=name, error=traceback.format_exc()))
        assertions.append(dict(name=f"{name}-completed", passed=False))
        print(f"SCENARIO FAILED {name}\n{traceback.format_exc()[-3000:]}", flush=True)
        try:
            capture(f"{name}-failure")
            for _ in range(3):
                key("Escape")
            ime(False)
            tab("application")
            driver.execute_script("document.getElementById(arguments[0])?.remove()", NEGATIVE_STYLE_ID)
        except Exception:
            errors.append(dict(scenario=f"{name}-recovery", error=traceback.format_exc()))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    payload, failure = {}, None
    try:
        payload = run()
    except Exception:
        failure = traceback.format_exc()
        (OUT / "failure.txt").write_text(failure)
        print(failure, flush=True)
        try:
            capture("failure")
        except Exception:
            pass
    finally:
        identity_path = OUT / "application-identity.json"
        identity = json.loads(identity_path.read_text()) if identity_path.exists() else None
        passed = failure is None and bool(assertions) and all(a["passed"] for a in assertions) \
            and bool(identity and identity.get("verified"))
        save("results", dict(
            status="PASSED" if passed else "FAILED",
            failure=failure,
            application=identity,
            harness=dict(sha=subprocess.check_output(["git", "-C", str(HERE), "rev-parse", "HEAD"], text=True).strip(),
                         path=str(HERE.relative_to(ROOT))),
            run=dict(url=os.environ.get("IME_RUN_URL"), github_hosted=os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"),
            tolerances=dict(horizontal_px=HORIZONTAL_TOLERANCE_PX, overlap_px=OVERLAP_TOLERANCE_PX,
                            calibration_px=CALIBRATION_LIMIT_PX, room_below_margin_px=ROOM_BELOW_MARGIN_PX),
            assertions=assertions,
            **payload))
        save("commands", log)
        if driver:
            driver.quit()
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
