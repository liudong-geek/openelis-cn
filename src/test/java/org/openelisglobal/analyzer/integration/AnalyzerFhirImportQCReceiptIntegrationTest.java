package org.openelisglobal.analyzer.integration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import ca.uhn.fhir.context.FhirContext;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.StringType;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analyzer.service.QCProcessingResult;
import org.openelisglobal.analyzer.service.QCResultProcessingService;
import org.openelisglobal.analyzer.service.QCStagingService;
import org.openelisglobal.analyzerimport.action.AnalyzerFhirImportController;
import org.openelisglobal.analyzerimport.service.AnalyzerTestMappingService;
import org.openelisglobal.analyzerimport.util.AnalyzerTestNameCache;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qc.service.QCResultService;
import org.openelisglobal.test.service.TestService;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Receipt and commit-boundary regression using the existing PostgreSQL test
 * container and real Spring service proxies. The base class deliberately has no
 * enclosing test transaction; JDBC readback observes committed rows, not a
 * Hibernate persistence context. Establishment lots keep rule evaluation
 * outside these receipt assertions. The legacy success=true field acknowledges
 * staging; it does not assert QC creation, rule evaluation, or clinical
 * acceptance.
 */
public class AnalyzerFhirImportQCReceiptIntegrationTest extends BaseWebContextSensitiveTest {

    private static final String LOT_ID = "lot-fhir-001";
    private static final String ACCESSION = "QC-RECEIPT-001";
    private static final FhirContext FHIR = FhirContext.forR4();
    private static final List<String> CACHE_FIELDS = List.of("analyzerTestMappingService", "testService",
            "analyzerNameToTestNameMap", "analyzerIdToTestNameMap", "analyzerNameToIdMap", "initialLoadDone");

    @Autowired
    private AnalyzerFhirImportController controller;

    @Autowired
    private QCResultProcessingService processingService;

    @Autowired
    private QCResultService resultService;

    @Autowired
    private QCStagingService stagingService;

    @Autowired
    private DataSource receiptDataSource;

    private final Map<String, Object> originalCacheFields = new LinkedHashMap<>();
    private AnalyzerTestNameCache cache;
    private Object originalFhirContext;
    private boolean fhirContextCaptured;
    private boolean commitFailureFixtureInstalled;
    private JdbcTemplate receiptJdbc;

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();
        assertFalse("The request must cross real service commit boundaries",
                TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue("QC processing must use its Spring transaction proxy", AopUtils.isAopProxy(processingService));
        assertTrue("QC creation must use its Spring transaction proxy", AopUtils.isAopProxy(resultService));
        assertTrue("QC staging must use its Spring transaction proxy", AopUtils.isAopProxy(stagingService));
        assertSame(stagingService, ReflectionTestUtils.getField(controller, "qcStagingService"));

        receiptJdbc = new JdbcTemplate(receiptDataSource);
        originalFhirContext = ReflectionTestUtils.getField(controller, "fhirContext");
        fhirContextCaptured = true;
        ReflectionTestUtils.setField(controller, "fhirContext", FHIR);

        // Initialize only after the real Spring context exists. Preserve every
        // field changed by reloadCache as well as its retained service references.
        cache = AnalyzerTestNameCache.getInstance();
        synchronized (cache) {
            for (String field : CACHE_FIELDS) {
                originalCacheFields.put(field, ReflectionTestUtils.getField(cache, field));
            }
            ReflectionTestUtils.setField(cache, "analyzerTestMappingService",
                    webApplicationContext.getBean(AnalyzerTestMappingService.class));
            ReflectionTestUtils.setField(cache, "testService", webApplicationContext.getBean(TestService.class));
        }

        executeDataSetWithStateManagement("testdata/fhir-qc-pipeline.xml");
        authenticateAs("testUser");
        synchronized (cache) {
            cache.reloadCache();
        }
        assertEquals(0, stagingCount());
        assertEquals(0, qcCount());
    }

