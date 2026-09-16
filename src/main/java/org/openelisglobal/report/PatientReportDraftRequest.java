package org.openelisglobal.report;

/**
 * Patient-only requests are rejected; documentId must come from server
 * preparation.
 */
public record PatientReportDraftRequest(String documentId, String patientId, String amendmentReason) {
}
