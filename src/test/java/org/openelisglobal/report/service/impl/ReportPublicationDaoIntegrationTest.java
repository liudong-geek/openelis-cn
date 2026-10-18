package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Executes the actual publication HQL and PostgreSQL visibility boundary. These
 * deliberately minimal release rows test candidate selection, not signature
 * eligibility; ReportPublicationService must still validate each candidate.
 */
public class ReportPublicationDaoIntegrationTest extends BaseWebContextSensitiveTest {
    private static final UUID ANALYSIS_ONE = UUID.fromString("e07f6261-0f9f-4970-a37e-2646357a9901");
    private static final UUID ANALYSIS_TWO = UUID.fromString("e07f6261-0f9f-4970-a37e-2646357a9902");
    private static final Instant FIRST = Instant.parse("2026-10-18T01:00:00Z");
    private static final Instant SECOND = Instant.parse("2026-10-18T02:00:00Z");
    private static final Instant THIRD = Instant.parse("2026-10-18T03:00:00Z");
    private static final Instant THROUGH = Instant.parse("2026-10-18T04:00:00Z");

    @Autowired
    private PatientReportReleaseDAO publicationReleases;
    @Autowired
    private DataSource publicationDataSource;
    @Autowired
    private ReportDocumentDAO publicationDocuments;
    @Autowired
    private PlatformTransactionManager publicationTransactions;
    private JdbcTemplate jdbc;

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();
        assertFalse("Candidate reads must use their own real commit boundary",
                TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue("The real DAO must be transaction proxied", AopUtils.isAopProxy(publicationReleases));
        executeDataSetWithStateManagement("testdata/patient-results-report.xml");
        jdbc = new JdbcTemplate(publicationDataSource);
        jdbc.update("UPDATE clinlims.analysis SET fhir_uuid = ? WHERE id = 1", ANALYSIS_ONE);
        jdbc.update("UPDATE clinlims.analysis SET fhir_uuid = ? WHERE id = 2", ANALYSIS_TWO);
        document(990201, 1, "SIM-PUB-ONE");
        document(990202, 2, "SIM-PUB-TWO");
        jdbc.update(
                "INSERT INTO clinlims.report_document_member (id, report_document_id, analysis_id, member_position) "
                        + "VALUES (990301, 990201, 1, 0), (990302, 990202, 2, 0)");
        release(990010, 990201L, 1, "SUPERSEDED", FIRST, null);
        release(990011, 990201L, 2, "ISSUED", SECOND, null);
        release(990012, 990202L, 1, "VOIDED", FIRST, THIRD);
        release(990013, 990202L, 2, "DRAFT", null, null);
        release(990014, null, 1, "ISSUED", SECOND, null);
    }

    @Test
    public void candidatesContainOnlyDocumentScopedIssuedAndVoidedIdsThroughInclusiveTime() {
        assertEquals(List.of(990011L, 990012L), publicationReleases.getPublicationIds(THROUGH, 0L, 100));
        assertEquals(List.of(990011L, 990012L), publicationReleases.getPublicationIds(THIRD, 0L, 100));
        assertTrue(publicationReleases.getPublicationIds(FIRST, 0L, 100).isEmpty());
        assertEquals(List.of(990012L), publicationReleases.getPublicationIds(THROUGH, 990011L, 100));
        assertEquals(List.of(990011L), publicationReleases.getPublicationIds(SECOND, 0L, 100));
    }

    @Test
    public void withdrawalSelectionUsesVoidTimeAndNotOriginalIssueOrUnrelatedUpdates() {
        jdbc.update("UPDATE clinlims.patient_report_release SET last_updated = ? WHERE id = 990012",
                Timestamp.from(THROUGH.plusSeconds(100)));
        assertEquals(List.of(990012L), publicationReleases.getPublicationIds(THIRD, 990011L, 100));
        assertTrue(publicationReleases.getPublicationIds(FIRST, 0L, 100).isEmpty());
        assertFalse(publicationReleases.getPublicationIds(SECOND, 0L, 100).contains(990012L));
    }

    @Test
    public void analysisUuidJoinsExactDocumentMembershipAndOnlyIssuedReleases() {
        assertEquals(List.of(990011L), ids(publicationReleases.getPublishedByAnalysisUuid(ANALYSIS_ONE)));
        assertTrue(publicationReleases.getPublishedByAnalysisUuid(ANALYSIS_TWO).isEmpty());
        assertTrue(publicationReleases
                .getPublishedByAnalysisUuid(UUID.fromString("c76c56e9-7691-490d-a983-a45dbba56999")).isEmpty());
    }

    @Test
    public void anotherConnectionCannotSeeAnUncommittedReleaseAndSeesItAfterCommit() throws Exception {
        document(990203, 1, "SIM-PUB-COMMIT");
        try (Connection pending = publicationDataSource.getConnection()) {
            pending.setAutoCommit(false);
            insertPending(pending, 990015, 990203);
            assertFalse(publicationReleases.getPublicationIds(THROUGH, 0L, 100).contains(990015L));
            pending.commit();
        }
        assertTrue(publicationReleases.getPublicationIds(THROUGH, 0L, 100).contains(990015L));
        assertEquals(Integer.valueOf(1), jdbc.queryForObject(
                "SELECT count(*) FROM clinlims.patient_report_release WHERE id = 990015", Integer.class));
    }

