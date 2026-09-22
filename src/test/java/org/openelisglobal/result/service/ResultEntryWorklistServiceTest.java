package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.form.PendingResultSpecimenCount;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.result.form.PendingResultWorklist;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.web.server.ResponseStatusException;

@RunWith(MockitoJUnitRunner.class)
public class ResultEntryWorklistServiceTest {
    @Mock
    private AnalysisService analysisService;
    @Mock
    private IStatusService statusService;
    @Mock
    private UserService userService;
    @Mock
    private ResultEntryWorklistLoader worklistLoader;
    @Mock
    private SampleHumanService sampleHumanService;
    @InjectMocks
    private ResultEntryWorklistServiceImpl worklistService;

    @Before
    public void scope() {
        when(statusService.getStatusID(AnalysisStatus.NotStarted)).thenReturn("4");
        when(statusService.getStatusID(AnalysisStatus.BiologistRejected)).thenReturn("5");

    }

    @Test
    public void pendingWorklistSummarizesOnlyReturnedAuthorizedRowsAndKeepsShallowResults() {
        when(userService.getTestIdsForLabUnitRole("7", Constants.ROLE_RESULTS)).thenReturn(Set.of("11", "12"));
        Analysis analysis = new Analysis();
        analysis.setId("42");
        TestResultItem row = new TestResultItem();
        row.setAnalysisId("42");
        row.setSampleItemId("10");
        row.setAccessionNumber("A");
        row.setReadOnly(true);
        Result nested = new Result();
        nested.setId("99");
        row.setResult(nested);
        when(analysisService.getPendingResultAnalyses(List.of("4", "5"), Set.of("11", "12"), 0, 0))
                .thenReturn(List.of(analysis));
        when(worklistLoader.load(List.of(analysis), "7")).thenReturn(List.of(row));
        when(userService.filterResultsByLabUnitRoles("7", List.of(row), Constants.ROLE_RESULTS)).thenReturn(List.of(row));

        PendingResultWorklist response = worklistService.getPendingWorklistForUser("7");
        assertEquals(1, response.total());
        assertEquals(List.of(row), response.testResult());
        assertEquals("ready", response.summary().state());
        assertEquals(Long.valueOf(1), response.summary().analysisCount());
        assertEquals("99", row.getResult().getId());
        assertNotSame(nested, row.getResult());
        verify(analysisService, never()).visitPendingResultSpecimenCounts(anyList(), anySet(), any());
    }

    @Test
    public void lightweightSummaryPassesBothStatusesAndIdenticalTestPermissionsWithoutLoadingClinicalRows() {
        when(userService.getTestIdsForLabUnitRole("7", Constants.ROLE_RESULTS)).thenReturn(Set.of("11", "12"));
        projectCounts(3, "10");
        PendingResultSummary summary = worklistService.getPendingSummaryForUser("7");
        assertEquals(Long.valueOf(3), summary.analysisCount());
        assertEquals(Long.valueOf(1), summary.specimenCount());
        assertNull(summary.displayRowCount());
        assertEquals("partial", summary.state());
        verify(analysisService).visitPendingResultSpecimenCounts(eq(List.of("4", "5")), eq(Set.of("11", "12")), any());
        verify(analysisService, never()).getPendingResultAnalyses(anyList(), anySet(), anyInt(), anyInt());
        verifyZeroInteractions(worklistLoader, sampleHumanService);
    }

    @Test
    public void noAuthorizedTestsProduceConfirmedEmptyCountsWithoutQueryingAnalyses() {
        when(userService.getTestIdsForLabUnitRole("7", Constants.ROLE_RESULTS)).thenReturn(Set.of());
        PendingResultSummary summary = worklistService.getPendingSummaryForUser("7");
        assertEquals("ready", summary.state());
        assertEquals(Long.valueOf(0), summary.displayRowCount());
        assertTrue(worklistService.getPendingResultsForUser("7").isEmpty());
        verifyZeroInteractions(analysisService, worklistLoader, sampleHumanService);
    }

    @Test
    public void missingStatusConfigurationFailsRatherThanReportingZero() {
        for (String[] statusIds : new String[][] { { null, "5" }, { " ", "5" }, { "4", null }, { "4", " " },
                { "4", "4" } }) {
            when(statusService.getStatusID(AnalysisStatus.NotStarted)).thenReturn(statusIds[0]);
            when(statusService.getStatusID(AnalysisStatus.BiologistRejected)).thenReturn(statusIds[1]);
            assertThrows(ResultSaveValidationException.class, () -> worklistService.getPendingSummaryForUser("7"));
        }
        verifyZeroInteractions(userService, analysisService, worklistLoader, sampleHumanService);
    }

    @Test
    public void dashboardSubsequentPageRequeriesCurrentActorScopeAndReturnsOnlyItsPage() {
        when(userService.getTestIdsForLabUnitRole("7", Constants.ROLE_RESULTS)).thenReturn(Set.of("11", "12"));
        projectCounts(201, "10");
        Analysis analysis = new Analysis();
        analysis.setId("42");
        when(analysisService.getPendingResultAnalyses(List.of("4", "5"), Set.of("11", "12"), 100, 100))
                .thenReturn(List.of(analysis));
        var response = worklistService.getPendingDashboardPageForUser("7", 2, 100);
        assertEquals("2", response.getPaging().getCurrentPage());
        assertEquals("3", response.getPaging().getTotalPages());
        assertEquals("42", response.getDisplayItems().get(0).getId());
        verify(analysisService).getPendingResultAnalyses(List.of("4", "5"), Set.of("11", "12"), 100, 100);
        verifyZeroInteractions(worklistLoader);
    }

    @Test
    public void outOfRangeDashboardPageIsBadRequestRatherThanReadingACachedPage() {
        when(userService.getTestIdsForLabUnitRole("7", Constants.ROLE_RESULTS)).thenReturn(Set.of("11", "12"));
        projectCounts(1, "10");
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> worklistService.getPendingDashboardPageForUser("7", 2, 100));
        assertEquals(400, error.getStatusCode().value());
        verify(analysisService, never()).getPendingResultAnalyses(anyList(), anySet(), anyInt(), anyInt());
    }

    @SuppressWarnings("unchecked")
    private void projectCounts(long count, String specimenId) {
        doAnswer(invocation -> {
            Consumer<PendingResultSpecimenCount> consumer = invocation.getArgument(2);
            consumer.accept(new PendingResultSpecimenCount(specimenId, "A", count, 1, count));
            return null;
        }).when(analysisService).visitPendingResultSpecimenCounts(anyList(), anySet(), any());
    }
}
