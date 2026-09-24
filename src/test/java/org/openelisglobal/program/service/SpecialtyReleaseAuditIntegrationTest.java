package org.openelisglobal.program.service;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.audittrail.valueholder.History;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.program.service.cytology.CytologySampleService;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.result.service.SpecialtyReleaseAuditSupport;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.aop.framework.AopProxyUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Verifies specialty release entities emit durable history with the real audit
 * service.
 */
public class SpecialtyReleaseAuditIntegrationTest extends BaseWebContextSensitiveTest {

    private static final int PATHOLOGY_ID = 91001;
    private static final int CYTOLOGY_ID = 91002;
    private static final int IMMUNOHISTOCHEMISTRY_ID = 91003;

    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private SampleService sampleService;
    @Autowired
    private PathologySampleService pathologySampleService;
    @Autowired
    private CytologySampleService cytologySampleService;
    @Autowired
    private ImmunohistochemistrySampleService immunohistochemistrySampleService;
    @Autowired
    private HistoryService historyService;
    @Autowired
    private ReferenceTablesService referenceTablesService;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private List<String> referenceTableIds;

    @Before
    public void prepareAuditedEntities() throws Exception {
        executeDataSetWithStateManagement("testdata/logbook-db.xml");
        jdbc = new JdbcTemplate(dataSource);
        cleanupOwners();
        jdbc.update("INSERT INTO clinlims.program (id, code, name, manually_changed, lastupdated) "
                + "VALUES (?, 'AUD_PATH', 'Audit Pathology', false, NOW()), "
                + "(?, 'AUD_CYTO', 'Audit Cytology', false, NOW()), " + "(?, 'AUD_IHC', 'Audit IHC', false, NOW())",
                PATHOLOGY_ID, CYTOLOGY_ID, IMMUNOHISTOCHEMISTRY_ID);
        jdbc.update("INSERT INTO clinlims.pathology_sample (id, program_id, sample_id, status, last_updated) "
                + "VALUES (?, ?, 1, 'GROSSING', NOW())", PATHOLOGY_ID, PATHOLOGY_ID);
        jdbc.update("INSERT INTO clinlims.cytology_sample (id, program_id, sample_id, status, last_updated) "
                + "VALUES (?, ?, 2, 'SCREENING', NOW())", CYTOLOGY_ID, CYTOLOGY_ID);
        jdbc.update(
                "INSERT INTO clinlims.immunohistochemistry_sample "
                        + "(id, program_id, sample_id, status, reffered, last_updated) "
                        + "VALUES (?, ?, 1, 'IN_PROGRESS', false, NOW())",
                IMMUNOHISTOCHEMISTRY_ID, IMMUNOHISTOCHEMISTRY_ID);

        AuditTrailServiceImpl realAudit = new AuditTrailServiceImpl();
        ReflectionTestUtils.setField(realAudit, "referenceTablesService", referenceTablesService);
        ReflectionTestUtils.setField(realAudit, "historyService", historyService);
        installRealAudit(analysisService, realAudit);
        installRealAudit(sampleService, realAudit);
        installRealAudit(pathologySampleService, realAudit);
        installRealAudit(cytologySampleService, realAudit);
        installRealAudit(immunohistochemistrySampleService, realAudit);

        referenceTableIds = List.of(refTableId("ANALYSIS"), refTableId("SAMPLE"), refTableId("PATHOLOGY_SAMPLE"),
                refTableId("CYTOLOGY_SAMPLE"), refTableId("IMMUNOHISTOCHEMISTRY_SAMPLE"));
        cleanupHistory();
    }

    @After
    public void cleanup() {
        if (jdbc != null) {
            if (referenceTableIds != null) {
                cleanupHistory();
            }
            cleanupOwners();
        }
    }

    @Test
    public void releaseAnalysisSampleAndAllCaseOwnersEmitUpdateHistory() throws Exception {
        new TransactionTemplate(transactionManager).executeWithoutResult(transaction -> {
            Analysis analysis = SpecialtyReleaseAuditSupport.detachedAnalysis(analysisService.get("1"),
                    TEST_SYS_USER_ID);
            analysis.setStatusId("6");
            analysis.setReleasedDate(Timestamp.valueOf("2026-09-25 10:00:00"));
            analysisService.update(analysis);

            Sample sample = SpecialtyReleaseAuditSupport.detachedSample(sampleService.get("1"), TEST_SYS_USER_ID);
            sample.setStatusId("3");
            sampleService.update(sample);

            PathologySample pathology = detached(pathologySampleService.get(PATHOLOGY_ID));
            pathology.setStatus(PathologySample.PathologyStatus.COMPLETED);
            pathology.setSysUserId(TEST_SYS_USER_ID);
            pathologySampleService.update(pathology);

            CytologySample cytology = detached(cytologySampleService.get(CYTOLOGY_ID));
            cytology.setStatus(CytologySample.CytologyStatus.COMPLETED);
            cytology.setSysUserId(TEST_SYS_USER_ID);
            cytologySampleService.update(cytology);

            ImmunohistochemistrySample ihc = detached(immunohistochemistrySampleService.get(IMMUNOHISTOCHEMISTRY_ID));
            ihc.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED);
            ihc.setSysUserId(TEST_SYS_USER_ID);
            immunohistochemistrySampleService.update(ihc);
        });

