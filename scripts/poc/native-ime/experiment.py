"""Graphical stock Firefox, Selenium reads, XTest input, real Fcitx5/X11 evidence."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import traceback
from PIL import Image

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

from observer import candidate_windows, compare_anchor, require_candidate
from x11 import Desktop

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
STAGE = os.environ["IME_STAGE"]
OUT = Path(os.environ["IME_ARTIFACTS"]) / STAGE
PID = int(os.environ["IME_FCITX_PID"])
RESULTS = {letter: {"status": "PARTIAL", "reason": "Not demonstrated"} for letter in "ABCDEFGH"}
RESULTS["H"] = {"status": "PARTIAL", "reason": "No controlled before/after regression reproduction"}
driver = None
desktop = None
ACTIVE_CAPABILITY = "A"


def save(name, value):
    (OUT / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2))


def command(*args):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
    with (OUT / "commands.log").open("a") as stream:
        stream.write(f"{time.monotonic():.6f} {args!r}\n{result.stdout}\n")
    return result.stdout.strip()


def wait(predicate, description, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = predicate()
        if result:
            return result
        time.sleep(.1)
    raise AssertionError(f"Timed out: {description}")


def state():
    return driver.execute_script("return {...window.__nativeIme, focused: document.hasFocus() && document.activeElement === arguments[0], value: arguments[0].value}", textarea)


def key(name):
    command("xdotool", "key", "--clearmodifiers", name)


def type_text(text):
    command("xdotool", "type", "--clearmodifiers", "--delay", "100", text)


def click(element):
    point = driver.execute_script("const r=arguments[0].getBoundingClientRect(); return [mozInnerScreenX+r.x+r.width/2, mozInnerScreenY+r.y+r.height/2, devicePixelRatio]", element)
    assert point[2] == 1, "CSS/root conversion only established at scale 1"
    command("xdotool", "mousemove", str(round(point[0])), str(round(point[1])), "click", "1")


def capture(label):
    windows = desktop.windows()
    browser = state()
    save(label, dict(monotonic=time.monotonic(), windows=windows, browser=browser,
                     screen=driver.execute_script("return {x:mozInnerScreenX,y:mozInnerScreenY,dpr:devicePixelRatio,width:screen.width,height:screen.height}")))
    desktop.screenshot(str(OUT / f"{label}.png"))
    command("xwininfo", "-root", "-tree")
    return windows, browser


def candidate(label):
    wait(lambda: candidate_windows(desktop.windows(), PID), "native candidate becomes viewable")
    windows, browser = capture(label)
    panel = require_candidate(windows, PID, browser["composing"], browser["focused"])
    shot = Image.open(OUT / f"{label}.png")
    x, y, width, height = (panel[k] for k in ["x", "y", "width", "height"])
    assert x >= 0 and y >= 0 and x + width <= shot.width and y + height <= shot.height, "Candidate outside captured desktop"
    crop = shot.crop((x, y, x + width, y + height))
    assert len(crop.getcolors(width * height) or []) > 8, "Mapped window has no observable rendered candidate pixels"
    crop.save(OUT / f"{label}-window-{panel['id']}.png")
    command("xprop", "-id", str(panel["id"]))
    return panel


def absent(label):
    wait(lambda: not candidate_windows(desktop.windows(), PID), "candidate unmaps")
    # Observe over a bounded interval, not just one lucky sample.
    for _ in range(5):
        assert not candidate_windows(desktop.windows(), PID), "Candidate remapped unexpectedly"
        time.sleep(.1)
    return capture(label)


def rejected(windows, composing=True, focused=True):
    try:
        require_candidate(windows, PID, composing, focused)
    except AssertionError:
        return
    raise AssertionError("Negative control incorrectly passed")


def verify_gtk():
    global ACTIVE_CAPABILITY
    ACTIVE_CAPABILITY = "B"
    info = command("gdbus", "call", "--session", "--dest", "org.fcitx.Fcitx5", "--object-path", "/controller",
                   "--method", "org.fcitx.Fcitx.Controller1.DebugInfo")
    (OUT / "focused-context.txt").write_text(info)
    assert re.search(r"program:[^\\\s]*firefox[^\\\s]* frontend:dbus[^\\\n]*focus:1", info, re.I), "Focused Firefox D-Bus input context unverified"
    maps = []
    for process in Path("/proc").iterdir():
        if not process.name.isdigit():
            continue
        try:
            exe = (process / "exe").resolve().name
            if "firefox" not in exe:
                continue
            lines = (process / "maps").read_text().splitlines()
            maps.extend(f"pid={process.name} {line}" for line in lines if "im-fcitx" in line)
        except (PermissionError, FileNotFoundError, ProcessLookupError):
            continue
    (OUT / "firefox-gtk-module-maps.txt").write_text("\n".join(maps))
    assert maps, "Fcitx GTK module not observed in Firefox process maps"
    trace = (OUT / "dbus-input.log").read_text()
    assert "CreateInputContext" in trace and "ProcessKeyEvent" in trace, "Native input-context/key traffic missing"
    assert state()["composing"], "Inline preedit composition is not active"
    RESULTS["B"] = dict(status="PROVEN", reason="Focused Firefox D-Bus context, loaded GTK module, real key traffic and trusted preedit", evidence=["focused-context.txt", "firefox-gtk-module-maps.txt", "dbus-input.log"])


def begin(text, label):
    wait(lambda: state()["focused"], "actual foreground textarea focus")
    command("fcitx5-remote", "-s", "mozc")
    command("fcitx5-remote", "-o")
    assert command("fcitx5-remote", "-n") == "mozc"
    type_text(text)
    wait(lambda: state()["composing"] and state()["preedit"], "trusted Japanese preedit")
    capture(label)


def exercise():
    global ACTIVE_CAPABILITY
    ACTIVE_CAPABILITY = "C"
    before = state()["value"]
    begin("nihonn", "short-preedit")
    assert state()["preedit"] == "にほん", f"Unexpected Mozc preedit: {state()['preedit']}"
    verify_gtk()
    ACTIVE_CAPABILITY = "C"
    type_text("go")
    wait(lambda: state()["preedit"] == "にほんご", "composition extension")
    capture("extended-preedit")
    key("space")
    key("space")
    ACTIVE_CAPABILITY = "D"
    first = candidate("candidate-open")
    previous = state()["preedit"]
    key("Down")
    wait(lambda: state()["preedit"] != previous, "candidate selection changes inline preedit")
    second = candidate("candidate-next")
    assert first["id"] == second["id"], "Candidate identity changed across selection"
    ACTIVE_CAPABILITY = "C"
    selected = state()["preedit"]
    key("Return")
    wait(lambda: not state()["composing"], "composition confirms")
    assert state()["value"] == before + selected, "Confirmed textarea value differs from selected candidate"
    absent("confirmed")
    begin("nihonn", "second-composition")
    key("space")
    key("space")
    candidate("second-candidates")
    # Mozc first Escape exits conversion, second cancels the original preedit.
    key("Escape")
    key("Escape")
    wait(lambda: not state()["composing"], "composition cancels")
    assert state()["value"] == before + selected, "Cancellation changed textarea value"
    absent("cancelled")
    RESULTS["C"] = dict(status="PROVEN", reason="XTest typing extends kana; candidate Down changes preedit; Enter value and second composition cancellation verified")
    RESULTS["D"] = dict(status="PROVEN", reason="Exactly one viewable Fcitx5 Input Window, matching process PID, class and source-defined Classic UI type, correlated with trusted focused composition and screenshots")
    RESULTS["E"] = dict(status="PROVEN", reason="Root coordinates, dimensions and viewable state recorded; same panel lifecycle observed across selection, confirmation and cancellation", selection_geometry=[first, second])


def controls():
    global ACTIVE_CAPABILITY
    ACTIVE_CAPABILITY = "F"
    command("fcitx5-remote", "-c")
    before = state()["value"]
    type_text("latin")
    assert state()["value"] == before + "latin" and not state()["composing"]
    windows, browser = absent("negative-latin")
    rejected(windows, browser["composing"], browser["focused"])
    rejected(windows)  # Force active flags: missing real panel still cannot pass.
    foreign = desktop.unrelated_window()
    try:
        windows, _ = capture("negative-foreign-window")
        assert any(w["id"] == foreign.id and w["viewable"] for w in windows)
        rejected(windows)  # Plausible title, class, type and geometry; foreign owner.
    finally:
        foreign.destroy()
        desktop.display.sync()
    # The foreign popup is unmanaged, like the real Classic UI panel, so it must
    # not steal OS focus. Keep an explicit user-like click before resuming input.
    click(textarea)
    wait(lambda: state()["focused"], "OS click restores Firefox focus after foreign-window control")
    RESULTS["F"] = dict(status="PROVEN", reason="Live Latin input, missing panel with forced active flags, and real foreign-owner X11 window all rejected")


def movement_control(kind="input"):
    global ACTIVE_CAPABILITY
    ACTIVE_CAPABILITY = "E"
    command("fcitx5-remote", "-c")
    key("ctrl+a")
    key("BackSpace")
    original = driver.get_window_rect()
    original_style = driver.execute_script("return {marginLeft:arguments[0].style.marginLeft,marginTop:arguments[0].style.marginTop}", textarea)
    positions = []
    for index in range(2):
        begin("nihonn", f"movement-{index}-preedit")
        key("space")
        key("space")
        panel = candidate(f"movement-{index}-candidate")
        origin = driver.execute_script("const r=arguments[0].getBoundingClientRect(); return [mozInnerScreenX+r.x,mozInnerScreenY+r.y]", textarea)
        positions.append(dict(panel=panel, origin=origin))
        key("Escape")
        key("Escape")
        wait(lambda: not state()["composing"], "movement-control cancellation")
        absent(f"movement-{index}-cancelled")
        if index == 0:
            if kind == "window":
                window = command("xdotool", "getactivewindow")
                command("xdotool", "windowmove", window, str(original["x"] + 100), str(original["y"] + 60))
                wait(lambda: driver.get_window_rect()["x"] != original["x"], "OS Firefox window movement")
            else:
                # Move only the ordinary reference fixture. Never patch Outliner.
                driver.execute_script("""
                  const e=arguments[0],s=getComputedStyle(e);
                  e.style.marginLeft=(parseFloat(s.marginLeft)+100)+'px';
                  e.style.marginTop=(parseFloat(s.marginTop)+60)+'px';
                """, textarea)
                click(textarea)
    first, second = positions
    save(f"{kind}-movement-control", dict(kind=kind, observations=positions))
    assert first["panel"]["id"] == second["panel"]["id"]
    for axis, offset in [("x", 0), ("y", 1)]:
        delta = second["origin"][offset] - first["origin"][offset]
        assert abs(delta) >= 50, "Reference input did not move on the desktop"
        assert abs(second["panel"][axis] - first["panel"][axis] - delta) <= 4, "Candidate did not follow the native reference input"
    if kind == "window":
        driver.set_window_rect(**original)
    else:
        driver.execute_script("Object.assign(arguments[0].style,arguments[1])", textarea, original_style)
    RESULTS["E"]["reason"] += f"; candidate follows real {kind} movement within 4px"


def placement_samples(prefix):
    samples = []
    command("fcitx5-remote", "-c")
    if prefix == "outliner":
        # Outliner's Ctrl+A can select the document; select only the current line.
        key("Home")
        key("shift+End")
    else:
        key("ctrl+a")
    key("BackSpace")
    for count in [5, 40]:
        begin("a" * count, f"{prefix}-{count}-preedit")
        key("space")
        key("space")
        panel = candidate(f"{prefix}-{count}-candidates")
        layout = driver.execute_script("""
          const r=arguments[0].getBoundingClientRect(),s=getComputedStyle(arguments[0]);
          return {font:s.font, line_left:mozInnerScreenX+r.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),
            line_top:mozInnerScreenY+r.top+parseFloat(s.paddingTop)+parseFloat(s.borderTopWidth),
            line_height:parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.2,
            screen_height:screen.height, inner_x:mozInnerScreenX,inner_y:mozInnerScreenY};
        """, textarea)
        # For Outliner the visible composing line is the rendered item, not the proxy.
        if prefix == "outliner":
            visible = driver.execute_script("""
              const c=document.querySelector('.editor-overlay .cursor.active');
              if(!c) throw Error('Visible rendered caret unavailable');
              const r=c.getBoundingClientRect();
              return {top:mozInnerScreenY+r.top,bottom:mozInnerScreenY+r.bottom};
            """)
            line_bottom = visible["bottom"]
        else:
            line_bottom = layout["line_top"] + layout["line_height"]
        selected_preedit = state()["preedit"]
        samples.append(dict(layout, text=selected_preedit,
                            selection={"os_keys": ["space", "space"], "selected_preedit": selected_preedit},
                            panel_left=panel["x"], panel_top=panel["y"],
                            line_bottom=line_bottom,
                            room_below=line_bottom + panel["height"] + 20 < layout["screen_height"]))
        key("Escape")
        key("Escape")
        wait(lambda: not state()["composing"], "placement composition cancelled")
        absent(f"{prefix}-{count}-cancelled")
    save(f"{prefix}-placements", samples)
    return samples


def attach():
    driver.execute_script((HERE / "browser_probe.js").read_text())


def run():
    global driver, desktop, textarea, ACTIVE_CAPABILITY
    save("environment", {k: os.environ.get(k) for k in ["DISPLAY", "XDG_SESSION_TYPE", "GDK_BACKEND", "MOZ_ENABLE_WAYLAND", "GTK_IM_MODULE", "XMODIFIERS", "RUNNER_ENVIRONMENT", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]})
    desktop = Desktop()
    options = Options()
    options.binary_location = os.environ.get("IME_FIREFOX_BINARY", "/usr/bin/firefox")
    options.set_preference("layout.css.devPixelsPerPx", "1.0")
    options.set_preference("intl.locale.requested", "ja")
    options.set_preference("browser.shell.checkDefaultBrowser", False)
    driver = webdriver.Firefox(options=options, service=Service(str(ROOT / "work/native-ime/geckodriver"), log_output=str(OUT / "geckodriver.log")))
    driver.set_window_rect(x=40, y=40, width=1450, height=880)
    driver.get("http://127.0.0.1:8765/fixture.html")
    attach()
    textarea = driver.find_element(By.ID, "reference")
    click(textarea)
    wait(lambda: state()["focused"], "OS click focuses reference")
    RESULTS["A"] = dict(status="PROVEN", reason="Stock graphical Firefox has a real X11 window and visible textarea", version=driver.capabilities.get("browserVersion"))
    exercise()
    controls()
    movement_control("window" if STAGE == "window-movement" else "input")
    placement_samples("reference")
    if STAGE == "outliner":
        ACTIVE_CAPABILITY = "G"
        # The existing demo route creates the real editor and seeds through its backend.
        # No input replacement, focus(), store mutation, CSS patch or synthetic event.
        driver.get("http://127.0.0.1:7090/demo/Welcome")
        attach()
        items = wait(lambda: (found if len(found := driver.find_elements(By.CSS_SELECTOR, ".outliner-item .item-content")) >= 2 else False), "Outliner demo body item", 90)
        item = items[1]  # First ordinary body item, after the page title.
        original_text = item.text.strip()
        click(item)
        textarea = wait(lambda: driver.find_elements(By.CSS_SELECTOR, "textarea.global-textarea"), "production textarea")[0]
        wait(lambda: state()["focused"], "normal editor focus")
        command("fcitx5-remote", "-c")
        key("End")
        wait(lambda: state()["value"] == original_text, "normal End handling synchronizes the production mirror")
        # Use an empty new item, created by the editor's ordinary Enter handling.
        key("Return")
        wait(lambda: state()["value"] == "", "new empty production item")
        exercise()
        RESULTS["G"] = dict(status="PROVEN", reason="Normal OS item click and Enter created/focused the app-owned global-textarea; same native composition, selection and panel lifecycle verified")
        actual = placement_samples("outliner")
        ACTIVE_CAPABILITY = "H"
        driver.get("http://127.0.0.1:8765/fixture.html")
        attach()
        textarea = driver.find_element(By.ID, "reference")
        match = actual[0]
        driver.execute_script("""
          const e=arguments[0],m=arguments[1];
          Object.assign(e.style,{position:'absolute',margin:'0',padding:'0',border:'0',
            font:m.font,left:(m.line_left-mozInnerScreenX)+'px',top:(m.line_top-mozInnerScreenY)+'px'});
        """, textarea, match)
        click(textarea)
        reference = placement_samples("matched-reference")
        for ref, app in zip(reference, actual):
            assert abs(ref["line_left"] - app["line_left"]) <= 1, "Visible input start mismatch"
            assert abs(ref["line_top"] - app["line_top"]) <= 1, "Visible input start mismatch"
            compare_anchor(ref, app)
        save("placement-comparison", {"status": "passed", "reference": reference, "outliner": actual,
                                      "limitation": "Original defect not proven until controlled before/after reproduction"})


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    failure = None
    try:
        run()
    except Exception:
        failure = traceback.format_exc()
        (OUT / "failure.txt").write_text(failure)
        print(failure, flush=True)
        RESULTS[ACTIVE_CAPABILITY] = dict(status="FAILED", reason="Experiment assertion or operation failed; see failure.txt")
        try:
            if driver and desktop:
                capture("failure")
        except Exception:
            (OUT / "failure-capture.txt").write_text(traceback.format_exc())
    finally:
        # Local runs cannot prove any capability on GitHub-hosted Ubuntu.
        authoritative = os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
        if not authoritative:
            for entry in RESULTS.values():
                if entry["status"] == "PROVEN":
                    entry["status"] = "PARTIAL"
                    entry["reason"] += "; not a GitHub-hosted execution"
        save("results", dict(capabilities=RESULTS, authoritative=authoritative, failure=failure,
                             tested_sha=subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()))
        if driver:
            driver.quit()
    raise SystemExit(1 if failure else 0)
