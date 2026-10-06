package org.openelisglobal.workplan;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.*;
import org.junit.*;
import org.openelisglobal.analysis.dao.AnalysisDAO;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panel.valueholder.Panel;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.panelitem.valueholder.PanelItem;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampleqaevent.service.SampleQaEventService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.workplan.form.*;
import org.openelisglobal.workplan.service.*;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

public class WorkplanQueryServiceTest {
    private Object before;
    private String initialSnapshot;
    private AnalysisDAO dao;
    private WorkplanQueryAuthorizationService auth;
    private IStatusService names;
    private StatusOfSampleService statuses;
    private TestService tests;
    private PanelService panels;
    private PanelItemService panelItems;
    private TestSectionService sections;
    private WorkplanQueryService service;
    private MockHttpServletRequest request;
    private Analysis analysis;

    @Before
    public void setup() {
        before = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        var config = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue(anyString())).thenReturn("false");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        dao = mock(AnalysisDAO.class);
        auth = mock(WorkplanQueryAuthorizationService.class);
        names = mock(IStatusService.class);
        statuses = mock(StatusOfSampleService.class);
        tests = mock(TestService.class);
        panels = mock(PanelService.class);
        panelItems = mock(PanelItemService.class);
        sections = mock(TestSectionService.class);
        request = new MockHttpServletRequest();
        when(auth.requireRead(request, "test")).thenReturn("7");
        when(auth.requireRead(request, "panel")).thenReturn("7");
        when(auth.requireRead(request, "unit")).thenReturn("7");
        when(auth.requireRead(request, "priority")).thenReturn("7");
        when(auth.allowedTestIds("7")).thenReturn(Set.of("11", "12"));
        when(auth.canPrint(eq(request), eq("7"), anyString())).thenReturn(true);
        var codes = List.of(AnalysisStatus.NotStarted, AnalysisStatus.BiologistRejected,
                AnalysisStatus.TechnicalRejected, AnalysisStatus.NonConforming_depricated);
        var ids = List.of("4", "7", "16", "13");
        for (int i = 0; i < 4; i++) {
            when(names.getStatusID(codes.get(i))).thenReturn(ids.get(i));
            var status = new StatusOfSample();
            status.setId(ids.get(i));
            status.setStatusType("ANALYSIS");
            status.setIsActive(i == 3 ? "N" : "Y");
            when(statuses.get(ids.get(i))).thenReturn(status);
        }
        analysis = analysis("1", "11");
        when(tests.get("11")).thenReturn(analysis.getTest());
        when(dao.countWorkplanAnalyses(anyList(), anySet(), isNull(), isNull())).thenReturn(1L);
        when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of(analysis));
        when(dao.getWorkplanAnalysesByIds(Set.of("1"))).thenReturn(List.of(analysis));
        service = new WorkplanQueryServiceImpl(dao, auth, names, statuses, tests, panels, panelItems, sections,
                mock(PatientService.class), mock(SampleHumanService.class), mock(ObservationHistoryService.class),
                mock(SampleQaEventService.class)) {
            @Override
            protected boolean nonconforming(Analysis a) {
                return false;
            }
        };
        initialSnapshot = service.query(request, q()).pageSnapshot();
        clearInvocations(dao, auth);
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", before);
    }

    private Analysis analysis(String id, String testId) {
        var a = new Analysis();
        a.setId(id);
        a.setStatusId("4");
        a.setLastupdated(Timestamp.valueOf("2026-10-06 08:00:00.123456"));
        var s = mock(Sample.class);
        when(s.getId()).thenReturn("31");
        when(s.getAccessionNumber()).thenReturn("HMC26092800001");
        when(s.getReceivedDateForDisplay()).thenReturn("2026/09/28");
        var item = new SampleItem();
        item.setId("41");
        item.setSample(s);
        a.setSampleItem(item);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId(testId);
        var l = mock(Localization.class);
        when(l.getLocalizedValue()).thenReturn("真实项目");
        test.setLocalizedTestName(l);
        a.setTest(test);
        return a;
    }

    private WorkplanQueryRequest q() {
        return WorkplanQueryRequest.of("test", "11", "1", "10");
    }

    private WorkplanPrintRequest selection() {
        var r = new WorkplanPrintRequest();
        r.setType("test");
        r.setFilterId("11");
        r.setPage("1");
        r.setPageSize("10");
        r.setPageSnapshot(initialSnapshot);
        var identity = new WorkplanPrintRequest.AnalysisIdentity();
        identity.setAnalysisId("1");
        identity.setSampleId("31");
        identity.setSampleItemId("41");
        identity.setTestId("11");
        identity.setAccessionNumber("HMC26092800001");
        identity.setStatusId("4");
        identity.setLastupdated(analysis.getLastupdated().toInstant().toString());
        r.setAnalyses(List.of(identity));
        return r;
    }

    @Test
    public void rawIdentityLocaleAndMetadataStayOnActualAnalysis() {
        var result = service.query(request, q());
        var row = result.workplanTests().get(0);
        assertEquals("HMC26092800001", row.accessionNumber());
        assertEquals("真实项目", row.testName());
        assertEquals("1", row.analysisId());
        assertEquals("41", row.sampleItemId());
        assertEquals("2026-10-06T08:00:00.123456Z", row.lastupdated());
        assertEquals("ANALYSIS", row.rowKind());
        assertEquals(List.of("11"), result.effectiveScope().testIds());
        assertEquals(1, result.paging().totalResults());
        assertEquals(q(), result.query());
        assertTrue(row.canPrint());
        assertNull(row.printUnavailableReason());
    }

    @Test
    public void sessionCachesAreNeitherReadNorChanged() {
        var results = new Object();
        var paging = new Object();
        request.getSession().setAttribute(IActionConstants.RESULTS_SESSION_CACHE, results);
        request.getSession().setAttribute(IActionConstants.RESULTS_PAGE_MAPPING_SESSION_CACHE, paging);
        request.getSession().setAttribute(IActionConstants.SAVE_DISABLED, true);
        service.query(request, q());
        assertSame(results, request.getSession().getAttribute(IActionConstants.RESULTS_SESSION_CACHE));
        assertSame(paging, request.getSession().getAttribute(IActionConstants.RESULTS_PAGE_MAPPING_SESSION_CACHE));
        assertEquals(true, request.getSession().getAttribute(IActionConstants.SAVE_DISABLED));
    }

    @Test
    public void everyPageRechecksCurrentScopeAndState() {
        service.query(request, q());
        when(auth.allowedTestIds("7")).thenReturn(Set.of());
        service.query(request, q());
        verify(auth, times(2)).requireRead(request, "test");
        verify(auth, times(2)).allowedTestIds("7");
        verify(dao).countWorkplanAnalyses(List.of("4", "7", "16", "13"), Set.of(), null, null);
    }

    @Test
    public void panelAndUnitIntersectCurrentProfessionalScope() {
        var panel = mock(Panel.class);
        when(panel.getId()).thenReturn("51");
        when(panel.getLocalizedName()).thenReturn("真实组合");
        when(panels.get("51")).thenReturn(panel);
        var permitted = new PanelItem();
        permitted.setTest(analysis.getTest());
        var hidden = new PanelItem();
        hidden.setTest(analysis("2", "99").getTest());
        when(panelItems.getPanelItemsForPanel("51")).thenReturn(List.of(permitted, hidden));
        service.query(request, WorkplanQueryRequest.of("panel", "51", "1", "10"));
        verify(dao).countWorkplanAnalyses(anyList(), eq(Set.of("11")), isNull(), isNull());
        var unit = new TestSection();
        unit.setId("61");
        when(sections.get("61")).thenReturn(unit);
        when(sections.getTestsInSection("61")).thenReturn(List.of(analysis.getTest(), hidden.getTest()));
        when(dao.getWorkplanAnalyses(anyList(), anySet(), eq("61"), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of());
        service.query(request, WorkplanQueryRequest.of("unit", "61", "1", "10"));
        verify(dao).countWorkplanAnalyses(anyList(), eq(Set.of("11")), eq("61"), isNull());
    }

    @Test
    public void priorityKeepsAllEnumValuesAndProfessionalScope() {
        for (var priority : OrderPriority.values()) {
            when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), eq(priority), anyInt(), anyInt()))
                    .thenReturn(List.of());
            service.query(request, WorkplanQueryRequest.of("priority", priority.name(), "1", "20"));
            verify(dao).countWorkplanAnalyses(anyList(), eq(Set.of("11", "12")), isNull(), eq(priority));
        }
    }

    @Test
    public void inactiveHistoricalStatusIsVisibleButCannotPrint() {
        analysis.setStatusId("13");
        var row = service.query(request, q()).workplanTests().get(0);
        assertFalse(row.canPrint());
        assertEquals("INACTIVE_STATUS", row.printUnavailableReason());
        var s = selection();
        s.getAnalyses().get(0).setStatusId("13");
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, s));
    }

    @Test
    public void missingVersionStaysVisibleWithoutPrintableIdentity() {
        analysis.setLastupdated(null);
        var row = service.query(request, q()).workplanTests().get(0);
        assertFalse(row.canPrint());
        assertEquals("INCOMPLETE_ANALYSIS_IDENTITY", row.printUnavailableReason());
    }

    @Test
    public void printReturnsOnlyFreshSelectedServerRows() {
        var result = service.preparePrint(request, selection());
        assertEquals(1, result.workplanTests().size());
        assertEquals("真实项目", result.reportTitle());
        assertEquals("HMC26092800001", result.workplanTests().get(0).accessionNumber());
        verify(dao).getWorkplanAnalysesByIds(Set.of("1"));
    }

    @Test
    public void printVersionOrIdentityMismatchIsAllOrNothingConflict() {
        var s = selection();
        s.getAnalyses().get(0).setAccessionNumber("OTHER");
        var firstSelection = s;
        var error = assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, firstSelection));
        assertEquals(409, error.getStatusCode().value());
        s = selection();
        s.getAnalyses().get(0).setLastupdated("2026-10-06T08:00:00.123455Z");
        var finalSelection = s;
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, finalSelection));
    }

    @Test
    public void printStatusLossOrDifferentCurrentPageIsConflict() {
        var s = selection();
        analysis.setStatusId("6");
        when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of());
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, s));
    }

 @Test public void printScopeLossIsForbiddenEvenIfCachedRowExists(){when(auth.allowedTestIds("7")).thenReturn(Set.of("12"));assertThrows(AccessDeniedException.class,()->service.preparePrint(request,selection()));}

 @Test public void printModuleLossAndDuplicateSelectionNeverGenerateRows(){when(auth.canPrint(request,"7","test")).thenReturn(false);assertThrows(AccessDeniedException.class,()->service.preparePrint(request,selection()));verifyZeroInteractions(dao);var s=selection();s.setAnalyses(List.of(s.getAnalyses().get(0),s.getAnalyses().get(0)));assertThrows(IllegalArgumentException.class,()->service.preparePrint(request,s));}

 @Test public void exceptionsAndWrongStatusCategoryAreNotEmptyResults(){when(dao.countWorkplanAnalyses(anyList(),anySet(),isNull(),isNull())).thenThrow(new IllegalStateException("database down"));assertThrows(IllegalStateException.class,()->service.query(request,q()));statuses.get("4").setStatusType("ORDER");assertThrows(IllegalStateException.class,()->service.query(request,q()));}

 @Test public void realPageSizeAndOverflowAreBounded(){when(dao.countWorkplanAnalyses(anyList(),anySet(),isNull(),isNull())).thenReturn(18L);var q=WorkplanQueryRequest.of("test","11","2","10");assertEquals("2",service.query(request,q).paging().totalPages());verify(dao).getWorkplanAnalyses(anyList(),eq(Set.of("11")),isNull(),isNull(),eq(10),eq(10));assertThrows(IllegalArgumentException.class,()->service.query(request,WorkplanQueryRequest.of("test","11","3","10")));}

    @Test
    public void overflowingIdentityAndMissingPageAreBadRequests() {
        var s = selection();
        s.getAnalyses().get(0).setAnalysisId("999999999999999999999999999999");
        assertThrows(IllegalArgumentException.class, () -> service.preparePrint(request, s));
        var missing = selection();
        missing.setPage(null);
        assertThrows(IllegalArgumentException.class, () -> service.preparePrint(request, missing));
        verifyZeroInteractions(dao);
    }

    @Test
    public void haitiPatientHeaderIsPreservedOnlyAsActualAnalysisMetadata() {
        var factory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class, "factory");
        var config = factory.getBean(DefaultConfigurationProperties.class);
        when(config.isPropertyValueEqual(
                org.openelisglobal.common.util.ConfigurationProperties.Property.configurationName, "Haiti LNSP"))
                .thenReturn(true);
        when(config.isPropertyValueEqual(
                org.openelisglobal.common.util.ConfigurationProperties.Property.SUBJECT_ON_WORKPLAN, "true"))
                .thenReturn(true);
        var patient = new org.openelisglobal.patient.valueholder.Patient();
        patient.setId("71");
        var humans = (SampleHumanService) ReflectionTestUtils.getField(service, "humans");
        var patients = (PatientService) ReflectionTestUtils.getField(service, "patients");
        var observations = (ObservationHistoryService) ReflectionTestUtils.getField(service, "observations");
        when(humans.getPatientForSample(analysis.getSampleItem().getSample())).thenReturn(patient);
        when(patients.getLastName(patient)).thenReturn("Test patient");
        when(patients.getNationalId(patient)).thenReturn("national-id");
        when(patients.getSubjectNumber(patient)).thenReturn("subject-id");
        when(observations.getValueForSample(
                org.openelisglobal.observationhistory.service.ObservationHistoryServiceImpl.ObservationType.REFERRERS_PATIENT_ID,
                "31")).thenReturn("referring-id");
        var result = service.query(request, q());
        assertEquals(1, result.workplanTests().size());
        var row = result.workplanTests().get(0);
        assertEquals("1", row.analysisId());
        assertEquals("ANALYSIS", row.rowKind());
        assertEquals("subject-id", row.patientInfo());
        assertEquals("TEST PATIENT / national-id / referring-id", row.groupLabel());
        assertEquals(row.patientName(), row.groupLabel());
        assertEquals("31", row.groupKey());
    }

    @Test
    public void unchangedWholePageAllowsIncludedSubsetOnly() {
        var other = analysis("2", "11");
        when(dao.countWorkplanAnalyses(anyList(), anySet(), isNull(), isNull())).thenReturn(2L);
        when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of(analysis, other));
        var selection = selection();
        selection.setPageSnapshot(service.query(request, q()).pageSnapshot());
        assertEquals(List.of("1"), service.preparePrint(request, selection).workplanTests().stream()
                .map(WorkplanQueryRow::analysisId).toList());
    }

    @Test
    public void unselectedVersionOrStatusChangeInvalidatesWholePage() {
        var other = analysis("2", "11");
        when(dao.countWorkplanAnalyses(anyList(), anySet(), isNull(), isNull())).thenReturn(2L);
        when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of(analysis, other));
        var selection = selection();
        selection.setPageSnapshot(service.query(request, q()).pageSnapshot());
        other.setLastupdated(Timestamp.valueOf("2026-10-06 08:00:00.123457"));
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, selection));
        other.setLastupdated(analysis.getLastupdated());
        other.setStatusId("7");
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, selection));
    }

    @Test
    public void newCurrentPageRowOrChangedScopeInvalidatesOriginalSnapshot() {
        var selection = selection();
        var newcomer = analysis("2", "11");
        when(dao.countWorkplanAnalyses(anyList(), anySet(), isNull(), isNull())).thenReturn(2L);
        when(dao.getWorkplanAnalyses(anyList(), anySet(), isNull(), isNull(), anyInt(), anyInt()))
                .thenReturn(List.of(analysis, newcomer));
        assertThrows(ResponseStatusException.class, () -> service.preparePrint(request, selection));
    }
}
