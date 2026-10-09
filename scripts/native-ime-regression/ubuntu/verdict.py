"""Automatic REQ-002/REQ-008 placement verdict for one matched observation pair.

All coordinates are X11 root (screen) pixels. Browser rectangles are converted with
mozInnerScreenX/Y at devicePixelRatio 1; the run proves that conversion against real
pointer events (see ``calibration_verdict``) before any placement verdict is evaluated.

The tolerances below are declared before any observation and are never derived from,
or widened by, the observations they judge.
"""

# Pointer-event calibration: a commanded X11 pointer position must be reported back by
# Firefox at the same CSS position. Pointer coordinates are integers, while
# mozInnerScreenX/Y and layout rectangles may carry sub-pixel fractions, so at most one
# pixel of disagreement is attributable to rounding.
CALIBRATION_LIMIT_PX = 1

# Horizontal anchor comparison. Each relative offset (panel left - first composing glyph)
# mixes one integer X11 panel coordinate with one sub-pixel layout coordinate, so each
# carries < 1px rounding. The difference of the application and reference offsets
# therefore carries < 2px. Calibration error is common to both observations (same
# Firefox window, same conversion), so it cancels in this difference.
HORIZONTAL_TOLERANCE_PX = 2

# Overlap between the panel and the displayed composing line, in absolute screen
# coordinates: < 1px layout/panel rounding plus <= CALIBRATION_LIMIT_PX conversion error.
OVERLAP_TOLERANCE_PX = 2

# Room required below the composing line so native desktop-edge relocation cannot occur.
ROOM_BELOW_MARGIN_PX = 8


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def calibration_verdict(points):
    """points: [{commanded:[x,y], reported:[x,y]}] in screen pixels."""
    errors = [max(abs(p["reported"][0] - p["commanded"][0]), abs(p["reported"][1] - p["commanded"][1]))
              for p in points]
    ok = len(points) >= 3 and max(errors) <= CALIBRATION_LIMIT_PX
    return dict(ok=ok, max_error_px=max(errors) if errors else None, limit_px=CALIBRATION_LIMIT_PX,
                points=len(points))


def _intersection(a, b):
    width = min(a["right"], b["right"]) - max(a["left"], b["left"])
    height = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
    return max(0.0, width), max(0.0, height)


def coverage(panel, line_rects):
    """Largest covered extent of any displayed composing-line rectangle by the panel."""
    worst = dict(width=0.0, height=0.0)
    for rect in line_rects:
        width, height = _intersection(panel, rect)
        if min(width, height) > min(worst["width"], worst["height"]):
            worst = dict(width=width, height=height)
    return worst


def panel_rect(window):
    return dict(left=window["x"], top=window["y"], right=window["x"] + window["width"],
                bottom=window["y"] + window["height"])


def placement_verdict(app, reference, screen_height):
    """Judge one application sample against its matched normal-textarea reference.

    Each sample: dict(text, reading, font, panel=X11 window record, glyph_left, line_rects).
    Returns a machine-readable verdict; ``ok`` is True only if every assertion passes.
    """
    checks = []

    def check(name, passed, **measured):
        checks.append(dict(name=name, passed=bool(passed), **measured))

    # Same reading and the same OS key script (convert, open the list, one Down). Mozc's own
    # learning may reorder candidates between the two runs, so the selected text is recorded
    # rather than required to be equal: the panel anchors at the focused first segment, which
    # starts at the composition start in both observations.
    check("matched-reference-reading", app["reading"] == reference["reading"]
          and app["keys"] == reference["keys"], app_text=app["text"], reference_text=reference["text"],
          app_reading=app["reading"], reference_reading=reference["reading"])
    check("matched-reference-font", app["font"] == reference["font"], app_font=app["font"],
          reference_font=reference["font"])
    check("matched-input-start", abs(app["glyph_left"] - reference["glyph_left"]) <= HORIZONTAL_TOLERANCE_PX
          and abs(app["line_rects"][0]["top"] - reference["line_rects"][0]["top"]) <= HORIZONTAL_TOLERANCE_PX,
          app_start=[app["glyph_left"], app["line_rects"][0]["top"]],
          reference_start=[reference["glyph_left"], reference["line_rects"][0]["top"]],
          tolerance_px=HORIZONTAL_TOLERANCE_PX)
    for label, sample in (("application", app), ("reference", reference)):
        panel = panel_rect(sample["panel"])
        line_bottom = max(r["bottom"] for r in sample["line_rects"])
        room = screen_height - line_bottom
        check(f"{label}-room-below", room >= sample["panel"]["height"] + ROOM_BELOW_MARGIN_PX,
              line_bottom=line_bottom, panel_height=sample["panel"]["height"], screen_height=screen_height)
        covered = coverage(panel, sample["line_rects"])
        check(f"{label}-panel-does-not-cover-composing-line",
              min(covered["width"], covered["height"]) <= OVERLAP_TOLERANCE_PX,
              covered_width=covered["width"], covered_height=covered["height"],
              tolerance_px=OVERLAP_TOLERANCE_PX, panel=panel, line_rects=sample["line_rects"])
    app_offset = app["panel"]["x"] - app["glyph_left"]
    reference_offset = reference["panel"]["x"] - reference["glyph_left"]
    displacement = app_offset - reference_offset
    check("no-additional-horizontal-displacement", abs(displacement) <= HORIZONTAL_TOLERANCE_PX,
          application_offset=app_offset, reference_offset=reference_offset,
          displacement_px=displacement, tolerance_px=HORIZONTAL_TOLERANCE_PX)
    return dict(ok=all(c["passed"] for c in checks), checks=checks, displacement_px=displacement,
                covered=coverage(panel_rect(app["panel"]), app["line_rects"]))


def failed_checks(verdict):
    return [c["name"] for c in verdict["checks"] if not c["passed"]]
