"""Predicate tests use records, not claims about real native IME activity."""
import unittest
from observer import compare_anchor, require_candidate


class OracleControls(unittest.TestCase):
    def record(self):
        return dict(name="Fcitx5 Input Window", **{"class": ["fcitx", "fcitx"]},
                    pid=42, types=["_NET_WM_WINDOW_TYPE_COMBO"], viewable=True,
                    width=250, height=160)

    def test_correct_identity(self):
        self.assertEqual(require_candidate([self.record()], 42, True, True)["pid"], 42)

    def test_missing_and_duplicate(self):
        for records in [[], [self.record(), self.record()]]:
            with self.assertRaises(AssertionError):
                require_candidate(records, 42, True, True)

    def test_foreign_hidden_and_misidentified(self):
        for field, value in [("pid", 99), ("name", "unrelated"), ("class", ["xmessage"]),
                             ("types", []), ("viewable", False), ("width", 0)]:
            record = self.record()
            record[field] = value
            with self.assertRaises(AssertionError):
                require_candidate([record], 42, True, True)

    def test_inactive_and_unfocused(self):
        for composing, focused in [(False, True), (True, False)]:
            with self.assertRaises(AssertionError):
                require_candidate([self.record()], 42, composing, focused)

    def test_relative_anchor_and_displacement(self):
        ref = dict(text="にほん", font="24px sans-serif", selection=1, panel_left=130,
                   line_left=100, panel_top=240, line_bottom=220, room_below=True)
        actual = dict(ref, panel_left=430, line_left=400)
        compare_anchor(ref, actual)
        for bad in [dict(actual, panel_left=450), dict(actual, panel_top=210),
                    dict(actual, font="different"), dict(actual, room_below=False)]:
            with self.assertRaises(AssertionError):
                compare_anchor(ref, bad)


if __name__ == "__main__":
    unittest.main()
