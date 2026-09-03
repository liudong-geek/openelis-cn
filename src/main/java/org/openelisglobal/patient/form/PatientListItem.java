package org.openelisglobal.patient.form;

public record PatientListItem(String patientPK, String patientId, String lastName, String firstName, String gender,
        String birthDate, String nationalId, String phoneNumber, boolean merged, String mergedIntoPatientId) {
}
