package org.openelisglobal.result.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.result.form.PendingResultWorklist;
import org.openelisglobal.result.service.ResultEntryWorklistService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

public class PendingResultRestContractTest {
    private ResultEntryRestController controller;
    private ResultEntryWorklistService service;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        service = mock(ResultEntryWorklistService.class);
        ResultEntryRestController target = new ResultEntryRestController();
        ReflectionTestUtils.setField(target, "resultEntryWorklistService", service);
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize());
        controller = (ResultEntryRestController) proxy.getProxy();
        request = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        request.setParameter("systemUserId", "999");
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void summaryRequiresResultsRoleBeforeAnyDataAccess() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_RECEPTION"));
        assertThrows(AccessDeniedException.class, () -> controller.getPendingSummary(request));
        assertThrows(AccessDeniedException.class, () -> controller.getPendingResults(request));
        verifyZeroInteractions(service);
    }

    @Test
    public void summaryUsesSessionActorAndSerializesOnlyTheSevenPublicFields() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_RESULTS"));
        PendingResultSummary expected = new PendingResultSummary("pending", "partial", 3L, 1L, null, 0,
                Instant.now().toString());
        when(service.getPendingSummaryForUser("7")).thenReturn(expected);
        assertSame(expected, controller.getPendingSummary(request));
        var json = new ObjectMapper().valueToTree(expected);
        assertEquals(7, json.size());
        for (String name : List.of("scope", "state", "analysisCount", "specimenCount", "displayRowCount",
                "missingSpecimenAnalysisCount", "generatedAt")) {
            assertTrue(json.has(name));
        }
        assertTrue(json.get("displayRowCount").isNull());
        verify(service).getPendingSummaryForUser("7");
        verifyNoMoreInteractions(service);
    }

    @Test
    public void listResponsePreservesLegacyFieldsAndDoesNotIssueASeparateCount() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "N/A", "ROLE_RESULTS"));
        PendingResultWorklist expected = new PendingResultWorklist(List.of(), 0,
                new PendingResultSummary("pending", "ready", 0L, 0L, 0L, 0, Instant.now().toString()));
        when(service.getPendingWorklistForUser("7")).thenReturn(expected);
        var json = new ObjectMapper().valueToTree(controller.getPendingResults(request));
        assertTrue(json.get("testResult").isArray());
        assertEquals(0, json.get("total").intValue());
        assertEquals("ready", json.get("summary").get("state").asText());
        verify(service).getPendingWorklistForUser("7");
        verifyNoMoreInteractions(service);
    }
}
