package org.openelisglobal.report;

import java.time.LocalDateTime;

/** Metadata bound into a formally released patient report PDF snapshot. */
public record PatientReportPdfMetadata(String reportNumber, int version, String issuerName,
        LocalDateTime issuedAt, String amendmentReason) {
}
