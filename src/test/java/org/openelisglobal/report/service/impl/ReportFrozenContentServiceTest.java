package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.mockito.*;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.report.dao.ReportClinicalSourceDAO;
import org.openelisglobal.report.form.*;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.test.util.ReflectionTestUtils;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ReportFrozenContentServiceTest {
    @Mock
    private ReportClinicalSourceDAO sourceDAO;
    @Mock
    private DocumentReportProjectionService projection;
    @Mock
    private ReportDocumentService documents;
    @Mock
    private IStatusService statuses;
    @Spy
    private PatientReportServiceImpl reportBuilder = new PatientReportServiceImpl();
    @InjectMocks
    private ReportFrozenContentService service;
    private final ReportReleaseScope scope = new ReportReleaseScope(1, "201", "101", "301", "SIM-CHEM", "SIM-1",
            List.of("401", "402"));
    private PatientReportRelease release;
    private List<Analysis> analyses;
    private List<Result> results;
    private Patient patient;
    private List<TestResultItem> rows;

    @Before
    public void setup() {
        ReflectionTestUtils.setField(reportBuilder, "statusService", statuses);
        when(statuses.matches(anyString(), eq(AnalysisStatus.Finalized)))
                .thenAnswer(call -> "finalized".equals(call.getArgument(0)));
        patient = mock(Patient.class);
        when(patient.getId()).thenReturn("101");
        when(patient.getGender()).thenReturn("M");
        release = new PatientReportRelease();
        release.setId(10L);
        release.setReportDocumentId("201");
        release.setPatientId("101");
        release.setReportNumber("BG-SIM");
        release.setReportVersion(1);
        analyses = List.of(analysis("401"), analysis("402"));
        results = new ArrayList<>(List.of(result("601", analyses.get(0)), result("602", analyses.get(1))));
        rows = new ArrayList<>(List.of(row("401", "601"), row("402", "602")));
        when(sourceDAO.loadAndLock(scope))
                .thenAnswer(call -> new ReportClinicalSourceDAO.LockedSource(patient, analyses, results));
        when(projection.project(any(), eq("7"))).thenAnswer(call -> rows);
    }

    @Test
    public void captureFreezesAllClinicalFieldsAndAnalysisResultVersions() {
        var frozen = capture();
        assertEquals(2, frozen.report().getRows().size());
        assertEquals(2, frozen.analyses().size());
        assertEquals("601", frozen.analyses().get(0).results().get(0).resultId());
        assertEquals("2026-09-16T00:00:00Z", frozen.analyses().get(0).lastUpdated());
        assertEquals("SIM备注", frozen.report().getRows().get(0).getDataMap().get("remarks"));
        assertEquals("3-9", frozen.report().getRows().get(0).getDataMap().get("referenceRange"));
        assertEquals("mmol/L", frozen.report().getRows().get(0).getDataMap().get("unitsOfMeasure"));
        assertEquals(ReportFrozenTemplate.current(), frozen.template());
        var order = inOrder(documents, sourceDAO);
        order.verify(documents).authorizePersistedScope(eq("201"), any(), eq("7"), eq(false));
        order.verify(sourceDAO).loadAndLock(scope);
        order.verify(documents).lockCurrent("201", "7");
    }

    @Test
    public void missingAnalysisFailsBeforeDisplayProjection() {
        analyses = List.of(analyses.get(0));
        assertThrows(IllegalStateException.class, this::capture);
        verifyZeroInteractions(projection);
    }

    @Test
    public void duplicateResultIdentityFailsClosed() {
        results.add(results.get(0));
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void pendingAnalysisCannotBeHiddenByFinalizedDisplayRows() {
        analyses.get(0).setStatusId("pending");
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void emptyReportableMemberCannotIssuePartialDocument() {
        results.remove(1);
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void emptyResultValueCannotBecomeFormalReport() {
        results.get(0).setValue(" ");
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void missingSourceVersionCannotBeSigned() {
        results.get(0).setLastupdated(null);
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void omittedResultProjectionCannotSilentlyProduceShorterReport() {
        rows.remove(1);
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void wrongAnalysisResultPairInProjectionIsRejected() {
        rows.get(0).setAnalysisId("402");
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void duplicateProjectionCannotInflateOneMemberAndOmitAnother() {
        rows.set(1, rows.get(0));
        assertThrows(IllegalStateException.class, this::capture);
    }

    @Test
    public void nonreportableStoredResultStillParticipatesInSourceEvidence() {
        Result internal = result("603", analyses.get(0));
        internal.setIsReportable("N");
        results.add(internal);
        var frozen = capture();
        assertEquals(2, frozen.analyses().get(0).results().size());
        assertEquals(2, frozen.report().getRows().size());
    }

    @Test
    public void sourceValueAndVersionChangesProduceDifferentCanonicalHash() {
        String before = service.encode(capture());
        results.get(0).setLastupdated(Timestamp.from(Instant.parse("2026-09-16T00:00:01Z")));
        assertNotEquals(before, service.encode(capture()));
    }

    private ReportFrozenSnapshot capture() {
        return service.capture(release, scope, "7");
    }

    private Analysis analysis(String id) {
        var a = new Analysis();
        a.setId(id);
        a.setStatusId("finalized");
        a.setLastupdated(Timestamp.from(Instant.parse("2026-09-16T00:00:00Z")));
        var t = new org.openelisglobal.test.valueholder.Test();
        t.setId("11");
        a.setTest(t);
        var item = new SampleItem();
        item.setId("501");
        a.setSampleItem(item);
        var section = new TestSection();
        section.setId("50");
        a.setTestSection(section);
        return a;
    }

    private Result result(String id, Analysis a) {
        var result = new Result();
        result.setId(id);
        result.setAnalysis(a);
        result.setLastupdated(Timestamp.from(Instant.parse("2026-09-16T00:00:00Z")));
        result.setIsReportable("Y");
        result.setValue("5.5");
        result.setResultType("N");
        return result;
    }

    private TestResultItem row(String analysis, String result) {
        var row = new TestResultItem();
        row.setAnalysisId(analysis);
        row.setResultId(result);
        row.setTestId("11");
        row.setAnalysisStatusId("finalized");
        row.setReportable(true);
        row.setResultValue("5.5");
        row.setPatientName("SIM患者");
        row.setTestName("SIM项目");
        row.setNormalRange("3-9");
        row.setUnitsOfMeasure("mmol/L");
        row.setRemarks("SIM备注");
        row.setValid(true);
        row.setNormal(true);
        return row;
    }
}
