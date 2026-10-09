"""Offline controls for the placement verdict. Live controls run in regression.py."""
import unittest

from verdict import (CALIBRATION_LIMIT_PX, HORIZONTAL_TOLERANCE_PX, OVERLAP_TOLERANCE_PX, calibration_verdict,
                     failed_checks, placement_verdict, utf16_length)


def sample(glyph_left=200.0, top=300.0, panel_x=None, panel_y=None, text="亜々", reading="ああ"):
    line = dict(left=glyph_left, right=glyph_left + 48, top=top, bottom=top + 23)
    return dict(text=text, reading=reading, keys=["space", "space", "Down"], font="400 16px \"Noto Sans CJK JP\"", glyph_left=glyph_left,
                line_rects=[line],
                panel=dict(x=glyph_left - 12 if panel_x is None else panel_x,
                           y=top + 27 if panel_y is None else panel_y, width=254, height=424))


class PlacementVerdict(unittest.TestCase):
    def test_matched_placement_passes(self):
        verdict = placement_verdict(sample(), sample(), 1200)
        self.assertTrue(verdict["ok"], failed_checks(verdict))
        self.assertEqual(verdict["displacement_px"], 0)

    def test_rounding_inside_tolerance_passes(self):
        app = sample(glyph_left=200.4, panel_x=188 + HORIZONTAL_TOLERANCE_PX)
        verdict = placement_verdict(app, sample(), 1200)
        self.assertTrue(verdict["ok"], failed_checks(verdict))

    def test_horizontal_displacement_without_overlap_fails(self):
        app = sample(panel_x=188 + 60)
        verdict = placement_verdict(app, sample(), 1200)
        self.assertEqual(failed_checks(verdict), ["no-additional-horizontal-displacement"])

    def test_overlap_without_displacement_fails(self):
        app = sample(panel_y=300 + 8)
        verdict = placement_verdict(app, sample(), 1200)
        self.assertEqual(failed_checks(verdict), ["application-panel-does-not-cover-composing-line"])

    def test_touching_edge_is_not_coverage(self):
        app = sample(panel_y=300 + 23 - OVERLAP_TOLERANCE_PX)
        self.assertTrue(placement_verdict(app, sample(), 1200)["ok"])

    def test_missing_room_below_invalidates_comparison(self):
        app = sample(top=900)
        ref = sample(top=900)
        verdict = placement_verdict(app, ref, 1200)
        self.assertIn("application-room-below", failed_checks(verdict))

    def test_mismatched_reference_is_rejected(self):
        for ref in [sample(reading="いい"), dict(sample(), keys=["space", "space"]), dict(sample(), font="16px serif"),
                    sample(glyph_left=260, panel_x=248)]:
            self.assertFalse(placement_verdict(sample(), ref, 1200)["ok"])

    def test_learned_candidate_order_is_recorded_not_required(self):
        verdict = placement_verdict(sample(text="ああ"), sample(text="あゝ"), 1200)
        self.assertTrue(verdict["ok"], failed_checks(verdict))


class Calibration(unittest.TestCase):
    def points(self, error):
        return [dict(commanded=[x, 100], reported=[x + error, 100]) for x in (100, 400, 800)]

    def test_exact_and_rounding(self):
        self.assertTrue(calibration_verdict(self.points(0))["ok"])
        self.assertTrue(calibration_verdict(self.points(CALIBRATION_LIMIT_PX))["ok"])

    def test_offset_or_too_few_points(self):
        self.assertFalse(calibration_verdict(self.points(CALIBRATION_LIMIT_PX + 1))["ok"])
        self.assertFalse(calibration_verdict(self.points(0)[:2])["ok"])


class Utf16(unittest.TestCase):
    def test_astral(self):
        self.assertEqual(utf16_length("日本"), 2)
        self.assertEqual(utf16_length("🗾"), 2)


if __name__ == "__main__":
    unittest.main()
