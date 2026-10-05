package org.openelisglobal.patient.service;

import jakarta.servlet.http.HttpServletRequest;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keep patient maintenance and its current grant checks in one core
 * transaction.
 */
@Service
public class PatientMaintenanceService {
    private final PatientService patients;
    private final PatientManagementAuthorizationService authorization;

    public PatientMaintenanceService(PatientService patients, PatientManagementAuthorizationService authorization) {
        this.patients = patients;
        this.authorization = authorization;
    }

    @Transactional
    public Patient persistPatientData(PatientManagementInfo info, String actor, HttpServletRequest request) {
        boolean editing = StringUtils.isNotBlank(info.getPatientPK());
        requirePermission(request, actor, editing);
        Patient patient = patients.persistPatientMaintenanceData(info, actor);
        // Adding sets patientPK, but still requires the original ADD grant here.
        requirePermission(request, actor, editing);
        return patient;
    }

    private void requirePermission(HttpServletRequest request, String actor, boolean editing) {
        if (editing)
            authorization.requireEdit(request, actor);
        else
            authorization.requireCreate(request, actor);
    }
}
