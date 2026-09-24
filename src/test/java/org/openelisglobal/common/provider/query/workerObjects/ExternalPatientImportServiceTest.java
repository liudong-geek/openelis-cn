package org.openelisglobal.common.provider.query.workerObjects;

import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.address.service.AddressPartService;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.provider.query.ExtendedPatientSearchResults;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.service.PatientIdentityService;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.person.service.PersonService;

public class ExternalPatientImportServiceTest {

    @Test
    public void persistenceFailureIsPropagatedInsteadOfReturningAnUnpersistedPatient() {
        PatientService patientService = mock(PatientService.class);
        PatientIdentityService patientIdentityService = mock(PatientIdentityService.class);
        PersonService personService = mock(PersonService.class);
        AddressPartService addressPartService = mock(AddressPartService.class);
        when(addressPartService.getAll()).thenReturn(List.of());
        LIMSRuntimeException failure = new LIMSRuntimeException("simulated patient insert failure");
        when(patientService.insert(any(Patient.class))).thenThrow(failure);
        ExternalPatientImportService service = new ExternalPatientImportService(patientService, patientIdentityService,
                personService, addressPartService);
        ExtendedPatientSearchResults result = new ExtendedPatientSearchResults();
        result.setFirstName("External");
        result.setLastName("Patient");

        LIMSRuntimeException thrown = assertThrows(LIMSRuntimeException.class,
                () -> service.importPatients(List.of(result), "7"));

        assertSame(failure, thrown);
        verify(personService).insert(any());
        verify(patientIdentityService, never()).insert(any(PatientIdentity.class));
    }
}
