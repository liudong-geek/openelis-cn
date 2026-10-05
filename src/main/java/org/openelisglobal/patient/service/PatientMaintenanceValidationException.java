package org.openelisglobal.patient.service;

public class PatientMaintenanceValidationException extends RuntimeException {
    private final String code;
    private final String errorKey;

    public PatientMaintenanceValidationException(String code, String errorKey) {
        super("Patient maintenance validation failed");
        this.code = code;
        this.errorKey = errorKey;
    }

    public String getCode() {
        return code;
    }

    public String getErrorKey() {
        return errorKey;
    }
}
