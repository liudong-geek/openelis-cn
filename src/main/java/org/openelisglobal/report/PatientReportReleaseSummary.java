package org.openelisglobal.report;

import java.sql.Timestamp;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;

/** Safe API projection that deliberately excludes stored PDF bytes. */
public record PatientReportReleaseSummary(Long id, String patientId, String reportNumber, Integer reportVersion,
        PatientReportReleaseStatus status, Timestamp createdAt, String issuedByName, Timestamp issuedAt,
        Long supersedesReleaseId, String amendmentReason, Timestamp voidedAt, String voidReason, String pdfSha256,
        String accessionNumbers, Integer printCount, Timestamp lastPrintedAt) {
}