    @After
    public void restoreSharedState() {
        try {
            if (commitFailureFixtureInstalled) {
                receiptJdbc.execute("DROP TRIGGER IF EXISTS qc_receipt_fail_commit ON clinlims.qc_result");
                receiptJdbc.execute("DROP FUNCTION IF EXISTS clinlims.qc_receipt_fail_commit()");
            }
        } finally {
            try {
                if (cache != null) {
                    synchronized (cache) {
                        originalCacheFields
                                .forEach((field, value) -> ReflectionTestUtils.setField(cache, field, value));
                    }
                }
            } finally {
                if (fhirContextCaptured) {
                    ReflectionTestUtils.setField(controller, "fhirContext", originalFhirContext);
                }
            }
        }
    }

    @Test
    public void committedQcCreationIsCountedAndIdentifiedByItsStoredRow() {
        useEstablishmentLot();

        Map<String, Object> body = submit();

        assertCounts(body, 1, 0, 0, 0, true);
        assertEquals(1, stagingCount());
        assertEquals(1, qcCount());
        Map<String, Object> outcome = onlyOutcome(body);
        assertEquals("CREATED", outcome.get("status"));
        assertEquals(stagingId(), outcome.get("analyzerResultId"));
        assertEquals(receiptJdbc.queryForObject("SELECT id FROM clinlims.qc_result WHERE control_lot_id = ?",
                String.class, LOT_ID), outcome.get("qcResultId"));
        assertEquals("PENDING", receiptJdbc.queryForObject(
                "SELECT result_status FROM clinlims.qc_result WHERE control_lot_id = ?", String.class, LOT_ID));
    }

    @Test
    public void realCreationValidationFailureLeavesCommittedStagingAndCountsNoQc() {
        assertEquals(1, receiptJdbc.update("DELETE FROM clinlims.qc_statistics WHERE control_lot_id = ?", LOT_ID));
        assertEquals("ACTIVE", receiptJdbc.queryForObject("SELECT status FROM clinlims.qc_control_lot WHERE id = ?",
                String.class, LOT_ID));

        Map<String, Object> body = submit();

        assertUnknownCreationWithStaging(body);
    }

    @Test
    public void databaseCommitFailureIsUnknownAndDoesNotUndoPreviouslyStagedRow() {
        useEstablishmentLot();
        installDeferredCommitFailure();

        Map<String, Object> body = submit();

        assertUnknownCreationWithStaging(body);
    }

    @Test
    public void identicalResendDoesNotCreateASecondQcResult() {
        useEstablishmentLot();
        Map<String, Object> first = submit();
        assertCounts(first, 1, 0, 0, 0, true);
        assertStagingCounts(first, 1, 1, 0);
        String firstStagingId = stagingId();
        Object firstQcId = onlyOutcome(first).get("qcResultId");
        assertNotNull(firstQcId);

        Map<String, Object> repeated = submit();

        assertCounts(repeated, 0, 0, 0, 1, false);
        assertStagingCounts(repeated, 1, 0, 1);
        assertEquals("DUPLICATE_SKIPPED", onlyOutcome(repeated).get("status"));
        assertEquals("DUPLICATE_STAGING_SKIPPED", onlyOutcome(repeated).get("reasonCode"));
        assertEquals(1, stagingCount());
        assertEquals(firstStagingId, stagingId());
        assertEquals(1, qcCount());
        assertEquals(firstQcId, receiptJdbc.queryForObject("SELECT id FROM clinlims.qc_result WHERE control_lot_id = ?",
                String.class, LOT_ID));
    }

