package org.openelisglobal.resultreporting.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.dataexchange.resultreporting.beans.ReportingConfiguration;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.resultreporting.form.ResultReportingConfigurationForm;
import org.openelisglobal.resultreporting.service.ResultReportingConfigurationService;
import org.openelisglobal.scheduler.service.CronSchedulerService;
import org.openelisglobal.scheduler.valueholder.CronScheduler;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.openelisglobal.siteinformation.valueholder.SiteInformation;
import org.openelisglobal.siteinformation.valueholder.SiteInformationDomain;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.server.ResponseStatusException;

public class ResultReportingConfigurationRestControllerContractTest {
    private ResultReportingConfigurationRestController controller;
    private SiteInformationService information;
    private ResultReportingConfigurationService writes;
    private CronSchedulerService schedules;
    private MockHttpServletRequest request;
    private ResultReportingConfigurationForm form;
    private BeanPropertyBindingResult errors;

    @Before
    public void setup() {
        controller = new ResultReportingConfigurationRestController();
        information = mock(SiteInformationService.class);
        writes = mock(ResultReportingConfigurationService.class);
        schedules = mock(CronSchedulerService.class);
        ReflectionTestUtils.setField(controller, "schedulerService", schedules);
        ReflectionTestUtils.setField(controller, "siteInformationService", information);
        ReflectionTestUtils.setField(controller, "resultReportingConfigurationService", writes);
        request = new MockHttpServletRequest();
        var actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        ReflectionTestUtils.setField(controller, "request", request);
        form = new ResultReportingConfigurationForm();
        var channel = new ReportingConfiguration();
        channel.setEnabledId("11");
        channel.setUrlId("12");
        channel.setEnabled("enable");
        channel.setUrl("https://example.org/report");
        form.setReports(List.of(channel));
        errors = new BeanPropertyBindingResult(form, "form");
        when(information.get("11")).thenReturn(info("11", "enable", "boolean"));
        when(information.get("12")).thenReturn(info("12", "url", "text"));
    }

    @Test
    public void validationFailureReturns400BeforePersistence() {
        errors.rejectValue("reports", "invalid");
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes, information);
    }

    @Test
    public void persistenceFailureReturns500InsteadOfEchoedSuccess() {
        doThrow(new LIMSRuntimeException("simulated persistence failure")).when(writes)
                .updateInformationAndSchedulers(anyList(), anyList());
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verify(writes).updateInformationAndSchedulers(anyList(), anyList());
    }

    @Test
    public void emptyChannelsAreRejectedBeforePersistence() {
        form.setReports(List.of());
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
    }

    @Test
    public void otherConfigurationDomainCannotBeWrittenThroughChannelIdentity() {
        information.get("12").getDomain().setName("patientEntry");
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
    }

    @Test
    public void mismatchedChannelGroupIsRejectedBeforePersistence() {
        information.get("12").setGroup(2);
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
    }

    @Test
    public void duplicateConfigurationIdsAreRejectedBeforePersistence() {
        form.setReports(List.of(form.getReports().get(0), form.getReports().get(0)));
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
    }

    @Test
    public void enableAndUrlChangesPreserveFullStoredCronIncludingSecondsAndWeekday() {
        var scheduler = linkedSchedule("5 37 14 ? * MON-FRI");
        form.getReports().get(0).setEnabled("disable");
        doThrow(new LIMSRuntimeException("stop before global reload")).when(writes)
                .updateInformationAndSchedulers(anyList(), anyList());
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        assertEquals("5 37 14 ? * MON-FRI", scheduler.getCronStatement());
        assertFalse(scheduler.getActive());
        verify(writes).updateInformationAndSchedulers(anyList(), eq(List.of(scheduler)));
    }

    @Test
    public void schedulerIdCannotTargetAnotherChannelsSchedule() {
        var scheduler = linkedSchedule("0 37 14 ? * *");
        form.getReports().get(0).setSchedulerId("999");
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
        verify(schedules, never()).get("999");
        assertEquals("0 37 14 ? * *", scheduler.getCronStatement());
    }

    @Test
    public void scheduleTimeChangeIsRejectedRatherThanSilentlyRewritten() {
        var scheduler = linkedSchedule("0 37 14 ? * *");
        form.getReports().get(0).setScheduleMin("30");
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
        assertEquals("0 37 14 ? * *", scheduler.getCronStatement());
    }

    @Test
    public void scheduledFlagCannotHideAnExistingSchedule() {
        linkedSchedule("0 37 14 ? * *");
        form.getReports().get(0).setIsScheduled(false);
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(writes);
    }

    @Test
    public void neverScheduleRemainsUnchangedOnEnablementEdits() {
        var scheduler = linkedSchedule("never");
        form.getReports().get(0).setScheduleHours(null);
        form.getReports().get(0).setScheduleMin(null);
        doThrow(new LIMSRuntimeException("stop before global reload")).when(writes)
                .updateInformationAndSchedulers(anyList(), anyList());
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        assertEquals("never", scheduler.getCronStatement());
        verify(writes).updateInformationAndSchedulers(anyList(), eq(List.of(scheduler)));
    }

    @Test
    public void emptyOrMissingEnablementCannotSilentlyDisableAChannel() {
        for (String value : new String[] { null, "" }) {
            form.getReports().get(0).setEnabled(value);
            assertEquals(HttpStatus.BAD_REQUEST,
                    assertThrows(ResponseStatusException.class,
                            () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                            .getStatusCode());
        }
        verifyZeroInteractions(information, writes, schedules);
    }

    @Test
    public void missingChannelIdentityIsRejectedBeforeAnyEntityMutation() {
        form.getReports().get(0).setEnabledId(null);
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class,
                        () -> controller.showUpdateResultReportingConfiguration(request, form, errors))
                        .getStatusCode());
        verifyZeroInteractions(information, writes, schedules);
    }

    private CronScheduler linkedSchedule(String cron) {
        var scheduler = new CronScheduler();
        scheduler.setId("13");
        scheduler.setCronStatement(cron);
        information.get("12").setSchedule(scheduler);
        when(schedules.get("13")).thenReturn(scheduler);
        var channel = form.getReports().get(0);
        channel.setIsScheduled(true);
        channel.setSchedulerId("13");
        channel.setScheduleHours("14");
        channel.setScheduleMin("37");
        return scheduler;
    }

    private SiteInformation info(String id, String tag, String type) {
        var info = new SiteInformation();
        info.setId(id);
        info.setTag(tag);
        info.setValueType(type);
        info.setGroup(1);
        var domain = new SiteInformationDomain();
        domain.setName("resultReporting");
        info.setDomain(domain);
        return info;
    }
}
