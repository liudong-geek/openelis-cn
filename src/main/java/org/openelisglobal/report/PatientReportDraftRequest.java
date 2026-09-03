package org.openelisglobal.report;

/** Request to prepare a first release or a corrected report version. */
public record PatientReportDraftRequest(String patientId, String amendmentReason) {
}