    @Test
    public void stagedReadOnlyComponentIssueDoesNotCreateQc() {
        useEstablishmentLot();
        String inactiveComponentId = UUID.randomUUID().toString();
        assertEquals(1, receiptJdbc.update("""
                INSERT INTO clinlims.test_result_component
                    (id, test_id, code, label, is_active, lastupdated, last_updated)
                VALUES (?, 1, 'QC-INACTIVE', 'Inactive QC receipt component', 'N', now(), now())
                """, inactiveComponentId));
        assertEquals(1, receiptJdbc.update("""
                UPDATE clinlims.analyzer_test_map SET component_id = ?
                WHERE analyzer_id = 1 AND analyzer_test_name = 'GLU'
                """, inactiveComponentId));
        synchronized (cache) {
            cache.reloadCache();
        }

        Map<String, Object> body = submit();

        assertCounts(body, 0, 1, 0, 0, false);
        assertStagingCounts(body, 1, 1, 0);
        assertEquals("NOT_PROCESSED", onlyOutcome(body).get("status"));
        assertEquals("QC_CONFIGURATION_REQUIRED", onlyOutcome(body).get("reasonCode"));
        assertEquals(1, stagingCount());
        Map<String, Object> row = receiptJdbc.queryForMap("""
                SELECT id::text AS id, test_id::text AS test_id, read_only, import_issue_reason, component_id
                FROM clinlims.analyzer_results WHERE analyzer_id = 1 AND accession_number = ?
                """, ACCESSION);
        assertEquals(row.get("id"), onlyOutcome(body).get("analyzerResultId"));
        assertEquals("1", row.get("test_id"));
        assertEquals(true, row.get("read_only"));
        assertEquals("unmapped_component:GLU", row.get("import_issue_reason"));
        assertEquals(null, row.get("component_id"));
        assertEquals(0, qcCount());
    }

    @Test
    public void explicitCorrectionRetainsBothOriginalsWithoutCreatingAnotherQc() {
        useEstablishmentLot();
        Map<String, Object> first = submit();
        assertCounts(first, 1, 0, 0, 0, true);
        assertStagingCounts(first, 1, 1, 0);
        String firstStagingId = stagingId();
        Object firstQcId = onlyOutcome(first).get("qcResultId");
        assertNotNull(firstQcId);
        Observation correction = observation(ACCESSION, "GLU", "102.0", null, null);
        correction.setStatus(Observation.ObservationStatus.CORRECTED);
        correction.setEffective(new DateTimeType("2026-10-18T09:05:00+08:00"));

        Map<String, Object> body = submitObservations(correction);

        assertCounts(body, 0, 1, 0, 0, false);
        assertStagingCounts(body, 1, 1, 0);
        Map<String, Object> outcome = onlyOutcome(body);
        assertEquals("NOT_PROCESSED", outcome.get("status"));
        assertEquals("QC_CORRECTION_REQUIRES_REVIEW", outcome.get("reasonCode"));
        assertNotNull(outcome.get("analyzerResultId"));
        assertFalse(firstStagingId.equals(outcome.get("analyzerResultId")));
        assertEquals(2, stagingCount());
        List<Map<String, Object>> rows = receiptJdbc.queryForList("""
                SELECT id::text AS id, duplicate_id::text AS duplicate_id, read_only, result, complete_date
                FROM clinlims.analyzer_results WHERE analyzer_id = 1 AND accession_number = ? ORDER BY id
                """, ACCESSION);
        Map<String, Object> original = rows.stream().filter(row -> firstStagingId.equals(row.get("id"))).findFirst()
                .orElseThrow();
        Map<String, Object> revised = rows.stream().filter(row -> outcome.get("analyzerResultId").equals(row.get("id")))
                .findFirst().orElseThrow();
        assertEquals(null, original.get("duplicate_id"));
        assertEquals(null, revised.get("duplicate_id"));
        assertEquals(true, revised.get("read_only"));
        assertEquals("101.0", original.get("result"));
        assertEquals("102.0", revised.get("result"));
        assertFalse(original.get("complete_date").equals(revised.get("complete_date")));
        assertEquals(1, qcCount());
        assertEquals(firstQcId, receiptJdbc.queryForObject("SELECT id FROM clinlims.qc_result WHERE control_lot_id = ?",
                String.class, LOT_ID));
    }

    @Test
    public void unavailableLotIsStagedWithoutClaimingQcCreation() {
        assertEquals(1,
                receiptJdbc.update("UPDATE clinlims.qc_control_lot SET status = 'ARCHIVED' WHERE id = ?", LOT_ID));

        Map<String, Object> body = submit();

        assertCounts(body, 0, 1, 0, 0, false);
        assertEquals("NOT_PROCESSED", onlyOutcome(body).get("status"));
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", onlyOutcome(body).get("reasonCode"));
        assertEquals(1, stagingCount());
        assertEquals(0, qcCount());
    }

