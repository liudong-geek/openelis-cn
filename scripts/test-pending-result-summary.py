#!/usr/bin/env python3
"""Run A-02 backend tests against a fresh synthetic PostgreSQL database."""

import argparse
import datetime
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="openelis-cn-database")
    parser.add_argument("--port", type=int, default=25432)
    parser.add_argument("--maven", default="mvn")
    parser.add_argument("--maven-repository")
    parser.add_argument("--goal", choices=("test", "package"), default="test")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Invalid local PostgreSQL port")
    repo = Path(__file__).resolve().parent.parent
    output = Path(tempfile.mkdtemp(prefix="lis-a02-backend-"))
    database = "lis_a02_test_" + datetime.date.today().strftime("%Y%m%d") + "_" + secrets.token_hex(4)
    if not re.fullmatch(r"lis_a02_test_[0-9]{8}_[a-z0-9]+", database):
        raise RuntimeError("Invalid task database name")
    record = {"database": database, "created": False, "dropped": False, "goal": args.goal}
    state = output / "database-lifecycle.json"
    credential_values = []

    def docker(command, stdin=None):
        result = subprocess.run(["docker", "exec", "-i", args.container, "sh", "-c", command],
                                input=stdin, text=True, capture_output=True, timeout=30)
        if result.returncode:
            raise RuntimeError("Task database operation failed; no credentials have been logged")
        return result.stdout

    def psql(target, sql):
        if target not in ("postgres", database):
            raise RuntimeError("Database target rejected")
        return docker('export PGPASSWORD="$POSTGRES_PASSWORD"; '
                      'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ' + target, sql).strip()

    def redact(text):
        for value in credential_values:
            if value:
                text = text.replace(value, "[redacted]")
        return text

    try:
        # Metadata only. Refuse to overwrite any existing database.
        if psql("postgres", "select count(*) from pg_database where datname='" + database + "';") != "0":
            raise RuntimeError("Refusing to replace an existing database")
        psql("postgres", "CREATE DATABASE " + database + ";")
        record["created"] = True
        state.write_text(json.dumps(record, indent=2))
        # The running application supplies table definitions, never clinical rows.
        tables = ("analysis", "sample_item", "sample", "test", "test_section", "result",
                  "test_result_component", "result_file", "result_file_seq", "test_result")
        schema = docker('export PGPASSWORD="$POSTGRES_PASSWORD"; '
                        'exec pg_dump --schema-only --section=pre-data --no-owner --no-privileges '
                        '--no-comments -U "$POSTGRES_USER" -d clinlims '
                        + " ".join("-t clinlims." + table for table in tables))
        (output / "schema-only.sql").write_text(schema)
        psql(database, "CREATE SCHEMA clinlims;\n" + schema)
        # Credentials stay in memory and the child process environment. No shell
        # interpolation, arguments, source file, or report contains their values.
        user, password, _ = docker('printf "%s\\0%s\\0" "$POSTGRES_USER" "$POSTGRES_PASSWORD"').split("\0")
        credential_values = [password, user]
        env = os.environ.copy()
        env.update({"MAVEN_OPTS": env.get("MAVEN_OPTS", "") + " -Xms128m -Xmx1024m",
                    "JAVA_TOOL_OPTIONS": env.get("JAVA_TOOL_OPTIONS", "") + " -Xmx768m",
                    "A02_TEST_DB_URL": "jdbc:postgresql://127.0.0.1:" + str(args.port) + "/" + database,
                    "A02_TEST_DB_USER": user, "A02_TEST_DB_PASSWORD": password})
        tests = ",".join(("PendingResultSummaryTest", "ResultEntryWorklistServiceTest",
                          "PendingResultRestContractTest", "PendingDashboardPagingTest", "UserServiceImplUnitTest",
                          "PendingResultHibernateQueryTest", "PendingResultDatabaseIT"))
        command = [args.maven, "-B", "-ntp", "-Dtest=" + tests, "-DforkCount=1", "-DreuseForks=true"]
        if args.maven_repository:
            command.append("-Dmaven.repo.local=" + str(Path(args.maven_repository).resolve()))
        command.append(args.goal)
        start = time.monotonic()
        with (output / "maven.log").open("w") as log:
            process = subprocess.Popen(command, cwd=repo, env=env, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True)
            for line in process.stdout:
                log.write(redact(line))
                log.flush()
            record["maven_exit_code"] = process.wait()
        record["elapsed_seconds"] = round(time.monotonic() - start, 2)
    finally:
        # Delete only the database whose successful creation this invocation owns.
        if record["created"]:
            psql("postgres", "DROP DATABASE " + database + " WITH (FORCE);")
            record["dropped"] = True
        for report in (repo / "target/surefire-reports").glob("*"):
            if report.suffix in (".xml", ".txt"):
                content = report.read_text()
                sanitized = redact(content)
                if content != sanitized:
                    report.write_text(sanitized)
        state.write_text(json.dumps(record, indent=2))
        print(json.dumps({**record, "report_directory": str(output)}, indent=2), flush=True)
    return record.get("maven_exit_code", 1)


if __name__ == "__main__":
    raise SystemExit(main())
