package org.openelisglobal.fhir.providers;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.server.exceptions.ResourceNotFoundException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import org.hl7.fhir.r4.model.*;
import org.junit.Test;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.springframework.test.util.ReflectionTestUtils;

public class UnissuedFhirBoundaryTest {
    @Test
    public void liveObservationIsNotAnIssuedReport() throws Exception {
        var provider = new ObservationProvider();
        var results = mock(ResultService.class);
        var transform = mock(FhirTransformService.class);
        Result result = new Result();
        when(results.getResultByFhirUuid("live-result")).thenReturn(result);
        when(transform.transformResultToObservation(result))
                .thenReturn(new Observation().setStatus(Observation.ObservationStatus.FINAL));
        ReflectionTestUtils.setField(provider, "resultService", results);
        ReflectionTestUtils.setField(provider, "fhirTransformService", transform);
        assertThrows(ResourceNotFoundException.class, () -> provider.read(new IdType("Observation/live-result")));
        verifyZeroInteractions(transform);
    }

    @Test
    public void observationSearchDoesNotExposeStagedStore() {
        var provider = new ObservationProvider();
        var util = mock(org.openelisglobal.dataexchange.fhir.FhirUtil.class);
        var request = new org.springframework.mock.web.MockHttpServletRequest();
        Bundle staged = new Bundle().setType(Bundle.BundleType.SEARCHSET);
        staged.addEntry().setResource(new Observation().setStatus(Observation.ObservationStatus.PRELIMINARY));
        when(util.forwardSearchToFhirStore(request)).thenReturn(staged);
        ReflectionTestUtils.setField(provider, "util", util);
        assertThrows(UnprocessableEntityException.class, () -> provider.search(null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, request));
        verifyZeroInteractions(util);
    }
}