    @Test
    public void ambiguousControlLevelIsStagedWithoutChoosingALot() {
        useEstablishmentLot();
        addLot("lot-receipt-ambiguous", "QC-AMBIGUOUS", "NORMAL", "ESTABLISHMENT");

        Map<String, Object> body = submitObservations(observation(ACCESSION, "GLU", "101.0", null, "NORMAL"));

        assertCounts(body, 0, 1, 0, 0, false);
        assertEquals("NOT_PROCESSED", onlyOutcome(body).get("status"));
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", onlyOutcome(body).get("reasonCode"));
        assertEquals(1, stagingCount());
        assertEquals(0, qcCount());
    }

    @Test
    public void unknownExplicitLotRemainsDurableThenClosesOnlyAfterItsConfigurationIsCorrected() {
        useEstablishmentLot();
        Map<String, Object> body = submitObservations(
                observation(ACCESSION, "GLU", "101.0", "QC-UNKNOWN-2026", "NORMAL"));
        assertCounts(body, 0, 1, 0, 0, false);
        assertEquals(0, qcCount());
        String id = stagingId();
        Map<String, Object> pending = stagingService.get(id);
        assertEquals("QC-UNKNOWN-2026", pending.get("lotNumber"));
        assertEquals("NORMAL", pending.get("controlLevel"));
        assertEquals("NOT_PROCESSED", pending.get("qcProcessingStatus"));
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", pending.get("qcProcessingReason"));
        String original = (String) pending.get("qcRawObservation");
        assertNotNull(original);
        Observation retained = FHIR.newJsonParser().parseResource(Observation.class, original);
        assertEquals("101.0", retained.getValueStringType().getValue());
        assertEquals("GLU", retained.getCode().getCodingFirstRep().getCode());
        assertEquals(1L, ((Number) stagingService.list("OPEN", 20, 0).get("total")).longValue());

        assertEquals(1, receiptJdbc.update("UPDATE clinlims.qc_control_lot SET lot_number = ? WHERE id = ?",
                "QC-UNKNOWN-2026", LOT_ID));
        QCProcessingResult created = stagingService.process(id, "1");
        assertEquals(QCProcessingResult.Status.CREATED, created.status());
        assertEquals(1, qcCount());
        assertEquals(created.qcResultId(), receiptJdbc.queryForObject(
                "SELECT qc_result_id FROM clinlims.analyzer_results WHERE id = ?::numeric", String.class, id));
        assertEquals(created, stagingService.process(id, "1"));
        assertEquals(1, qcCount());
        Map<String, Object> completed = stagingService.get(id);
        assertEquals("CREATED", completed.get("qcProcessingStatus"));
        assertEquals("1", completed.get("qcProcessedBy"));
        assertEquals(original, completed.get("qcRawObservation"));
        assertEquals(false, completed.get("canRetry"));
        assertEquals(0L, ((Number) stagingService.list("OPEN", 20, 0).get("total")).longValue());
    }

    @Test
    public void independentLaterQcRunWithTheSameValueIsNotSwallowedAsDuplicate() {
        useEstablishmentLot();
        assertCounts(submit(), 1, 0, 0, 0, true);
        Observation later = observation(ACCESSION, "GLU", "101.0", null, null);
        later.setEffective(new DateTimeType("2026-10-19T09:00:00+08:00"));

        Map<String, Object> body = submitObservations(later);

        assertCounts(body, 1, 0, 0, 0, true);
        assertStagingCounts(body, 1, 1, 0);
        assertEquals(2, stagingCount());
        assertEquals(2, qcCount());
    }

