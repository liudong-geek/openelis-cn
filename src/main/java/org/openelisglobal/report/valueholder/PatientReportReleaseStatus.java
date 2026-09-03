package org.openelisglobal.report.valueholder;

/** Lifecycle state of an immutable patient result report release. */
public enum PatientReportReleaseStatus {
    DRAFT,
    ISSUED,
    SUPERSEDED,
    VOIDED
}
