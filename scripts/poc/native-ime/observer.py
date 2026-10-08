"""Strict identity predicate, shared by live X11 observation and unit controls."""


def candidate_windows(windows, fcitx_pid):
    return [w for w in windows if
            w.get("name") == "Fcitx5 Input Window"
            and w.get("class") == ["fcitx", "fcitx"]
            and w.get("pid") == fcitx_pid
            and "_NET_WM_WINDOW_TYPE_COMBO" in w.get("types", [])
            and w.get("viewable") is True
            and w.get("width", 0) > 0 and w.get("height", 0) > 0]


def require_candidate(windows, fcitx_pid, composing, focused):
    if not composing or not focused:
        raise AssertionError("No active, trusted composition in the focused textarea")
    matches = candidate_windows(windows, fcitx_pid)
    if len(matches) != 1:
        raise AssertionError(f"Expected one native Fcitx5 candidate window; found {len(matches)}")
    return matches[0]


def compare_anchor(reference, actual, tolerance=4):
    """Offsets relative to the visible composing line, never absolute left edges."""
    assert reference["text"] == actual["text"], "Reference composition differs"
    assert reference["font"] == actual["font"], "Reference font differs"
    assert reference["selection"] == actual["selection"], "Candidate selection differs"
    assert actual["room_below"], "Desktop edge relocation invalidates comparison"
    assert actual["panel_top"] >= actual["line_bottom"], "Candidate panel covers composing line"
    expected = reference["panel_left"] - reference["line_left"]
    observed = actual["panel_left"] - actual["line_left"]
    assert abs(expected - observed) <= tolerance, f"Additional horizontal displacement: {observed - expected}px"
