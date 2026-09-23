package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.form.ReviewPendingAccessionCount;
import org.openelisglobal.analysis.form.ReviewPendingQuery;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.web.server.ResponseStatusException;

public class ReviewPendingServiceTest {
    private ReviewScopeService scopes;
    private AnalysisService analyses;
    private SampleService samples;
    private ResultsValidationUtility projection;
    private ReviewQueryContextService contexts;
    private SampleHumanService patients;
    private ReviewPendingService service;
    private ReviewScopeSnapshot policy;
    private MockHttpSession session;

    @Before
    public void setup() {
        scopes = mock(ReviewScopeService.class);
        analyses = mock(AnalysisService.class);
        samples = mock(SampleService.class);
        projection = mock(ResultsValidationUtility.class);
        contexts = mock(ReviewQueryContextService.class);
        patients = mock(SampleHumanService.class);
        service = new ReviewPendingService(scopes, analyses, samples, projection, contexts, patients);
        policy = new ReviewScopeSnapshot("7", Set.of("101"), List.of("15"), false, "NORMAL", "en", false);
        when(scopes.capture("7")).thenReturn(policy);
        session = new MockHttpSession();
        when(analyses.getReviewPendingAnalyses(anyList(), anySet(), any(), anyInt(), anyInt())).thenReturn(List.of());
        when(projection.projectReviewAnalyses(anyList(), anyBoolean())).thenReturn(List.of());
    }

    @Test
    public void homepageOnlyStreamsAuthorizedScalarsAndChecksPolicyAtCompletion() {
        counts(8);
        var summary = service.summary("7");
        assertEquals(Long.valueOf(8), summary.analysisCount());
        assertEquals("partial", summary.state());
        verify(analyses).visitReviewPendingAccessionCounts(eq(List.of("15")), eq(Set.of("101")), any());
        verify(analyses, never()).getReviewPendingAnalyses(any(), any(), any(), anyInt(), anyInt());
        verifyZeroInteractions(samples, patients, projection, contexts);
        verify(scopes).requireUnchanged(same(policy));
    }

    @Test
    public void explicitPendingUsesSamePolicyAndAllAuthorizedCandidatesForContext() {
        var form = pending();
        var analysis = new Analysis();
        var row = ReviewSummaryFactoryTest.row("1", "1", "A", "c1");
        when(analyses.getReviewPendingAnalyses(List.of("15"), Set.of("101"), ReviewPendingQuery.all(), 0, 0))
                .thenReturn(List.of(analysis));
        when(projection.projectReviewAnalyses(List.of(analysis), false)).thenReturn(List.of(row));
        assertSame(form, service.query(session, "7", form, null, null));
        verify(contexts).create(session, "7", form, List.of(row), false, policy);
        verify(analyses, never()).visitReviewPendingAccessionCounts(any(), any(), any());
        verify(scopes).requireUnchanged(same(policy));
    }

    @Test
    public void filteredWithoutCriteriaIsUnqueriedAndCannotBypassPageIdentity() {
        var form = new ResultValidationForm();
        form.setDoRange(true);
        service.query(session, "7", form, null, null);
        assertFalse(form.getSearchFinished());
        assertNull(form.getQueryId());
        assertTrue(form.getResultList().isEmpty());
        assertEquals("unqueried", form.getSummary().state());
        assertNull(form.getSummary().analysisCount());
        verifyZeroInteractions(contexts, analyses, projection, samples, patients);
        doThrow(ReviewScopeService.stale()).when(contexts).page(session, "7", form, null, "1");
        error(409, () -> service.query(session, "7", form, "1", null));
        error(409, () -> service.query(session, "7", form, null, "old-token"));
    }

    @Test
    public void ambiguousOrUnknownPendingScopeIsRejectedBeforeAnyRead() {
        for (String scope : List.of("wrong", "", "PENDING")) {
            var form = pending();
            form.setReviewScope(scope);
            error(400, () -> service.query(session, "7", form, null, null));
        }
        var form = pending();
        form.setAccessionNumber("A");
        error(400, () -> service.query(session, "7", form, null, null));
        form.setAccessionNumber(null);
        form.setDoRange(false);
        error(400, () -> service.query(session, "7", form, null, null));
        verifyZeroInteractions(scopes, analyses, projection, contexts);
    }