        assertUpdateHistory("1", referenceTableIds.get(0));
        assertUpdateHistory("1", referenceTableIds.get(1));
        assertUpdateHistory(String.valueOf(PATHOLOGY_ID), referenceTableIds.get(2));
        assertUpdateHistory(String.valueOf(CYTOLOGY_ID), referenceTableIds.get(3));
        assertUpdateHistory(String.valueOf(IMMUNOHISTOCHEMISTRY_ID), referenceTableIds.get(4));
    }

    private void installRealAudit(Object service, AuditTrailServiceImpl audit) throws Exception {
        Object target = AopTestUtils.getUltimateTargetObject(service);
        assertNotNull(AopProxyUtils.ultimateTargetClass(service));
        ReflectionTestUtils.setField(target, "auditTrailService", audit);
    }

    private String refTableId(String name) {
        ReferenceTables table = referenceTablesService.getReferenceTableByName(name);
        assertNotNull("Missing protected reference table seed: " + name, table);
        return table.getId();
    }

    private void cleanupHistory() {
        List<Object> numericIds = new ArrayList<>(referenceTableIds.size() + 4);
        referenceTableIds.stream().map(BigDecimal::new).forEach(numericIds::add);
        numericIds.add(BigDecimal.ONE);
        numericIds.add(BigDecimal.valueOf(PATHOLOGY_ID));
        numericIds.add(BigDecimal.valueOf(CYTOLOGY_ID));
        numericIds.add(BigDecimal.valueOf(IMMUNOHISTOCHEMISTRY_ID));
        jdbc.update("DELETE FROM clinlims.history WHERE reference_table IN (?, ?, ?, ?, ?) "
                + "AND reference_id IN (?, ?, ?, ?)", numericIds.toArray());
    }

    private void assertUpdateHistory(String referenceId, String referenceTableId) {
        List<History> rows = historyService.getHistoryByRefIdAndRefTableId(referenceId, referenceTableId);
        assertTrue("Expected UPDATE history for reference table " + referenceTableId,
                rows.stream()
                        .anyMatch(row -> "U".equals(row.getActivity()) && TEST_SYS_USER_ID.equals(row.getSysUserId())
                                && row.getChanges() != null && row.getChanges().length > 0));
    }

    private PathologySample detached(PathologySample source) {
        try {
            PathologySample copy = (PathologySample) source.clone();
            copy.setBlocks(new ArrayList<>());
            copy.setSlides(new ArrayList<>());
            copy.setRequests(new ArrayList<>());
            copy.setTechniques(new ArrayList<>());
            copy.setConclusions(new ArrayList<>());
            copy.setReports(new ArrayList<>());
            return copy;
        } catch (CloneNotSupportedException exception) {
            throw new IllegalStateException("Unable to prepare pathology audit update", exception);
        }
    }

    private CytologySample detached(CytologySample source) {
        try {
            CytologySample copy = (CytologySample) source.clone();
            copy.setSlides(new ArrayList<>());
            copy.setReports(new ArrayList<>());
            return copy;
        } catch (CloneNotSupportedException exception) {
            throw new IllegalStateException("Unable to prepare cytology audit update", exception);
        }
    }

    private ImmunohistochemistrySample detached(ImmunohistochemistrySample source) {
        try {
            ImmunohistochemistrySample copy = (ImmunohistochemistrySample) source.clone();
            copy.setReports(new ArrayList<>());
            return copy;
        } catch (CloneNotSupportedException exception) {
            throw new IllegalStateException("Unable to prepare immunohistochemistry audit update", exception);
        }
    }

    private void cleanupOwners() {
        jdbc.update("DELETE FROM clinlims.immunohistochemistry_sample WHERE id = ?", IMMUNOHISTOCHEMISTRY_ID);
        jdbc.update("DELETE FROM clinlims.cytology_sample WHERE id = ?", CYTOLOGY_ID);
        jdbc.update("DELETE FROM clinlims.pathology_sample WHERE id = ?", PATHOLOGY_ID);
        jdbc.update("DELETE FROM clinlims.program WHERE id IN (?, ?, ?)", PATHOLOGY_ID, CYTOLOGY_ID,
                IMMUNOHISTOCHEMISTRY_ID);
    }
}
