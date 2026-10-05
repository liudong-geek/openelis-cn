package org.openelisglobal.patient.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;

public class PatientMaintenanceServiceTest {
    PatientService patients;
    PatientManagementAuthorizationService authorization;
    PatientMaintenanceService maintenance;
    MockHttpServletRequest request;

    @Before
    public void setup() {
        patients = mock(PatientService.class);
        authorization = mock(PatientManagementAuthorizationService.class);
        maintenance = new PatientMaintenanceService(patients, authorization);
        request = new MockHttpServletRequest();
    }

    @Test
    public void deniedEditNeverPreparesOrPersistsPatient() {
        var info = new PatientManagementInfo();
        info.setPatientPK("42");
        doThrow(new AccessDeniedException("revoked")).when(authorization).requireEdit(request, "7");
        assertThrows(AccessDeniedException.class, () -> maintenance.persistPatientData(info, "7", request));
        verifyZeroInteractions(patients);
    }

    @Test
    public void existingRecordRechecksActualEditGrantAroundCoreSave() {
        var info = new PatientManagementInfo();
        info.setPatientPK("42");
        var patient = new Patient();
        patient.setId("42");
        when(patients.persistPatientMaintenanceData(info, "7")).thenReturn(patient);
        assertSame(patient, maintenance.persistPatientData(info, "7", request));
        var order = inOrder(authorization, patients);
        order.verify(authorization).requireEdit(request, "7");
        order.verify(patients).persistPatientMaintenanceData(info, "7");
        order.verify(authorization).requireEdit(request, "7");
        verify(authorization, never()).requireCreate(any(), any());
    }

    @Test
    public void newlyAssignedPatientPkStillRechecksOriginalAddGrant() {
        var info = new PatientManagementInfo();
        var patient = new Patient();
        patient.setId("43");
        when(patients.persistPatientMaintenanceData(info, "7")).thenAnswer(call -> {
            info.setPatientPK("43");
            return patient;
        });
        assertSame(patient, maintenance.persistPatientData(info, "7", request));
        verify(authorization, times(2)).requireCreate(request, "7");
        verify(authorization, never()).requireEdit(any(), any());
    }

    @Test
    public void permissionChangeDuringCoreSaveThrowsInsteadOfReturningSuccess() {
        var info = new PatientManagementInfo();
        info.setPatientPK("42");
        doNothing().doThrow(new AccessDeniedException("changed")).when(authorization).requireEdit(request, "7");
        assertThrows(AccessDeniedException.class, () -> maintenance.persistPatientData(info, "7", request));
        verify(patients).persistPatientMaintenanceData(info, "7");
    }
}
