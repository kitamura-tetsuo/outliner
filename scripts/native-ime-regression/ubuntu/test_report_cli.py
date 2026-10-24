"""The Windows report CLI must preserve a failed verdict when setup leaves no output directory."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPORT = Path(__file__).resolve().parents[1] / "report.py"
ACTIONS = ("production-1-confirm", "production-1-cancel",
           "production-2-confirm", "production-2-cancel")
CONTROL_COUNTS = {"production-1-confirm": 3, "production-1-cancel": 1,
                  "production-2-confirm": 4, "production-2-cancel": 1}


def complete_windows_evidence(directory):
    sha = "abc123"
    (directory / "application-identity.json").write_text(
        json.dumps({"verified": True, "sha": sha}))
    (directory / "application-revision.json").write_text(json.dumps({
        "applicationSha": sha, "applicationImageLabel": sha, "harnessSha": sha}))
    (directory / "results.json").write_text(json.dumps(
        {"capabilities": {key: {"status": "PROVEN"} for key in "ABCDEFGHIJK"}}))
    (directory / "production-scenarios.json").write_text(json.dumps(
        [{"baseline": {"action": action}, "result": "PROVEN"} for action in ACTIONS]))
    for action, count in CONTROL_COUNTS.items():
        for index in range(count):
            (directory / f"{action}-control-{index}.json").write_text(
                json.dumps({"rejected": True}))


def run_cli(directory, summary_path):
    environment = dict(os.environ, GITHUB_STEP_SUMMARY=str(summary_path))
    return subprocess.run([sys.executable, str(REPORT), "windows", str(directory)],
                          capture_output=True, text=True, env=environment)


class WindowsReportCliOutputDirectory(unittest.TestCase):
    def test_absent_nested_directory_still_reports_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "nested" / "artifacts" / "windows-native-ime"
            summary = Path(temporary) / "summary.md"
            summary.write_text("")
            self.assertFalse(directory.exists())
            completed = run_cli(directory, summary)
            self.assertNotEqual(completed.returncode, 0)
            self.assertNotIn("FileNotFoundError", completed.stderr)
            self.assertNotIn("No such file or directory", completed.stderr)
            verdict = json.loads((directory / "verdict.json").read_text(encoding="utf-8"))
            self.assertFalse(verdict["ok"])
            self.assertEqual(verdict["platform"], "windows")
            report = (directory / "report.md").read_text(encoding="utf-8")
            self.assertIn("FAILED", report)
            self.assertEqual(verdict.get("scenarios"), {})
            self.assertEqual(verdict.get("capabilities"), {})
            self.assertEqual(verdict.get("controls"), {})
            self.assertNotIn("| PROVEN |", report)
            for action, count in CONTROL_COUNTS.items():
                self.assertIn(f"| {action} | NOT RUN | 0/{count} |", report)
            summary_text = summary.read_text(encoding="utf-8")
            self.assertIn("FAILED", summary_text)
            self.assertNotIn("| PROVEN |", summary_text)
            for action, count in CONTROL_COUNTS.items():
                self.assertIn(f"| {action} | NOT RUN | 0/{count} |", summary_text)

    def test_existing_directory_with_partial_evidence_stays_failed_and_untouched(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "artifacts" / "windows-native-ime"
            directory.mkdir(parents=True)
            sentinel = directory / "probe-sentinel.txt"
            sentinel.write_text("untouched")
            (directory / "results.json").write_text(json.dumps({"capabilities": {}}))
            summary = Path(temporary) / "summary.md"
            summary.write_text("")
            completed = run_cli(directory, summary)
            self.assertNotEqual(completed.returncode, 0)
            verdict = json.loads((directory / "verdict.json").read_text(encoding="utf-8"))
            self.assertFalse(verdict["ok"])
            self.assertEqual(sentinel.read_text(), "untouched")
            self.assertIn("FAILED", (directory / "report.md").read_text(encoding="utf-8"))

    def test_complete_evidence_still_passes(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "artifacts" / "windows-native-ime"
            directory.mkdir(parents=True)
            complete_windows_evidence(directory)
            summary = Path(temporary) / "summary.md"
            summary.write_text("")
            completed = run_cli(directory, summary)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            verdict = json.loads((directory / "verdict.json").read_text(encoding="utf-8"))
            self.assertTrue(verdict["ok"])
            self.assertIn("PASSED", (directory / "report.md").read_text(encoding="utf-8"))

    def test_zero_scenarios_cannot_report_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "artifacts" / "windows-native-ime"
            directory.mkdir(parents=True)
            complete_windows_evidence(directory)
            (directory / "production-scenarios.json").write_text("[]")
            summary = Path(temporary) / "summary.md"
            summary.write_text("")
            completed = run_cli(directory, summary)
            self.assertNotEqual(completed.returncode, 0)
            verdict = json.loads((directory / "verdict.json").read_text(encoding="utf-8"))
            self.assertFalse(verdict["ok"])


if __name__ == "__main__":
    unittest.main()
