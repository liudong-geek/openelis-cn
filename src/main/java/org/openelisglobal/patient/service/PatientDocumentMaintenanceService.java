package org.openelisglobal.patient.service;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.patient.action.bean.PatientIdDocumentInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patient.valueholder.PatientIdDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Guard only the existing immediate document mutations in patient maintenance.
 */
@Service
public class PatientDocumentMaintenanceService {
    private final PatientIdDocumentService documents;
    private final PatientService patients;
    private final PatientManagementAuthorizationService authorization;

    public PatientDocumentMaintenanceService(PatientIdDocumentService documents, PatientService patients,
            PatientManagementAuthorizationService authorization) {
        this.documents = documents;
        this.patients = patients;
        this.authorization = authorization;
    }

    @Transactional
    public void update(HttpServletRequest request, String actor, Integer id, String expectedPatientId,
            String expectedVersion, PatientIdDocumentInfo info) {
        authorization.requireEdit(request, actor);
        if (info == null)
            throw new IllegalArgumentException("Missing document body");
        if (info.getId() != null && !info.getId().equals(id))
            throw conflict();
        requireDocument(id, expectedPatientId, expectedVersion);
        PatientIdDocument updated = documents.updateDocument(id, info.getData(), info.getCategory(),
                info.getDescription(), actor);
        if (updated == null || !id.equals(updated.getId()))
            throw conflict();
        authorization.requireEdit(request, actor);
    }

    @Transactional
    public void delete(HttpServletRequest request, String actor, Integer id, String expectedPatientId,
            String expectedVersion) {
        authorization.requireEdit(request, actor);
        requireDocument(id, expectedPatientId, expectedVersion);
        documents.softDeleteDocument(id, actor);
        authorization.requireEdit(request, actor);
    }

    private void requireDocument(Integer id, String expectedPatientId, String expectedVersion) {
        if (id == null || id <= 0)
            throw new IllegalArgumentException("Invalid document ID");
        PatientIdDocument document = documents.getMatch("id", id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!id.equals(document.getId()) || document.isDeleted())
            throw conflict();
        String patientId = document.getPatientId();
        if (patientId == null || !patientId.matches("[1-9][0-9]*"))
            throw conflict();
        if (expectedPatientId != null) {
            if (!expectedPatientId.matches("[1-9][0-9]*"))
                throw new IllegalArgumentException("Invalid patient ID");
            if (!expectedPatientId.equals(patientId))
                throw conflict();
            if (StringUtils.isBlank(expectedVersion))
                throw conflict();
        }
        if (StringUtils.isNotBlank(expectedVersion)) {
            Timestamp version;
            try {
                version = Timestamp.valueOf(expectedVersion);
            } catch (IllegalArgumentException e) {
                throw conflict();
            }
            if (!version.equals(document.getLastupdated()))
                throw conflict();
        }
        Patient patient = patients.get(patientId);
        if (patient == null)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!patientId.equals(patient.getId()) || Boolean.TRUE.equals(patient.getIsMerged())
                || StringUtils.isNotBlank(patient.getMergedIntoPatientId()))
            throw conflict();
    }

    private PatientMaintenanceConflictException conflict() {
        return new PatientMaintenanceConflictException("Document identity or version changed");
    }
}
