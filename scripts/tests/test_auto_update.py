import json
import os
import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import dev_workflow


class DummyCompletedProcess:
    def __init__(self, stdout="", stderr=""):
        self.stdout = stdout
        self.stderr = stderr


class AutoUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.state_path = Path(self.temp_dir.name) / "state.json"
        self.now = datetime(2024, 1, 1, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _make_runner(self, calls, *, stdout="done", stderr="", fail=False):
        def _runner(command, **kwargs):
            calls.append(command)
            if fail:
                raise subprocess.CalledProcessError(
                    returncode=1,
                    cmd=command,
                    output=stdout,
                    stderr=stderr,
                )
            return DummyCompletedProcess(stdout=stdout, stderr=stderr)

        return _runner

    def _read_state(self):
        if not self.state_path.exists():
            return None
        with self.state_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def test_runs_update_when_state_missing(self):
        calls = []
        runner = self._make_runner(calls, stdout="updated")
        result = dev_workflow.maybe_auto_update(
            state_path=self.state_path,
            now=self.now,
            interval_hours=24,
            run_command_func=runner,
        )
        self.assertTrue(result)
        self.assertEqual(len(calls), 1)
        state = self._read_state()
        self.assertIsNotNone(state)
        self.assertEqual(state["last_result"], "success")
        self.assertIn("last_check", state)

    def test_skips_when_recent(self):
        initial_calls = []
        initial_runner = self._make_runner(initial_calls)
        dev_workflow.maybe_auto_update(
            state_path=self.state_path,
            now=self.now,
            interval_hours=24,
            run_command_func=initial_runner,
        )
        subsequent_calls = []
        subsequent_runner = self._make_runner(subsequent_calls)
        dev_workflow.maybe_auto_update(
            state_path=self.state_path,
            now=self.now + timedelta(hours=1),
            interval_hours=24,
            run_command_func=subsequent_runner,
        )
        self.assertEqual(len(initial_calls), 1)
        self.assertEqual(len(subsequent_calls), 0)

    def test_force_update_ignores_interval(self):
        initial_calls = []
        initial_runner = self._make_runner(initial_calls)
        dev_workflow.maybe_auto_update(
            state_path=self.state_path,
            now=self.now,
            interval_hours=24,
            run_command_func=initial_runner,
        )
        forced_calls = []
        forced_runner = self._make_runner(forced_calls)
        with patch.dict(os.environ, {"AUTO_CODER_FORCE_UPDATE": "1"}, clear=False):
            dev_workflow.maybe_auto_update(
                state_path=self.state_path,
                now=self.now + timedelta(minutes=10),
                interval_hours=24,
                run_command_func=forced_runner,
            )
        self.assertEqual(len(forced_calls), 1)

    def test_disable_auto_update_prevents_execution(self):
        calls = []
        runner = self._make_runner(calls)
        with patch.dict(os.environ, {"AUTO_CODER_DISABLE_AUTO_UPDATE": "true"}, clear=False):
            result = dev_workflow.maybe_auto_update(
                state_path=self.state_path,
                now=self.now,
                interval_hours=24,
                run_command_func=runner,
            )
        self.assertFalse(result)
        self.assertEqual(len(calls), 0)
        self.assertIsNone(self._read_state())

    def test_failure_is_recorded(self):
        calls = []
        runner = self._make_runner(calls, fail=True, stdout="", stderr="boom")
        result = dev_workflow.maybe_auto_update(
            state_path=self.state_path,
            now=self.now,
            interval_hours=24,
            run_command_func=runner,
        )
        self.assertFalse(result)
        self.assertEqual(len(calls), 1)
        state = self._read_state()
        self.assertEqual(state["last_result"], "failed")


if __name__ == "__main__":
    unittest.main()
