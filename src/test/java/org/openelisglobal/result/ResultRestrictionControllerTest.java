package org.openelisglobal.result;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.result.controller.rest.ResultRestrictionRestController;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.service.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;

public class ResultRestrictionControllerTest {
    private ResultRestrictionService service;
    private ResultRestrictionRestController controller;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        service = mock(ResultRestrictionService.class);
        controller = new ResultRestrictionRestController(service);
        request = new MockHttpServletRequest();
        request.addParameter("queryVersion", "2");
        request.addParameter("sampleItemId", "2");
        request.addParameter("testId", "3");
        request.addParameter("labNumber", "RAW-1");
        request.addParameter("analysisLastupdated", "1700000000000");
    }

    @Test
    public void malformedRequestHasNoOwnerAndNeverCallsService() {
        request.addParameter("currentUserId", "7");
        var r = controller.inspect("1", request);
        assertEquals(400, r.getStatusCode().value());
        assertEquals("no-store", r.getHeaders().getCacheControl());
        assertFalse(((Map<?, ?>) r.getBody()).containsKey("currentUserId"));
        verifyZeroInteractions(service);
    }

    @Test
    public void readsThroughServiceAndDisablesCaching() {
        var r = controller.inspect("1", request);
        assertEquals(200, r.getStatusCode().value());
        assertEquals("no-store", r.getHeaders().getCacheControl());
        verify(service).inspect(new ResultRestrictionRequest("1", "2", "3", "RAW-1", "1700000000000"), request);
    }

    @Test
    public void deniedCurrentActorCannotExposeData() {
        doThrow(new AccessDeniedException("private-detail")).when(service).inspect(any(), eq(request));
        var r = controller.inspect("1", request);
        assertEquals(403, r.getStatusCode().value());
        assertEquals("RESULT_RESTRICTION_DENIED", ((Map<?, ?>) r.getBody()).get("code"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }

    @Test
    public void exactConflictKeepsOnlyAuthoritativelyBoundOwner() {
        request.setAttribute("resultRestrictionCurrentUserId", "7");
        doThrow(new ResultRestrictionException(409, "RESULT_RESTRICTION_VERSION_CHANGED")).when(service).inspect(any(),
                eq(request));
        var r = controller.inspect("1", request);
        assertEquals(409, r.getStatusCode().value());
        assertEquals("7", ((Map<?, ?>) r.getBody()).get("currentUserId"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }

    @Test
    public void databaseErrorIsUnavailableNotEmptyOrStackTrace() {
        doThrow(new IllegalStateException("database detail")).when(service).inspect(any(), eq(request));
        var r = controller.inspect("1", request);
        assertEquals(503, r.getStatusCode().value());
        assertEquals("RESULT_RESTRICTION_UNAVAILABLE", ((Map<?, ?>) r.getBody()).get("code"));
        assertFalse(r.getBody().toString().contains("database detail"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }
}
