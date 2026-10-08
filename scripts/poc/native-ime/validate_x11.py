"""Live missing/foreign X11 controls; these alone do not prove native IME."""
import json
import os
from pathlib import Path
from observer import require_candidate
from x11 import Desktop

out = Path(os.environ["IME_ARTIFACTS"]) / os.environ["IME_STAGE"]
desktop = Desktop()
records = []
foreign = desktop.unrelated_window()
try:
    windows = desktop.windows()
    record = next(w for w in windows if w["id"] == foreign.id)
    assert record["viewable"] and record["x"] == 1300 and record["y"] == 100
    assert record["width"] == 200 and record["height"] == 150
    for observed, label in [([], "missing"), (windows, "foreign owner")]:
        try:
            # No Fcitx process yet: no owner can have PID -1. Active flags are
            # deliberately forced true so identity failure cannot depend on DOM state.
            require_candidate(observed, -1, True, True)
        except AssertionError:
            records.append({"control": label, "rejected": True})
        else:
            raise AssertionError(f"False positive: {label}")
    desktop.screenshot(str(out / "observer-foreign-control.png"))
    (out / "observer-live-controls.json").write_text(json.dumps(dict(windows=windows, controls=records), indent=2))
finally:
    foreign.destroy()
    desktop.display.sync()