    @Test
    public void exactMissingAccessionIsConfirmedEmptyWithoutChangingExistingExactSemantics() {
        var form = new ResultValidationForm();
        form.setAccessionNumber("SIM-missing");
        form.setDoRange(false);
        service.query(session, "7", form, null, null);
        verify(samples).getSampleByAccessionNumber("SIM-missing");
        verifyNoMoreInteractions(analyses);
        verify(contexts).create(session, "7", form, List.of(), false, policy);
        var sample = new Sample();
        sample.setId("2");
        when(samples.getSampleByAccessionNumber("B")).thenReturn(sample);
        form.setAccessionNumber("B");
        service.query(session, "7", form, null, null);
        verify(analyses).getReviewPendingAnalyses(List.of("15"), Set.of("101"),
                new ReviewPendingQuery(null, null, "2", null), 0, 0);
    }

    @Test
    public void rangeAndSectionFiltersKeepScopeAndDoNotBecomeAllPending() {
        var form = new ResultValidationForm();
        form.setAccessionNumber("A");
        form.setDoRange(true);
        service.query(session, "7", form, null, null);
        verify(analyses).getReviewPendingAnalyses(List.of("15"), Set.of("101"),
                new ReviewPendingQuery(null, "A", null, null), 0, 0);
        form.setAccessionNumber(null);
        form.setTestSectionId("102");
        service.query(session, "7", form, null, null);
        verify(analyses).getReviewPendingAnalyses(List.of("15"), Set.of("101"),
                new ReviewPendingQuery("102", null, null, null), 0, 0);
    }

    @Test public void emptyPermissionIsConfirmedZeroWithoutUnrestrictedDaoAndRetrociNonemptyIsUnknown() {
        when(scopes.capture("7")).thenReturn(new ReviewScopeSnapshot("7",Set.of(),List.of("15"),false,"RETROCI","en",false));
        assertEquals(Long.valueOf(0),service.summary("7").analysisCount()); verifyZeroInteractions(analyses);
        when(scopes.capture("7")).thenReturn(new ReviewScopeSnapshot("7",Set.of("101"),List.of("15"),false,"RETROCI","en",false));
        counts(8); var summary=service.summary("7"); assertNull(summary.analysisCount());assertNull(summary.accessionCount());
        assertEquals("partial",summary.state()); verifyZeroInteractions(projection,contexts,patients,samples);
    }

    @Test
    public void oldDashboardPagingUsesBoundedDatabaseQueryAndRejectsInvalidPages() {
        counts(8);
        service.dashboardPage("7", 2, 3);
        verify(analyses).getReviewPendingAnalyses(List.of("15"), Set.of("101"), ReviewPendingQuery.all(), 3, 3);
        error(400, () -> service.dashboardPage("7", 4, 3));
        error(400, () -> service.dashboardPage("7", 0, 3));
        verifyZeroInteractions(projection, contexts, patients);
    }

    @Test
    public void configurationChangeBeforeResponseInvalidatesBothSummaryAndFullQuery() {
        counts(8);
        doThrow(ReviewScopeService.stale()).when(scopes).requireUnchanged(same(policy));
        error(409, () -> service.summary("7"));
        error(409, () -> service.query(session, "7", pending(), null, null));
        verify(scopes, times(2)).requireUnchanged(same(policy));
    }

    @SuppressWarnings("unchecked")
    private void counts(long count) {
        doAnswer(call -> {
            ((Consumer<ReviewPendingAccessionCount>) call.getArgument(2))
                    .accept(new ReviewPendingAccessionCount("1", "A", count, 1, count));
            return null;
        }).when(analyses).visitReviewPendingAccessionCounts(any(), any(), any());
    }

    private ResultValidationForm pending() {
        var form = new ResultValidationForm();
        form.setReviewScope("pending");
        form.setDoRange(true);
        return form;
    }

    private void error(int code, Runnable action) {
        assertEquals(code, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
    }
}