    @Test
    public void sameLotNumberWithExplicitDistinctLevelsUsesTheCorrespondingLotOnly() {
        useEstablishmentLot();
        addLot("lot-receipt-high", "QC-LOT-2025-GLU", "HIGH", "ESTABLISHMENT");

        Map<String, Object> body = submitObservations(
                observation(ACCESSION, "GLU", "101.0", "QC-LOT-2025-GLU", "NORMAL"),
                observation(ACCESSION, "GLU", "101.0", "QC-LOT-2025-GLU", "HIGH"));

        assertEquals(2, body.get("qcResultsReceived"));
        assertEquals(2, body.get("qcResultsProcessed"));
        assertEquals(0, body.get("qcResultsNotProcessed"));
        assertEquals(true, body.get("qcProcessingComplete"));
        assertEquals(2, stagingCount());
        assertEquals(2, qcCount());
        List<Map<String, Object>> links = receiptJdbc.queryForList("""
                SELECT a.qc_control_level, q.control_lot_id
                FROM clinlims.analyzer_results a JOIN clinlims.qc_result q ON q.id = a.qc_result_id
                WHERE a.analyzer_id = 1 AND a.accession_number = ?
                """, ACCESSION);
        assertEquals(2, links.size());
        assertTrue(links.stream().anyMatch(
                row -> "NORMAL".equals(row.get("qc_control_level")) && LOT_ID.equals(row.get("control_lot_id"))));
        assertTrue(links.stream().anyMatch(row -> "HIGH".equals(row.get("qc_control_level"))
                && "lot-receipt-high".equals(row.get("control_lot_id"))));
    }

    @Test
    public void differentLaterQcRunIsNotMisclassifiedAsAnAmendedObservation() {
        useEstablishmentLot();
        assertCounts(submit(), 1, 0, 0, 0, true);
        Observation later = observation(ACCESSION, "GLU", "102.0", null, null);
        later.setEffective(new DateTimeType("2026-10-19T09:00:00+08:00"));
        assertCounts(submitObservations(later), 1, 0, 0, 0, true);
        assertEquals(2, stagingCount());
        assertEquals(2, qcCount());
    }

    @Test
    public void commitFailureRetainsUnknownOriginalAndExplicitRetryUsesOneAtomicLink() {
        useEstablishmentLot();
        installDeferredCommitFailure();
        Map<String, Object> body = submit();
        assertUnknownCreationWithStaging(body);
        String id = stagingId();
        assertEquals("UNKNOWN", stagingService.get(id).get("qcProcessingStatus"));
        receiptJdbc.execute("DROP TRIGGER qc_receipt_fail_commit ON clinlims.qc_result");
        receiptJdbc.execute("DROP FUNCTION clinlims.qc_receipt_fail_commit()");
        commitFailureFixtureInstalled = false;

        QCProcessingResult created = stagingService.process(id, "1");
        assertEquals(QCProcessingResult.Status.CREATED, created.status());
        assertEquals(created, stagingService.readOutcome(id));
        assertEquals(created, stagingService.markUnknown(id, "1"));
        assertEquals(created, stagingService.process(id, "1"));
        assertEquals(1, qcCount());
    }

    @Test
    public void mixedBundleAccountsForDuplicateInvalidUnmappedFailedAndCreatedQc() {
        useEstablishmentLot();
        Map<String, Object> first = submit();
        assertCounts(first, 1, 0, 0, 0, true);
        addLot("lot-receipt-no-stats", "QC-NO-STATS", "FAILURE", "ACTIVE");

        Map<String, Object> body = submitObservations(observation(ACCESSION, "GLU", "101.0", null, null),
                observation("QC-NONNUM", "GLU", "Positive", null, null),
                observation("QC-UNMAPPED", "UNMAPPED-CODE", "101.0", null, null),
                observation("QC-FAILED", "GLU", "103.0", "QC-NO-STATS", null),
                observation("QC-NEW", "GLU", "102.0", "QC-LOT-2025-GLU", null));

        assertEquals(true, body.get("success"));
        assertEquals(5, body.get("qcResultsReceived"));
        assertEquals(1, body.get("qcResultsProcessed"));
        assertEquals(2, body.get("qcResultsNotProcessed"));
        assertEquals(1, body.get("qcResultsUnknown"));
        assertEquals(1, body.get("qcResultsDuplicateSkipped"));
        assertEquals(false, body.get("qcProcessingComplete"));
        assertStagingCounts(body, 5, 4, 1);
        assertOutcome(body, ACCESSION, "DUPLICATE_SKIPPED", "DUPLICATE_STAGING_SKIPPED");
        assertOutcome(body, "QC-NONNUM", "NOT_PROCESSED", "QC_NON_NUMERIC_RESULT");
        assertOutcome(body, "QC-UNMAPPED", "NOT_PROCESSED", "QC_TEST_NOT_MAPPED");
        assertOutcome(body, "QC-FAILED", "UNKNOWN", "QC_PROCESSING_OUTCOME_UNKNOWN");
        assertOutcome(body, "QC-NEW", "CREATED", null);
        assertEquals(5, receiptJdbc
                .queryForObject("SELECT count(*) FROM clinlims.analyzer_results WHERE analyzer_id = 1", Integer.class)
                .intValue());
        assertEquals(1, stagingCount());
        assertEquals(2, qcCount());
        assertEquals(0,
                receiptJdbc.queryForObject(
                        "SELECT count(*) FROM clinlims.qc_result WHERE control_lot_id = 'lot-receipt-no-stats'",
                        Integer.class).intValue());
    }

