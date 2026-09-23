"""Exercise lifecycle failure reporting with fake subprocesses; no Docker or Maven."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

RUNNER = Path(__file__).resolve().parents[1] / "test-review-pending-summary.py"
spec = importlib.util.spec_from_file_location("review_pending_runner", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class LifecycleTest(unittest.TestCase):
    def exercise(self, failure=None):
        commands = []
        with tempfile.TemporaryDirectory() as output:
            def execute(command, **options):
                shell = command[-1]
                sql = options.get("input") or ""
                commands.append(sql or shell)
                if "select count(*) from pg_database" in sql:
                    response = "1" if failure == "existing" else "0"
                elif "CREATE DATABASE" in sql:
                    if failure == "create":
                        return subprocess.CompletedProcess(command, 1, "", "sensitive")
                    response = ""
                elif "pg_dump" in shell:
                    if failure == "schema":
                        return subprocess.CompletedProcess(command, 1, "", "sensitive")
                    response = "-- synthetic schema stub"
                elif "DROP DATABASE" in sql:
                    if failure == "drop":
                        return subprocess.CompletedProcess(command, 1, "", "sensitive")
                    response = ""
                elif "printf" in shell:
                    response = "task-user\0synthetic-secret\0"
                else:
                    response = ""
                return subprocess.CompletedProcess(command, 0, response, "")

            class Process:
                stdout = ["fake selected tests only\n"]
                def wait(self):
                    return 1 if failure == "maven" else 0

            with patch.object(runner.subprocess, "run", side_effect=execute), \
                 patch.object(runner.subprocess, "Popen", return_value=Process()), \
                 patch.object(runner.tempfile, "mkdtemp", return_value=output), \
                 patch("sys.argv", [str(RUNNER), "--maven", "fake-maven"]), \
                 contextlib.redirect_stdout(io.StringIO()):
                code = runner.main()
            state_text = (Path(output) / "database-lifecycle.json").read_text()
            self.assertNotIn("synthetic-secret", state_text)
            self.assertNotIn("task-user", state_text)
            return code, json.loads(state_text), commands

    def test_existing_database_is_never_created_or_dropped(self):
        code, state, commands = self.exercise("existing")
        self.assertEqual(1, code)
        self.assertFalse(state["created"])
        self.assertFalse(any("CREATE DATABASE" in item or "DROP DATABASE" in item for item in commands))

    def test_creation_failure_does_not_drop_unowned_database(self):
        code, state, commands = self.exercise("create")
        self.assertEqual(1, code)
        self.assertEqual("create_database", state["failure_stage"])
        self.assertFalse(any("DROP DATABASE" in item for item in commands))

    def test_schema_failure_still_cleans_own_database(self):
        code, state, _ = self.exercise("schema")
        self.assertEqual(1, code)
        self.assertEqual("copy_schema_only", state["failure_stage"])
        self.assertTrue(state["created"] and state["dropped"])

    def test_maven_failure_is_recorded_and_database_is_deleted(self):
        code, state, _ = self.exercise("maven")
        self.assertEqual(1, code)
        self.assertEqual(1, state["maven_exit_code"])
        self.assertTrue(state["created"] and state["dropped"])

    def test_cleanup_failure_is_reported_and_fails_run(self):
        code, state, _ = self.exercise("drop")
        self.assertEqual(1, code)
        self.assertTrue(state["created"])
        self.assertFalse(state["dropped"])
        self.assertEqual("RuntimeError", state["cleanup_failure_type"])

    def test_success_also_records_complete_lifecycle(self):
        code, state, _ = self.exercise()
        self.assertEqual(0, code)
        self.assertTrue(state["created"] and state["dropped"])


if __name__ == "__main__":
    unittest.main()
