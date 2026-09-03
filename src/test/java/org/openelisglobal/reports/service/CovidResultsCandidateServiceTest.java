package org.openelisglobal.reports.service;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.test.service.TestService;
import org.springframework.test.util.ReflectionTestUtils;

public class CovidResultsCandidateServiceTest {

    private CovidResultsCandidateService service;
    private AnalysisService analysisService;
    private TestService testService;
    private IStatusService statusService;

    @Before
    public void setUp() {
        service = new CovidResultsCandidateService();
        analysisService = mock(AnalysisService.class);
        testService = mock(TestService.class);
        statusService = mock(IStatusService.class);
        ReflectionTestUtils.setField(service, "analysisService", analysisService);
        ReflectionTestUtils.setField(service, "testService", testService);
        ReflectionTestUtils.setField(service, "statusService", statusService);
    }

    @Test
    public void getCandidates_usesExactCovidLoincStatusAndCompletedDateQueryInOneBulkCall() {
        Date lower = Date.valueOf("2024-01-01");
        Date upper = Date.valueOf("2024-01-31");
        org.openelisglobal.test.valueholder.Test firstTest = test("11");
        org.openelisglobal.test.valueholder.Test secondTest = test("12");
        Analysis candidate = analysis("101");
        when(testService.getActiveTestsByLoinc(org.mockito.ArgumentMatchers.any(String[].class)))
                .thenReturn(List.of(firstTest, secondTest));
        when(statusService.getStatusID(AnalysisStatus.Finalized)).thenReturn("21");
        when(statusService.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("22");
        when(statusService.getStatusID(OrderStatus.Started)).thenReturn("31");
        when(statusService.getStatusID(OrderStatus.Finished)).thenReturn("32");
        ZoneId businessZone = ZoneId.systemDefault();
        Timestamp expectedStart = Timestamp.from(lower.toLocalDate().atStartOfDay(businessZone).toInstant());
        Timestamp expectedEnd = Timestamp
                .from(upper.toLocalDate().plusDays(1).atStartOfDay(businessZone).toInstant());
        when(analysisService.getAllAnalysisByTestsAndStatusAndCompletedDateRangeExclusive(List.of("11", "12"),
                List.of("21", "22"), List.of("31", "32"), expectedStart, expectedEnd))
                .thenReturn(List.of(candidate));

        List<Analysis> actual = service.getCandidates(lower, upper);

        assertEquals(List.of(candidate), actual);
        ArgumentCaptor<String[]> loincCodes = ArgumentCaptor.forClass(String[].class);
        verify(testService).getActiveTestsByLoinc(loincCodes.capture());
        assertArrayEquals(new String[] { "94547-7", "94500-6" }, loincCodes.getValue());
        ArgumentCaptor<Timestamp> startInclusive = ArgumentCaptor.forClass(Timestamp.class);
        ArgumentCaptor<Timestamp> endExclusive = ArgumentCaptor.forClass(Timestamp.class);
        verify(analysisService).getAllAnalysisByTestsAndStatusAndCompletedDateRangeExclusive(eq(List.of("11", "12")),
                eq(List.of("21", "22")), eq(List.of("31", "32")), startInclusive.capture(),
                endExclusive.capture());
        assertEquals(expectedStart, startInclusive.getValue());
        assertEquals(expectedEnd, endExclusive.getValue());

        Timestamp highDayLastMillisecond = Timestamp
                .from(upper.toLocalDate().atTime(LocalTime.of(23, 59, 59, 999_000_000)).atZone(businessZone)
                        .toInstant());
        Timestamp nextDayMidnight = Timestamp
                .from(upper.toLocalDate().plusDays(1).atStartOfDay(businessZone).toInstant());
        assertTrue("The final millisecond of the selected high day must be inside the half-open range",
                highDayLastMillisecond.compareTo(startInclusive.getValue()) >= 0
                        && highDayLastMillisecond.compareTo(endExclusive.getValue()) < 0);
        assertFalse("The following day's midnight must be outside the half-open range",
                nextDayMidnight.compareTo(endExclusive.getValue()) < 0);
    }

    @Test
    public void getCandidates_rejectsReversedRangeBeforeAnyLookup() {
        Date lower = Date.valueOf("2024-01-31");
        Date upper = Date.valueOf("2024-01-01");

        assertThrows(IllegalArgumentException.class, () -> service.getCandidates(lower, upper));

        verifyZeroInteractions(testService, statusService, analysisService);
    }

    @Test
    public void getCandidates_returnsEmptyWithoutQueryingStatusesOrAnalysesWhenNoCovidTestIsActive() {
        Date lower = Date.valueOf("2024-01-01");
        Date upper = Date.valueOf("2024-01-31");
        when(testService.getActiveTestsByLoinc(org.mockito.ArgumentMatchers.any(String[].class)))
                .thenReturn(List.of());

        assertEquals(List.of(), service.getCandidates(lower, upper));

        verify(testService).getActiveTestsByLoinc(org.mockito.ArgumentMatchers.any(String[].class));
        verifyZeroInteractions(statusService, analysisService);
    }

    private org.openelisglobal.test.valueholder.Test test(String id) {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId(id);
        return test;
    }

    private Analysis analysis(String id) {
        Analysis analysis = new Analysis();
        analysis.setId(id);
        return analysis;
    }
}
