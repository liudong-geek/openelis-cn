package org.openelisglobal.dataexchange.fhir.service;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.Map;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.Resource;
import org.junit.Test;
import org.openelisglobal.dataexchange.fhir.service.FhirPersistanceServiceImpl.FhirOperations;

public class FhirPersistanceServiceImplDisabledTest {

    private final FhirPersistanceServiceImpl service = new FhirPersistanceServiceImpl();

    @Test
    public void writeOperationsReturnEmptyBundlesWhenLocalStoreIsDisabled() throws Exception {
        Patient patient = new Patient();
        patient.setId("patient-1");
        Map<String, Resource> resources = Map.of("Patient/patient-1", patient);
        FhirOperations operations = new FhirOperations();
        operations.createResources.putAll(resources);

        assertEmpty(service.createFhirResourcesInFhirStore(resources));
        assertEmpty(service.updateFhirResourcesInFhirStore(resources));
        assertEmpty(service.createUpdateFhirResourcesInFhirStore(resources, Map.of()));
        assertEmpty(service.createUpdateFhirResourcesInFhirStore(operations));
        assertEmpty(service.createUpdateFhirResourcesInFhirStore(List.of(operations)));
    }

    @Test
    public void readOperationsFailClosedWhenLocalStoreIsDisabled() {
        assertTrue(service.getAllServiceRequestByAccessionNumber("LAB-1").isEmpty());
        assertFalse(service.getFhirOrganizationByName("Hospital").isPresent());
        assertFalse(service.getPatientByUuid("patient-uuid").isPresent());
        assertFalse(service.getServiceRequestByAnalysisUuid("analysis-uuid").isPresent());
        assertFalse(service.getSpecimenBySampleItemUuid("sample-item-uuid").isPresent());
        assertFalse(service.getDiagnosticReportByAnalysisUuid("analysis-uuid").isPresent());
        assertFalse(service.getTaskBasedOnServiceRequest("service-request-id").isPresent());
        assertFalse(service.getServiceRequestByReferingId("referring-id").isPresent());
        assertFalse(service.getTaskBasedOnTask("task-id").isPresent());
    }

    private void assertEmpty(Bundle bundle) {
        assertTrue(bundle.getEntry().isEmpty());
    }
}
