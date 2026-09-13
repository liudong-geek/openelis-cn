package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.exception.SampleCollectionValidationException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.servlet.mvc.support.RedirectAttributesModelMap;

/** Actual dispatch/error mapping only; no authentication filter or database claim. */
public class SampleCollectionDispatchTest {
    private SamplePatientEntryRestController controller;
    private SamplePatientEntryService service;
    private SamplePatientEntryFormValidator validator;
    private SamplePatientEntryForm form;
    private MockHttpServletRequest request;

    @Before public void setup() {
        controller = new SamplePatientEntryRestController();
        service = mock(SamplePatientEntryService.class);
        validator = mock(SamplePatientEntryFormValidator.class);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "samplePatientService", service);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "formValidator", validator);
        request = new MockHttpServletRequest(); request.getSession();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("SIM-only", "SIM-only"));
        form = new SamplePatientEntryForm(); form.setCollectionOnly(true); form.setSampleXML("<samples />");
        var order = new SampleOrderItem(); order.setSampleId("1"); order.setLabNo("SIM-COLLECT");
        order.setReferringSiteCode("SIM-stale-do-not-copy"); form.setSampleOrderItems(order);
    }

    @After public void cleanup() { SecurityContextHolder.clearContext(); }

    @Test public void unauthenticatedRequestDoesNotStartBusinessWorkOrCreateSession() throws Exception {
        SecurityContextHolder.clearContext(); request = new MockHttpServletRequest();
        var response = invoke(); assertEquals(401, response.getStatusCode().value());
        assertNull(request.getSession(false)); verifyZeroInteractions(service, validator);
    }

    @Test public void collectionDispatchPassesOriginalRequestWithoutOrdinaryPatientForm() throws Exception {
        when(service.persistCollection("1", "SIM-COLLECT", "<samples />", request))
                .thenReturn(Map.of("sampleId", "1", "labNo", "SIM-COLLECT"));
        var response = invoke(); assertEquals(200, response.getStatusCode().value());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        verify(service).persistCollection("1", "SIM-COLLECT", "<samples />", request);
        verifyNoMoreInteractions(service); verifyZeroInteractions(validator);
    }

    @Test public void failuresNeverFallThroughToOrdinarySaveOrLeakPrivateDetails() throws Exception {
        for (RuntimeException failure : new RuntimeException[] {
                new SampleCollectionValidationException(409, "collection.requestChanged"),
                new AccessDeniedException("SIM-PRIVATE-identity"), new IllegalStateException("SIM-PRIVATE-database") }) {
            reset(service); when(service.persistCollection("1", "SIM-COLLECT", "<samples />", request)).thenThrow(failure);
            var response = invoke();
            int expected = failure instanceof SampleCollectionValidationException ? 409 : failure instanceof AccessDeniedException ? 403 : 503;
            assertEquals(expected, response.getStatusCode().value());
            assertEquals(false, ((Map<?, ?>) response.getBody()).get("success"));
            assertFalse(response.getBody().toString().contains("SIM-PRIVATE"));
            assertEquals("no-store", response.getHeaders().getCacheControl());
            verify(service).persistCollection("1", "SIM-COLLECT", "<samples />", request);
            verifyNoMoreInteractions(service); verifyZeroInteractions(validator);
        }
    }

    @Test public void collectionCannotAlsoCreateRequestedSpecimens() throws Exception {
        form.setRequestedSpecimens(java.util.List.of());
        assertEquals(400, invoke().getStatusCode().value()); verifyZeroInteractions(service, validator);
    }

    private ResponseEntity<?> invoke() throws Exception {
        return controller.samplePatientEntrySave(request, form, new BeanPropertyBindingResult(form, "form"),
                new RedirectAttributesModelMap());
    }
}
