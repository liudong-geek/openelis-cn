package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Date;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.form.BaseForm;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qaevent.controller.CorrectiveActionController;
import org.openelisglobal.qaevent.controller.rest.NonConformingEventsCorrectionActionRestController;
import org.openelisglobal.qaevent.form.NonConformingEventForm;
import org.openelisglobal.qaevent.service.*;
import org.openelisglobal.qaevent.valueholder.NcEvent;
import org.openelisglobal.qaevent.valueholder.NceActionLog;
import org.openelisglobal.qaevent.worker.NonConformingEventWorkerImpl;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.ModelAndView;

/**
 * Actual GET controllers and worker mapping; persistence and display lists are
 * mocked.
 */
public class NonConformingEventCompletionDateTest {
    private AutowireCapableBeanFactory previousFactory;
    private DisplayListService previousLists;
    private final AtomicReference<String> locale = new AtomicReference<>("zh-CN");
    private final NCEventService events = mock(NCEventService.class);
    private final NceActionLogService logs = mock(NceActionLogService.class);
    private final NonConformingEventWorkerImpl worker = new NonConformingEventWorkerImpl();
    private NcEvent event;
    private NceActionLog action;

    @Before
    public void setup() {
        previousFactory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class, "factory");
        previousLists = (DisplayListService) ReflectionTestUtils.getField(DisplayListService.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        var configuration = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(factory.getBean(NCEventService.class)).thenReturn(events);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenAnswer(call -> locale.get());
        when(configuration.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(DisplayListService.class, "instance", mock(DisplayListService.class));
        var users = mock(SystemUserService.class);
        var user = new SystemUser();
        user.setId("7");
        user.setFirstName("SIM");
        user.setLastName("Operator");
        when(users.getUserById("7")).thenReturn(user);
        ReflectionTestUtils.setField(worker, "ncEventService", events);
        ReflectionTestUtils.setField(worker, "nceActionLogService", logs);
        ReflectionTestUtils.setField(worker, "systemUserService", users);
        ReflectionTestUtils.setField(worker, "nceCategoryService", mock(NceCategoryService.class));
        ReflectionTestUtils.setField(worker, "nceTypeService", mock(NceTypeService.class));
        ReflectionTestUtils.setField(worker, "nceSpecimenService", mock(NceSpecimenService.class));
        event = new NcEvent();
        event.setId(701);
        event.setNceNumber("SIM-NCE-701");
        event.setLabOrderNumber("SIM-ORDER-701");
        event.setReportDate(Date.valueOf("2026-10-13"));
        event.setDateOfEvent(Date.valueOf("2026-10-12"));
        event.setDateCompleted(Date.valueOf("2026-10-16"));
        when(events.getMatch("nceNumber", "SIM-NCE-701")).thenReturn(Optional.of(event));
        action = new NceActionLog();
        action.setId(801);
        action.setNcEventId(701);
        action.setDateCompleted(Date.valueOf("2026-10-15"));
        when(logs.getAllMatching("ncEventId", 701)).thenReturn(List.of(action));
    }

    @After
    public void cleanup() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        ReflectionTestUtils.setField(DisplayListService.class, "instance", previousLists);
    }