    @SuppressWarnings("unchecked")
    private void assertOutcome(Map<String, Object> body, String accession, String status, String reason) {
        List<Map<String, Object>> outcomes = (List<Map<String, Object>>) body.get("qcOutcomes");
        List<Map<String, Object>> matches = outcomes.stream()
                .filter(outcome -> accession.equals(outcome.get("accessionNumber"))).toList();
        assertEquals(1, matches.size());
        Map<String, Object> outcome = matches.get(0);
        assertEquals(status, outcome.get("status"));
        assertEquals(reason, outcome.get("reasonCode"));
        if (!"DUPLICATE_SKIPPED".equals(status)) {
            assertNotNull(outcome.get("analyzerResultId"));
        }
        if ("CREATED".equals(status)) {
            assertEquals(1, receiptJdbc.queryForObject("SELECT count(*) FROM clinlims.qc_result WHERE id = ?",
                    Integer.class, outcome.get("qcResultId")).intValue());
        }
    }

    private void assertUnknownCreationWithStaging(Map<String, Object> body) {
        assertCounts(body, 0, 0, 1, 0, false);
        assertEquals(1, stagingCount());
        assertEquals(0, qcCount());
        Map<String, Object> outcome = onlyOutcome(body);
        assertEquals("UNKNOWN", outcome.get("status"));
        assertEquals("QC_PROCESSING_OUTCOME_UNKNOWN", outcome.get("reasonCode"));
        assertEquals(stagingId(), outcome.get("analyzerResultId"));
        assertEquals(null, outcome.get("qcResultId"));
    }

    private void assertCounts(Map<String, Object> body, int created, int notProcessed, int unknown, int duplicate,
            boolean complete) {
        // success is the existing staging acknowledgement, including when QC
        // remains unprocessed or its commit outcome was not acknowledged.
        assertEquals(true, body.get("success"));
        assertEquals(1, body.get("qcResultsReceived"));
        assertEquals(created, body.get("qcResultsProcessed"));
        assertEquals(notProcessed, body.get("qcResultsNotProcessed"));
        assertEquals(unknown, body.get("qcResultsUnknown"));
        assertEquals(duplicate, body.get("qcResultsDuplicateSkipped"));
        assertEquals(complete, body.get("qcProcessingComplete"));
    }