    @Test
    public void rolledBackReleaseNeverEntersTheCommittedCandidateSet() throws Exception {
        document(990203, 1, "SIM-PUB-ROLLBACK");
        try (Connection pending = publicationDataSource.getConnection()) {
            pending.setAutoCommit(false);
            insertPending(pending, 990015, 990203);
            assertFalse(publicationReleases.getPublicationIds(THROUGH, 0L, 100).contains(990015L));
            pending.rollback();
        }
        assertFalse(publicationReleases.getPublicationIds(THROUGH, 0L, 100).contains(990015L));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject(
                "SELECT count(*) FROM clinlims.patient_report_release WHERE id = 990015", Integer.class));
    }

    @Test
    public void candidatePagesContainAtMostOneHundredScalarIdsAndResumeAfterTheLastId() {
        document(990203, 1, "SIM-PUB-PAGES");
        jdbc.update(
                "INSERT INTO clinlims.patient_report_release (id, patient_id, report_document_id, report_number, "
                        + "report_version, status, created_by, created_at, issued_at, voided_at) "
                        + "SELECT 991000 + n, 1, 990203, 'SIM-PUB-PAGE-' || n, n + 1, 'VOIDED', 1, ?, ?, ? "
                        + "FROM generate_series(0, 100) AS n",
                Timestamp.from(FIRST), Timestamp.from(SECOND), Timestamp.from(THIRD));
        List<Long> page = publicationReleases.getPublicationIds(THROUGH, 990012L, 1000);
        assertEquals(100, page.size());
        assertEquals(Long.valueOf(991000), page.get(0));
        assertEquals(Long.valueOf(991099), page.get(99));
        assertEquals(List.of(991100L), publicationReleases.getPublicationIds(THROUGH, page.get(99), 100));
        assertTrue(publicationReleases.getPublicationIds(THROUGH, 991100L, 100).isEmpty());
    }

    @Test
    public void documentThenReleaseLockRefreshesIssuedEntityCachedBeforeConcurrentVoidCommit() {
        new TransactionTemplate(publicationTransactions).execute(status -> {
            PatientReportRelease observed = publicationReleases.get(990011L).orElseThrow();
            assertEquals(PatientReportReleaseStatus.ISSUED, observed.getStatus());
            try (Connection concurrent = publicationDataSource.getConnection();
                    PreparedStatement update = concurrent.prepareStatement(
                            "UPDATE clinlims.patient_report_release SET status = 'VOIDED', voided_at = ? WHERE id = 990011")) {
                concurrent.setAutoCommit(false);
                update.setTimestamp(1, Timestamp.from(THIRD));
                assertEquals(1, update.executeUpdate());
                concurrent.commit();
            } catch (Exception error) {
                throw new IllegalStateException(error);
            }
            assertSame(observed, publicationReleases.getLatestReleased("990201"));
            assertEquals("The first-level cache still contains the old state before refresh",
                    PatientReportReleaseStatus.ISSUED, observed.getStatus());
            assertNotNull(publicationDocuments.getWithMembers("990201", true));
            PatientReportRelease refreshed = publicationReleases.lockRelease(990011L);
            assertSame(observed, refreshed);
            assertEquals(PatientReportReleaseStatus.VOIDED, refreshed.getStatus());
            assertEquals(Timestamp.from(THIRD), refreshed.getVoidedAt());
            return null;
        });
    }

    private void document(long id, long sample, String group) {
        jdbc.update(
                "INSERT INTO clinlims.report_document (id, patient_id, sample_id, report_group_key, "
                        + "group_rule_version, report_number, fhir_uuid, created_by, created_at) "
                        + "VALUES (?, 1, ?, ?, 'SIM-1', ?, ?, 1, ?)",
                id, sample, group, group,
                UUID.nameUUIDFromBytes(group.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Timestamp.from(FIRST));
    }

    private void release(long id, Long document, int version, String status, Instant issued, Instant voided) {
        jdbc.update(
                "INSERT INTO clinlims.patient_report_release (id, patient_id, report_document_id, report_number, "
                        + "report_version, status, created_by, created_at, issued_at, voided_at) "
                        + "VALUES (?, 1, ?, ?, ?, ?, 1, ?, ?, ?)",
                id, document, "SIM-PUB-RELEASE-" + id, version, status, Timestamp.from(FIRST),
                issued == null ? null : Timestamp.from(issued), voided == null ? null : Timestamp.from(voided));
    }

    private void insertPending(Connection connection, long id, long document) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO clinlims.patient_report_release (id, patient_id, report_document_id, report_number, "
                        + "report_version, status, created_by, created_at, issued_at) "
                        + "VALUES (?, 1, ?, ?, 1, 'ISSUED', 1, ?, ?)")) {
            statement.setLong(1, id);
            statement.setLong(2, document);
            statement.setString(3, "SIM-PUB-PENDING-" + id);
            statement.setTimestamp(4, Timestamp.from(FIRST));
            statement.setTimestamp(5, Timestamp.from(SECOND));
            assertEquals(1, statement.executeUpdate());
        }
    }

    private List<Long> ids(List<PatientReportRelease> found) {
        return found.stream().map(PatientReportRelease::getId).sorted().toList();
    }
}