    private MockHttpServletRequest request() {
        var request = new MockHttpServletRequest();
        var session = new UserSessionData();
        session.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, session);
        request.setParameter("nceNumber", "SIM-NCE-701");
        return request;
    }

    private void assertCompletedForm(NonConformingEventForm form) {
        assertEquals("2026/10/16", form.getDateCompleted());
        assertEquals("2026/10/13", form.getReportDate());
        assertEquals("2026/10/12", form.getDateOfEvent());
        assertEquals("701", form.getId());
        assertEquals("SIM-NCE-701", form.getNceNumber());
        assertEquals("7", form.getCurrentUserId());
        assertSame(action, form.getActionLog().get(0));
        assertEquals(Date.valueOf("2026-10-15"), action.getDateCompleted());
        verify(events, never()).update(any(NcEvent.class));
        verify(events, never()).save(any(NcEvent.class));
        verify(logs, never()).save(any(NceActionLog.class));
    }

    @Test
    public void restGetReturnsStoredCompletionDateInChineseDisplayFormat() throws Exception {
        var controller = new NonConformingEventsCorrectionActionRestController();
        ReflectionTestUtils.setField(controller, "nonConformingEventWorker", worker);
        var response = controller.getNCECorrectiveActionForm("SIM-NCE-701", request());
        assertEquals(200, response.getStatusCode().value());
        assertCompletedForm((NonConformingEventForm) response.getBody());
    }

    @Test
    public void legacyGetUsesSameWorkerCompletionMapping() throws Exception {
        var controller = new CorrectiveActionController() {
            @Override
            protected ModelAndView findForward(String forward, BaseForm form) {
                return new ModelAndView("SIM-view", "form", form);
            }
        };
        ReflectionTestUtils.setField(controller, "nonConformingEventWorker", worker);
        var view = controller.showNCECorrectiveAction(request());
        assertCompletedForm((NonConformingEventForm) view.getModel().get("form"));
    }

    @Test
    public void absentCompletionDateClearsStaleDisplayWithoutInventingDate() throws Exception {
        event.setDateCompleted(null);
        var form = new NonConformingEventForm();
        form.setCurrentUserId("7");
        form.setDateCompleted("stale");
        worker.initFormForCorrectiveAction("SIM-NCE-701", form);
        assertEquals("", form.getDateCompleted());
        assertNull(event.getDateCompleted());
        assertSame(action, form.getActionLog().get(0));
        verify(events, never()).update(any(NcEvent.class));
        verify(logs, never()).save(any(NceActionLog.class));
    }

    @Test
    public void completionReadUsesConfiguredLocaleRatherThanPostWireFormat() throws Exception {
        var form = new NonConformingEventForm();
        form.setCurrentUserId("7");
        locale.set("fr-FR");
        worker.initFormForCorrectiveAction("SIM-NCE-701", form);
        assertEquals("16/10/2026", form.getDateCompleted());
        locale.set("en-US");
        worker.initFormForCorrectiveAction("SIM-NCE-701", form);
        assertEquals("10/16/2026", form.getDateCompleted());
        locale.set("zh_CN");
        worker.initFormForCorrectiveAction("SIM-NCE-701", form);
        assertEquals("2026/10/16", form.getDateCompleted());
    }

    @Test
    public void actualMvcGetSerializesActionDatesAsEpochWithoutChangingTopLevelLocale() throws Exception {
        var controller = new NonConformingEventsCorrectionActionRestController();
        ReflectionTestUtils.setField(controller, "nonConformingEventWorker", worker);
        var converter = new org.openelisglobal.config.AppConfig().jacksonMessageConverter();
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller)
                .setMessageConverters(converter).build();
        var response = mvc
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/rest/NCECorrectiveAction").param("nceNumber", "SIM-NCE-701")
                        .session((org.springframework.mock.web.MockHttpSession) request().getSession()))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        var json = converter.getObjectMapper().readTree(response.getContentAsByteArray());
        assertEquals("2026/10/16", json.get("dateCompleted").asText());
        var date = json.get("actionLog").get(0).get("dateCompleted");
        assertTrue(date.isIntegralNumber());
        assertEquals(Date.valueOf("2026-10-15").getTime(), date.longValue());
    }

    @Test
    public void actualMvcPostParsesIsoActionDateAndKeepsCompletionWireFormatAndSessionActor() throws Exception {
        var writes = mock(org.openelisglobal.qaevent.worker.NonConformingEventWorker.class);
        when(writes.updateCorrectiveAction(any(NonConformingEventForm.class))).thenReturn(true);
        var controller = new NonConformingEventsCorrectionActionRestController();
        ReflectionTestUtils.setField(controller, "nonConformingEventWorker", writes);
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller)
                .setMessageConverters(new org.openelisglobal.config.AppConfig().jacksonMessageConverter()).build();
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/rest/NCECorrectiveAction")
                .session((org.springframework.mock.web.MockHttpSession) request().getSession())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(
                        "{\"id\":\"701\",\"currentUserId\":\"untrusted\",\"dateCompleted\":\"16/10/2026\",\"actionLog\":[{\"id\":801,\"ncEventId\":701,\"dateCompleted\":\"2026-10-15\"}]}"))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        var captor = org.mockito.ArgumentCaptor.forClass(NonConformingEventForm.class);
        verify(writes, times(1)).updateCorrectiveAction(captor.capture());
        var parsed = captor.getValue();
        assertEquals("7", parsed.getCurrentUserId());
        assertEquals("16/10/2026", parsed.getDateCompleted());
        assertEquals(Date.valueOf("2026-10-15"), parsed.getActionLog().get(0).getDateCompleted());
        assertEquals(Integer.valueOf(801), parsed.getActionLog().get(0).getId());
        assertEquals(Integer.valueOf(701), parsed.getActionLog().get(0).getNcEventId());
    }

}
