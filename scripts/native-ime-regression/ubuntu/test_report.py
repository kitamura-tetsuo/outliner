"""The Ubuntu summary must require the live native selection controls."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("native_ime_report", Path(__file__).resolve().parents[1] / "report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)

PLACEMENT = ["control-missing-and-foreign", "control-horizontal-displacement-without-overlap",
             "control-overlap-without-horizontal-displacement"]
SELECTION = ["control-redraw-without-selection-change", "control-native-selection-preedit-mismatch",
             "control-native-selection-commit-mismatch"]


class NativeSelectionReport(unittest.TestCase):
    def result(self, controls):
        sample = dict(application=dict(text="候補続き", selection=dict(text="候補", segment=dict(index=0, start=0, end=2))),
                      verdict=dict(ok=True, displacement_px=0, covered=dict(width=0, height=0)))
        return dict(status="PASSED", application=dict(verified=True, sha="abc"),
                    assertions=[dict(name="native-selection", passed=True)],
                    scenarios=[dict(label=label + "-application", samples=[sample] * 3)
                               for label in ("empty-confirm", "empty-cancel", "after-text-confirm", "after-text-cancel")],
                    negative_controls=[dict(name=name, failed=["expected-check"], rejected=True) for name in controls])

    def summarize(self, result):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "results.json").write_text(json.dumps(result))
            return report.ubuntu(directory)

    def test_old_placement_only_evidence_cannot_pass(self):
        ok, _, _ = self.summarize(self.result(PLACEMENT))
        self.assertFalse(ok)

    def test_every_selection_control_is_required(self):
        for missing in SELECTION:
            with self.subTest(missing=missing):
                ok, _, _ = self.summarize(self.result(PLACEMENT + [c for c in SELECTION if c != missing]))
                self.assertFalse(ok)

    def test_complete_evidence_reports_native_text_and_segment(self):
        ok, _, lines = self.summarize(self.result(PLACEMENT + SELECTION))
        self.assertTrue(ok)
        text = "\n".join(lines)
        self.assertIn("`候補`", text)
        self.assertNotIn("`候補続き`", text)
        self.assertIn("Focused segment", text)
        self.assertIn("'start': 0, 'end': 2", text)


if __name__ == "__main__":
    unittest.main()
