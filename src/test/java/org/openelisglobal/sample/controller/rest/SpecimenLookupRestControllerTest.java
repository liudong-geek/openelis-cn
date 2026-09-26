package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;

public class SpecimenLookupRestControllerTest {
    private SpecimenLookupService service;
    private SpecimenLookupRestController controller;
    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        service = mock(SpecimenLookupService.class);
        controller = new SpecimenLookupRestController(service);
        request = new MockHttpServletRequest("GET", "/rest/specimen-intake/lookup");
    }

    @Test
    public void routeRequiresReceptionRoleAndRejectsAdditionalQueryParameters() {
        assertEquals("hasAnyRole('RECEPTION', 'GLOBAL_ADMIN')",
                SpecimenLookupRestController.class.getAnnotation(PreAuthorize.class).value());
        request.addParameter("code", "SIM.1");
        request.addParameter("patientId", "601");
        var response = controller.lookup("SIM.1", request);
        assertEquals(400, response.getStatusCode().value());
        assertTrue(response.getHeaders().getCacheControl().contains("no-store"));
        verifyZeroInteractions(service);
    }

    @Test
    public void deniedAndUnknownFailuresNeverExposeInternalDetailsAndDisableCaching() {
        var denied = controller.denied(new org.springframework.security.access.AccessDeniedException("patient 601"));
        assertEquals(403, denied.getStatusCode().value());
        assertEquals("SPECIMEN_LOOKUP_DENIED", ((Map<?, ?>) denied.getBody()).get("code"));
        assertFalse(denied.getBody().toString().contains("601"));
        assertTrue(denied.getHeaders().getCacheControl().contains("no-store"));

        var unavailable = controller.unavailable(new IllegalStateException("SECRET"));
        assertEquals(503, unavailable.getStatusCode().value());
        assertFalse(unavailable.getBody().toString().contains("SECRET"));
        assertTrue(unavailable.getHeaders().getCacheControl().contains("no-store"));
    }
}