    private void assertStagingCounts(Map<String, Object> body, int received, int inserted, int duplicate) {
        assertEquals(received, body.get("resultsReceived"));
        assertEquals("The legacy field remains the accepted-row count", received, body.get("resultsInserted"));
        assertEquals(inserted, body.get("stagingRowsInserted"));
        assertEquals(duplicate, body.get("stagingDuplicatesSkipped"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> onlyOutcome(Map<String, Object> body) {
        List<Map<String, Object>> outcomes = (List<Map<String, Object>>) body.get("qcOutcomes");
        assertNotNull(outcomes);
        assertEquals(1, outcomes.size());
        assertEquals(ACCESSION, outcomes.get(0).get("accessionNumber"));
        assertEquals("1", outcomes.get(0).get("testId"));
        return outcomes.get(0);
    }

    private void useEstablishmentLot() {
        assertEquals(1, receiptJdbc.update("DELETE FROM clinlims.qc_statistics WHERE control_lot_id = ?", LOT_ID));
        assertEquals(1,
                receiptJdbc.update("UPDATE clinlims.qc_control_lot SET status = 'ESTABLISHMENT' WHERE id = ?", LOT_ID));
    }

    private void addLot(String id, String number, String level, String status) {
        assertEquals(1, receiptJdbc.update("""
                INSERT INTO clinlims.qc_control_lot
                    (id, fhir_uuid, product_name, lot_number, manufacturer, control_level,
                     test_id, instrument_id, calculation_method, initial_runs_count, activation_date,
                     status, sys_user_id, last_updated)
                SELECT ?, ?::uuid, product_name, ?, manufacturer, ?, test_id, instrument_id,
                       calculation_method, initial_runs_count, activation_date, ?, sys_user_id, last_updated
                FROM clinlims.qc_control_lot WHERE id = ?
                """, id, UUID.randomUUID().toString(), number, level, status, LOT_ID));
    }

    private void installDeferredCommitFailure() {
        // A deferred PostgreSQL constraint trigger fails at COMMIT, after the
        // service body has inserted and retrieved the QC row. It exercises the
        // transaction proxy boundary that a mocked throwing service cannot cover.
        commitFailureFixtureInstalled = true;
        receiptJdbc.execute("""
                CREATE FUNCTION clinlims.qc_receipt_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.control_lot_id = 'lot-fhir-001' THEN
                        RAISE EXCEPTION 'QC_RECEIPT_TEST_COMMIT_FAILURE';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """);
        receiptJdbc.execute("""
                CREATE CONSTRAINT TRIGGER qc_receipt_fail_commit
                AFTER INSERT ON clinlims.qc_result DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION clinlims.qc_receipt_fail_commit()
                """);
    }

    private int stagingCount() {
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        return receiptJdbc.queryForObject(
                "SELECT count(*) FROM clinlims.analyzer_results WHERE analyzer_id = 1 AND accession_number = ?",
                Integer.class, ACCESSION);
    }

    private String stagingId() {
        return receiptJdbc.queryForObject(
                "SELECT id::text FROM clinlims.analyzer_results WHERE analyzer_id = 1 AND accession_number = ?",
                String.class, ACCESSION);
    }

    private int qcCount() {
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        return receiptJdbc.queryForObject(
                "SELECT count(*) FROM clinlims.qc_result WHERE instrument_id = 1 AND test_id = 1", Integer.class);
    }

    private Map<String, Object> submit() {
        return submitObservations(observation(ACCESSION, "GLU", "101.0", null, null));
    }

    private Observation observation(String accession, String testCode, String value, String lotNumber, String level) {
        Observation observation = new Observation();
        observation.getMeta().addTag().setCode("QC");
        observation.getSubject().getIdentifier().setValue(accession);
        observation.getCode().addCoding().setCode(testCode);
        observation.setValue(new StringType(value));
        observation.setEffective(new DateTimeType("2026-10-18T09:00:00+08:00"));
        if (lotNumber != null) {
            observation.addExtension("http://openelis-global.org/fhir/qc/lot-number", new StringType(lotNumber));
        }
        if (level != null) {
            observation.addExtension("http://openelis-global.org/fhir/qc/control-level", new StringType(level));
        }
        return observation;
    }

    private Map<String, Object> submitObservations(Observation... observations) {
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        MockHttpServletRequest request = new MockHttpServletRequest();
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(1);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
        request.setContentType("application/fhir+json");
        Bundle bundle = new Bundle().setType(Bundle.BundleType.TRANSACTION);
        for (Observation observation : observations) {
            bundle.addEntry().setResource(observation);
        }
        request.setContent(FHIR.newJsonParser().encodeResourceToString(bundle).getBytes(StandardCharsets.UTF_8));
        ResponseEntity<Map<String, Object>> response = controller.importFhirBundle(request, "1");
        assertEquals(200, response.getStatusCode().value());
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        assertNotNull(response.getBody());
        return response.getBody();
    }
}
