package org.openelisglobal.sampleitem.controller;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.OptimisticLockException;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sampleitem.dto.CancelTestResponse;
import org.openelisglobal.sampleitem.dto.SearchSamplesResponse;
import org.openelisglobal.sampleitem.form.CancelTestForm;
import org.openelisglobal.sampleitem.service.SampleManagementConflictException;
import org.openelisglobal.sampleitem.service.SampleManagementService;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

public class SampleManagementRestContractTest {
    private SampleManagementRestController controller;
    private SampleManagementService service;
    private SampleEditAuthorizationService authorization;
    private MockHttpServletRequest request;

    @Before
    public void prepare() {
        controller = new SampleManagementRestController();
        service = mock(SampleManagementService.class);
        authorization = mock(SampleEditAuthorizationService.class);
        ReflectionTestUtils.setField(controller, "sampleManagementService", service);
        ReflectionTestUtils.setField(controller, "authorization", authorization);
        request = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
    }

    private MockMvc validatedMvc() {
        // The isolated test JVM has no servlet-container EL implementation.
        // Use the same actual Bean Validation provider as the existing SampleEdit
        // request-contract tests, rather than silently disabling @Valid.
        var validator = new LocalValidatorFactoryBean();
        validator.setMessageInterpolator(new ParameterMessageInterpolator());
        validator.afterPropertiesSet();
        return MockMvcBuilders.standaloneSetup(controller).setValidator(validator).build();
    }

    @Test
    public void searchReturnsCurrentPermissionWithExistingResults() {
        var response = new SearchSamplesResponse("CHG069", List.of(), 0);
        when(service.searchByAccessionNumber("CHG069", true)).thenReturn(response);
        when(authorization.canWrite(request, "7")).thenReturn(true);
        assertTrue(controller.searchSamplesByAccessionNumber("CHG069", true, request).getBody().isCanCancelTests());
        when(authorization.canWrite(request, "7")).thenReturn(false);
        assertFalse(controller.searchSamplesByAccessionNumber("CHG069", true, request).getBody().isCanCancelTests());
    }

    @Test
    public void recentReadDoesNotCreateNewReadPermissionRequirement() {
        when(service.listRecentSampleItems(50, true)).thenReturn(new SearchSamplesResponse("", List.of(), 0));
        assertFalse(controller.listRecentSampleItems(50, true, request).getBody().isCanCancelTests());
        verify(authorization, never()).requireRead(any(), any());
        verify(authorization, never()).requireWrite(any(), any());
    }

    @Test
    public void cancelDelegatesVerifiedActorAndRequestForServiceRecheck() {
        var form = new CancelTestForm("9", "8");
        var response = new CancelTestResponse("9", "SIM", true, "legacy response");
        when(service.cancelTest(form, "7", request)).thenReturn(response);
        assertSame(response, controller.cancelTest(form, request).getBody());
        verify(authorization).requireWrite(request, "7");
        verify(service).cancelTest(form, "7", request);
    }

    @Test
    public void forbiddenCancellationNeverCallsService() {
        doThrow(new AccessDeniedException("revoked")).when(authorization).requireWrite(request, "7");
        assertThrows(AccessDeniedException.class, () -> controller.cancelTest(new CancelTestForm("9", "8"), request));
        verifyZeroInteractions(service);
        var response = controller.handleAccessDeniedException(new AccessDeniedException("secret"));
        assertEquals(403, response.getStatusCode().value());
        assertEquals("SAMPLE_MANAGEMENT_FORBIDDEN", response.getBody().getCode());
        assertFalse(response.getBody().getMessage().contains("secret"));
    }

    @Test
    public void blankMissingOrMalformedCancellationBodiesAreStable400BeforeService() throws Exception {
        var mvc = validatedMvc();
        for (String body : new String[] { "{}", "{\"analysisId\":\"\",\"sampleItemId\":\"8\"}",
                "{\"analysisId\":\"9\",\"sampleItemId\":\" \"}", "{malformed", "null", "" }) {
            mvc.perform(post("/rest/sample-management/cancel-test").contentType(MediaType.APPLICATION_JSON)
                    .content(body).session((MockHttpSession) request.getSession()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("SAMPLE_MANAGEMENT_INVALID_REQUEST"));
        }
        verifyZeroInteractions(service);
    }

    @Test
    public void realMvcPermissionAndStateExceptionsUseStable403And409() throws Exception {
        var mvc = validatedMvc();
        doThrow(new AccessDeniedException("private permission diagnostic"))
                .when(authorization).requireWrite(any(), eq("7"));
        mvc.perform(post("/rest/sample-management/cancel-test").contentType(MediaType.APPLICATION_JSON)
                .content("{\"analysisId\":\"9\",\"sampleItemId\":\"8\"}")
                .session((MockHttpSession) request.getSession()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SAMPLE_MANAGEMENT_FORBIDDEN"));
        verifyZeroInteractions(service);
        doNothing().when(authorization).requireWrite(any(), eq("7"));
        when(service.cancelTest(any(), eq("7"), any()))
                .thenThrow(new SampleManagementConflictException("private state diagnostic"));
        mvc.perform(post("/rest/sample-management/cancel-test").contentType(MediaType.APPLICATION_JSON)
                .content("{\"analysisId\":\"9\",\"sampleItemId\":\"8\"}")
                .session((MockHttpSession) request.getSession()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SAMPLE_MANAGEMENT_CONFLICT"));
    }

    @Test
    public void stateAndOptimisticConflictsReturn409WithoutEnglishOrRawInternalMessage() {
        var state = controller.handleConflict(new SampleManagementConflictException("private diagnostic"));
        assertEquals(409, state.getStatusCode().value());
        assertEquals("SAMPLE_MANAGEMENT_CONFLICT", state.getBody().getCode());
        var optimistic = controller.handleOptimisticConflict(new OptimisticLockException("private diagnostic"));
        assertEquals(409, optimistic.getStatusCode().value());
        var wrapped = controller.handleGeneralException(new LIMSRuntimeException("wrapped diagnostic",
                new OptimisticLockException("private diagnostic")));
        assertEquals(409, wrapped.getStatusCode().value());
        assertEquals("SAMPLE_MANAGEMENT_CONFLICT", wrapped.getBody().getCode());
        assertFalse(wrapped.getBody().getMessage().contains("diagnostic"));
    }

    @Test
    public void invalidAndUnexpectedErrorsHaveStableCodesWithoutLeakingMessages() {
        var invalid = controller.handleIllegalArgumentException(new IllegalArgumentException("private diagnostic"));
        assertEquals(400, invalid.getStatusCode().value());
        assertEquals("SAMPLE_MANAGEMENT_INVALID_REQUEST", invalid.getBody().getCode());
        var unexpected = controller.handleGeneralException(new RuntimeException("database password"));
        assertEquals(500, unexpected.getStatusCode().value());
        assertEquals("SAMPLE_MANAGEMENT_ERROR", unexpected.getBody().getCode());
        assertFalse(unexpected.getBody().getMessage().contains("password"));
    }
}
