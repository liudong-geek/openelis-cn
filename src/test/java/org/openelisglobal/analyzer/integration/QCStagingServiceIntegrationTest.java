package org.openelisglobal.analyzer.integration;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analyzer.service.QCProcessingResult;
import org.openelisglobal.analyzer.service.QCStagingService;
import org.openelisglobal.analyzerresults.dao.AnalyzerResultsDAO;
import org.openelisglobal.analyzerresults.service.AnalyzerResultsService;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real PostgreSQL commit, row-lock, audit and migration boundaries; no
 * instrument or hospital network.
 */
public class QCStagingServiceIntegrationTest extends BaseWebContextSensitiveTest {
    @Autowired
    private QCStagingService staging;
    @Autowired
    private AnalyzerResultsDAO results;
    @Autowired
    private AnalyzerResultsService analyzerResults;
    @Autowired
    private DataSource qcDataSource;
    @Autowired
    private PlatformTransactionManager qcTransactions;
    private JdbcTemplate jdbc;
    private Object stagingTarget;
    private Object previousAudit;

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue(AopUtils.isAopProxy(staging));
        assertTrue(AopUtils.isAopProxy(results));
        executeDataSetWithStateManagement("testdata/fhir-qc-pipeline.xml");
        jdbc = new JdbcTemplate(qcDataSource);
        stagingTarget = AopTestUtils.getTargetObject(staging);
        previousAudit = ReflectionTestUtils.getField(stagingTarget, "audit");
        AuditTrailService realAudit = webApplicationContext.getBean("auditTrailServiceImpl", AuditTrailService.class);
        assertFalse(org.mockito.Mockito.mockingDetails(realAudit).isMock());
        ReflectionTestUtils.setField(stagingTarget, "audit", realAudit);
        // Avoid unrelated asynchronous rule evaluation; this group tests receipt
        // durability.
        jdbc.update("UPDATE clinlims.qc_control_lot SET status='ESTABLISHMENT' WHERE id='lot-fhir-001'");
    }

    @After
    public void restoreAuditBoundary() {
        if (stagingTarget != null) {
            ReflectionTestUtils.setField(stagingTarget, "audit", previousAudit);
        }
    }

    @Test
    public void concurrentReimportsCommitOnlyOneOriginal() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> {
                start.await();
                return staging.stage(original("event-one"), "1");
            });
            var second = pool.submit(() -> {
                start.await();
                return staging.stage(original("event-one"), "1");
            });
            start.countDown();
            String left = first.get(20, TimeUnit.SECONDS);
            String right = second.get(20, TimeUnit.SECONDS);
            assertTrue((left == null) != (right == null));
            assertEquals(Integer.valueOf(1), jdbc.queryForObject(
                    "SELECT count(*) FROM clinlims.analyzer_results WHERE iscontrol=true", Integer.class));
            assertEquals(Integer.valueOf(0),
                    jdbc.queryForObject("SELECT count(*) FROM clinlims.qc_result", Integer.class));
            assertEquals(1, auditRows(left == null ? right : left).size());
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS));
        }
    }

    @Test
    public void concurrentProcessingLinksExactlyOneCommittedResult() throws Exception {
        String id = staging.stage(original("event-two"), "1");
        var pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> {
                start.await();
                return staging.process(id, "1");
            });
            var second = pool.submit(() -> {
                start.await();
                return staging.process(id, "1");
            });
            start.countDown();
            QCProcessingResult left = first.get(20, TimeUnit.SECONDS);
            QCProcessingResult right = second.get(20, TimeUnit.SECONDS);
            assertEquals(QCProcessingResult.Status.CREATED, left.status());
            assertEquals(left.qcResultId(), right.qcResultId());
            assertEquals(left.qcResultId(), staging.readOutcome(id).qcResultId());
            assertEquals(Integer.valueOf(1),
                    jdbc.queryForObject("SELECT count(*) FROM clinlims.qc_result", Integer.class));
            assertEquals(left.qcResultId(),
                    jdbc.queryForObject("SELECT qc_result_id FROM clinlims.analyzer_results WHERE id=?", String.class,
                            Integer.valueOf(id)));
            assertEquals(2, auditRows(id).size());
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS));
        }
    }

    @Test
    public void everyAttemptKeepsAuditableOutcomeAndRawStaysOnlyInOriginal() {
        AnalyzerResults incoming = original("event-audit");
        incoming.setLotNumber("UNKNOWN-LOT");
        String id = staging.stage(incoming, "1");
        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, staging.process(id, "1").status());
        String unresolved = staging.readOutcome(id).reasonCode();
        assertNotNull(unresolved);
        jdbc.update("UPDATE clinlims.qc_control_lot SET lot_number='UNKNOWN-LOT' WHERE id='lot-fhir-001'");
        new TransactionTemplate(qcTransactions).execute(status -> {
            assertEquals(QCProcessingResult.Status.CREATED, staging.process(id, "1").status());
            status.setRollbackOnly();
            return null;
        });
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT count(*) FROM clinlims.qc_result", Integer.class));
        assertEquals("NOT_PROCESSED", staging.get(id).get("qcProcessingStatus"));
        assertEquals(2, auditRows(id).size());
        assertEquals(QCProcessingResult.Status.CREATED, staging.process(id, "1").status());
        List<Map<String, Object>> records = auditRows(id);
        assertEquals(3, records.size());
        // Identify each committed outcome without assuming surrogate ID order.
        String staged = auditWithStatus(records, "PENDING");
        String attempted = auditWithStatus(records, "NOT_PROCESSED");
        String created = auditWithStatus(records, "CREATED");
        assertTrue(staged.contains("<qcOperation>STAGED</qcOperation>"));
        assertTrue(attempted, attempted.contains("<previousStatus>PENDING</previousStatus>"));
        assertTrue(attempted.contains("<currentStatus>NOT_PROCESSED</currentStatus>"));
        assertTrue(attempted.contains(unresolved));
        assertTrue(created.contains("<previousReason>" + unresolved + "</previousReason>"));
        assertTrue(created.contains("<currentStatus>CREATED</currentStatus>"));
        for (Map<String, Object> record : records) {
            assertEquals("1", record.get("sys_user_id").toString());
            assertFalse(xml(record).contains(incoming.getQcRawObservation()));
            assertFalse(xml(record).contains("valueQuantity"));
        }
        assertEquals(incoming.getQcRawObservation(), staging.get(id).get("qcRawObservation"));
        assertEquals("UNKNOWN-LOT", staging.get(id).get("lotNumber"));
        analyzerResults.delete(id, "1");
        assertEquals(id, staging.get(id).get("id"));
    }

    private String auditWithStatus(List<Map<String, Object>> records, String status) {
        List<String> matches = records.stream().map(this::xml)
                .filter(record -> record.contains("<currentStatus>" + status + "</currentStatus>")).toList();
        assertEquals("One committed audit record for " + status, 1, matches.size());
        return matches.get(0);
    }

    @Test
    public void patientAndQCDoNotShareLegacyDuplicateCandidates() {
        AnalyzerResults control = original("event-isolation");
        String controlId = staging.stage(control, "1");
        AnalyzerResults patient = original("not-used-for-patient");
        patient.setIsControl(false);
        patient.setQcRawObservation(null);
        assertNull(results.getDuplicateResultByAccessionAndTest(patient));
        patient.setSysUserId("1");
        String patientId = analyzerResults.insert(patient);
        assertEquals(List.of(patientId),
                results.getDuplicateResultByAccessionAndTest(patient).stream().map(AnalyzerResults::getId).toList());
        assertEquals(List.of(controlId),
                results.getDuplicateResultByAccessionAndTest(control).stream().map(AnalyzerResults::getId).toList());
        analyzerResults.delete(patientId, "1");
        assertFalse(results.get(patientId).isPresent());
        assertEquals(controlId, staging.get(controlId).get("id"));
    }

    @Test
    public void rowLockRefreshesAnAlreadyCachedOutcomeBeforeRetry() {
        String id = staging.stage(original("event-cache"), "1");
        new TransactionTemplate(qcTransactions).execute(status -> {
            AnalyzerResults cached = results.get(id).orElseThrow();
            assertEquals("PENDING", cached.getQcProcessingStatus());
            try (Connection independent = qcDataSource.getConnection();
                    var update = independent.prepareStatement(
                            "UPDATE clinlims.analyzer_results SET qc_processing_status='UNKNOWN' WHERE id=?")) {
                independent.setAutoCommit(false);
                update.setInt(1, Integer.parseInt(id));
                update.executeUpdate();
                independent.commit();
            } catch (Exception failure) {
                throw new IllegalStateException(failure);
            }
            // Another committed transaction does not mutate Hibernate's first-level entity
            // cache.
            assertEquals("PENDING", cached.getQcProcessingStatus());
            assertEquals("UNKNOWN", results.lockQCStaging(id).getQcProcessingStatus());
            status.setRollbackOnly();
            return null;
        });
        assertEquals("UNKNOWN", staging.get(id).get("qcProcessingStatus"));
    }

    @Test
    public void migrationAndEmptyRollbackPreserveLegacyAndPatientRows() throws Exception {
        withMigrationSchema(connection -> {
            migrate(connection, false);
            try (var sql = connection.createStatement()) {
                try (var rows = sql
                        .executeQuery("SELECT id, result, qc_processing_status FROM analyzer_results ORDER BY id")) {
                    assertTrue(rows.next());
                    assertEquals("legacy-control", rows.getString("result"));
                    assertEquals("LEGACY_REVIEW", rows.getString("qc_processing_status"));
                    assertTrue(rows.next());
                    assertEquals("patient-value", rows.getString("result"));
                    assertNull(rows.getString("qc_processing_status"));
                }
            }
            migrate(connection, false);
            migrate(connection, true);
            try (var sql = connection.createStatement();
                    var rows = sql.executeQuery("SELECT result FROM analyzer_results ORDER BY id")) {
                assertTrue(rows.next());
                assertEquals("legacy-control", rows.getString(1));
                assertTrue(rows.next());
                assertEquals("patient-value", rows.getString(1));
            }
        });
    }

    @Test
    public void rollbackRefusesToDiscardPersistedQCOriginals() throws Exception {
        withMigrationSchema(connection -> {
            migrate(connection, false);
            try (var sql = connection.createStatement()) {
                sql.executeUpdate(
                        "UPDATE analyzer_results SET qc_raw_observation='{\"resourceType\":\"Observation\"}' WHERE id=1");
            }
            connection.commit();
            assertThrows(Exception.class, () -> migrate(connection, true));
            if (!connection.getAutoCommit()) {
                connection.rollback();
            }
            try (var sql = connection.createStatement();
                    var rows = sql.executeQuery("SELECT qc_raw_observation FROM analyzer_results WHERE id=1")) {
                assertTrue(rows.next());
                assertEquals("{\"resourceType\":\"Observation\"}", rows.getString(1));
            }
        });
    }

    private List<Map<String, Object>> auditRows(String id) {
        return jdbc.queryForList("""
                SELECT h.sys_user_id,h.changes FROM clinlims.history h
                JOIN clinlims.reference_tables r ON r.id=h.reference_table
                WHERE h.reference_id=? AND upper(r.name)='ANALYZER_RESULTS' ORDER BY h.id
                """, Integer.valueOf(id));
    }

    private String xml(Map<String, Object> record) {
        return new String((byte[]) record.get("changes"), StandardCharsets.UTF_8);
    }

    private AnalyzerResults original(String event) {
        AnalyzerResults row = new AnalyzerResults();
        row.setAnalyzerId("1");
        row.setAccessionNumber("QC-DURABLE");
        row.setTestId("1");
        row.setTestName("Glucose");
        row.setIsControl(true);
        row.setResult("100");
        row.setUnits("mg/dL");
        row.setLotNumber("QC-LOT-2025-GLU");
        row.setControlLevel("NORMAL");
        row.setCompleteDate(Timestamp.valueOf("2026-10-20 08:00:00"));
        row.setQcRawObservation("{\"resourceType\":\"Observation\",\"id\":\"" + event
                + "\",\"effectiveDateTime\":\"2026-10-20T08:00:00Z\",\"valueQuantity\":{\"value\":100}}");
        return row;
    }

    private void withMigrationSchema(SqlWork work) throws Exception {
        String schema = "qc_staging_migration_" + Long.toUnsignedString(System.nanoTime());
        try (Connection connection = qcDataSource.getConnection()) {
            try (var sql = connection.createStatement()) {
                sql.execute("CREATE SCHEMA " + schema);
                sql.execute("SET search_path TO " + schema);
                sql.execute(
                        "CREATE TABLE analyzer_results (id integer primary key, analyzer_id integer, iscontrol boolean, result text)");
                sql.execute("CREATE TABLE qc_result (id varchar(36) primary key)");
                sql.execute(
                        "INSERT INTO analyzer_results VALUES (1,1,true,'legacy-control'), (2,1,false,'patient-value')");
            }
            try {
                work.run(connection);
            } finally {
                connection.setAutoCommit(true);
                try (var sql = connection.createStatement()) {
                    sql.execute("SET search_path TO clinlims");
                    sql.execute("DROP SCHEMA " + schema + " CASCADE");
                }
            }
        }
    }

    private void migrate(Connection connection, boolean rollback) throws Exception {
        var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
        database.setDefaultSchemaName(connection.getSchema());
        database.setLiquibaseSchemaName(connection.getSchema());
        // The caller owns this connection so consecutive update/rollback operations
        // share the isolated schema.
        var migration = new Liquibase("liquibase/3.3.x.x/093-durable-qc-staging.xml", new ClassLoaderResourceAccessor(),
                database);
        if (rollback) {
            migration.rollback(1, new Contexts(), new LabelExpression());
        } else {
            migration.update(new Contexts(), new LabelExpression());
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
