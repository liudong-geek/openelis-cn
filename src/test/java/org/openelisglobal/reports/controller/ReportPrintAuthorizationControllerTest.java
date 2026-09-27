package org.openelisglobal.reports.controller;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.reports.action.implementation.IReportCreator;
import org.openelisglobal.reports.action.implementation.StatisticsReport;
import org.openelisglobal.reports.action.implementation.ResultsScopedReportCreator;
import org.openelisglobal.reports.controller.rest.ReportRestController;
import org.openelisglobal.reports.controller.rest.StatisticsReportRestController;
import org.openelisglobal.reports.form.ReportForm;
import org.openelisglobal.reports.form.ReportForm.ReceptionTime;
import org.openelisglobal.reports.service.ReportAnalysisAuthorizationService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.view.PageBuilderService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.support.SessionStatus;

public class ReportPrintAuthorizationControllerTest {

    private ReportAnalysisAuthorizationService authorizationService;
    private ReportController reportController;
    private ReportRestController reportRestController;
    private StatisticsReportRestController statisticsReportRestController;
    private IReportCreator reportCreator;
    private StatisticsReport statisticsReport;

    @Before
    public void setUp() {
        authorizationService = mock(ReportAnalysisAuthorizationService.class);
        reportCreator = mock(ResultsScopedReportCreator.class);
        statisticsReport = mock(StatisticsReport.class);
        reportController = new TestReportController(reportCreator);
        reportRestController = new TestReportRestController(reportCreator);
        statisticsReportRestController = new TestStatisticsReportRestController(statisticsReport);
        ReflectionTestUtils.setField(reportController, "reportAnalysisAuthorizationService", authorizationService);
        ReflectionTestUtils.setField(reportRestController, "reportAnalysisAuthorizationService",
                authorizationService);
        ReflectionTestUtils.setField(statisticsReportRestController, "reportAnalysisAuthorizationService",
                authorizationService);
    }

    @Test
    public void legacyGet_checksAnalysisAuthorizationBeforeCreatingPdf() {
        ReportForm form = protectedReport();
        MockHttpServletRequest request = requestForSystemUser(7);
        request.addParameter("report", form.getReport());
        BindingResult bindingResult = mock(BindingResult.class);
        when(bindingResult.hasErrors()).thenReturn(false);
        doThrow(new AccessDeniedException("denied")).when(authorizationService).authorize(form, "7", reportCreator,
                form.getReport());

        assertThrows(AccessDeniedException.class,
                () -> reportController.showReportPrint(request, new MockHttpServletResponse(), form, bindingResult,
                        mock(SessionStatus.class)));

        verify(authorizationService).authorize(form, "7", reportCreator, form.getReport());
    }

    @Test
    public void restPost_checksAnalysisAuthorizationBeforeCreatingPdf() {
        ReportForm form = protectedReport();
        MockHttpServletRequest request = requestForSystemUser(7);
        doThrow(new AccessDeniedException("denied")).when(authorizationService).authorize(form, "7", reportCreator,
                form.getReport());

        assertThrows(AccessDeniedException.class, () -> reportRestController.showReportPrint(form, request,
                new MockHttpServletResponse()));

        verify(authorizationService).authorize(form, "7", reportCreator, form.getReport());
    }

    @Test
    public void statisticsPreview_checksReportAuthorizationBeforeLoadingData() {
        MockHttpServletRequest request = requestForSystemUser(7);
        doThrow(new AccessDeniedException("denied")).when(authorizationService).authorize(any(ReportForm.class),
                eq("7"), eq(statisticsReport), eq("statisticsReport"));

        assertThrows(AccessDeniedException.class,
                () -> statisticsReportRestController.workload("2026", List.of("301"),
                        List.of(OrderPriority.ROUTINE), List.of(ReceptionTime.NORMAL_WORK_HOURS), request));

        verify(authorizationService).authorize(any(ReportForm.class), eq("7"), eq(statisticsReport),
                eq("statisticsReport"));
    }

    @Test
    public void legacyGet_returnsBadRequestBeforeAuthorizationWhenAnalysisIdsAreMalformed() throws Exception {
        ReportForm form = protectedReport();
        MockHttpServletRequest request = requestForSystemUser(7);
        MockHttpServletResponse response = new MockHttpServletResponse();
        BindingResult bindingResult = mock(BindingResult.class);
        when(bindingResult.hasErrors()).thenReturn(true);
        ReflectionTestUtils.setField(reportController, "request", request);
        PageBuilderService pageBuilderService = mock(PageBuilderService.class);
        when(pageBuilderService.setupJSPPage(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(request))).thenReturn("report-error");
        ReflectionTestUtils.setField(reportController, "pageBuilderService", pageBuilderService);

        reportController.showReportPrint(request, response, form, bindingResult, mock(SessionStatus.class));

        assertEquals(400, response.getStatus());
        verifyZeroInteractions(authorizationService);
    }

    private ReportForm protectedReport() {
        ReportForm form = new ReportForm();
        form.setReport("patientCILNSP_vreduit");
        form.setAnalysisIds(List.of("101"));
        return form;
    }

    private MockHttpServletRequest requestForSystemUser(int systemUserId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        UserSessionData sessionData = new UserSessionData();
        sessionData.setSytemUserId(systemUserId);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionData);
        return request;
    }

    private static class TestReportController extends ReportController {
        private final IReportCreator reportCreator;

        TestReportController(IReportCreator reportCreator) {
            this.reportCreator = reportCreator;
        }

        @Override
        protected IReportCreator getReportCreator(String requestedReport) {
            return reportCreator;
        }
    }

    private static class TestReportRestController extends ReportRestController {
        private final IReportCreator reportCreator;

        TestReportRestController(IReportCreator reportCreator) {
            this.reportCreator = reportCreator;
        }

        @Override
        protected IReportCreator getReportCreator(String requestedReport) {
            return reportCreator;
        }
    }

    private static class TestStatisticsReportRestController extends StatisticsReportRestController {
        private final StatisticsReport statisticsReport;

        TestStatisticsReportRestController(StatisticsReport statisticsReport) {
            this.statisticsReport = statisticsReport;
        }

        @Override
        protected StatisticsReport createStatisticsReport() {
            return statisticsReport;
        }
    }
}
