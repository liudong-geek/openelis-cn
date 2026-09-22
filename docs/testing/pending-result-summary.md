# Pending result summary backend regression

Use Java 21, Python 3, Maven, and the existing local PostgreSQL container. The
runner starts no containers. It reads only selected table definitions from the
application database, creates a fresh `lis_a02_test_<date>_<random>` database,
and writes exclusively synthetic fixtures there. It refuses database reuse and
deletes only the database it created, including after a test failure. Connection
credentials remain in process memory/environment and are redacted from logs.

```sh
python3 scripts/test-pending-result-summary.py \
  --container openelis-cn-database --port 25432 \
  --maven /path/to/mvn --maven-repository /path/to/isolated/maven-cache
```

The final output identifies the Maven log and database lifecycle record. Use
`--goal package` for the same tests plus a source-built WAR. The runner uses one
test fork and bounded JVM heaps. Dependencies may be downloaded to the selected
cache. Do not point this test at a production database; the Java connection
provider accepts only localhost and a task-specific database name.

The selected tests cover the seven-field REST contract, current-session actor
and role checks, specimen identity uncertainty, pending/returned statuses,
published/printed exclusions, permitted Test IDs, active-component row
existence, database pagination, and prevention of cross-tile cached pages.
`PendingResultDatabaseIT` executes the actual Analysis DAO with production ORM
mappings and compares the list and streaming counts from the same synthetic
dataset. It does not execute the complete patient/result loader or assert the
display-row count for multi-select merging; those remain separate loader and
summary unit-test concerns. Nonempty lightweight summaries intentionally report
`displayRowCount: null` and `state: partial`.

`PendingResultHibernateQueryTest` separately validates real mapping/HQL parsing
without database I/O. It must not be described as the real-database test.
