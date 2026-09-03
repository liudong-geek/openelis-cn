package org.openelisglobal.fhir.providers;

import static org.junit.Assert.assertThrows;

import ca.uhn.fhir.rest.server.exceptions.MethodNotAllowedException;
import org.hl7.fhir.r4.model.IdType;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

public class ObservationProviderSafetyTest {
    @Test
    public void deviceDeleteCannotRemoveReviewedOrUnreviewedResults() {
        assertThrows(MethodNotAllowedException.class,
                () -> new ObservationProvider().delete(
                        new IdType("Observation", "6769b995-6cbf-4a3c-a115-22e6707b1b81"),
                        new MockHttpServletRequest()));
    }
}
