package org.openelisglobal.report.form;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;

/** Original persisted bytes with an independently verified status envelope. */
public record ReportPdfContent(Long releaseId, String documentId, PatientReportReleaseStatus status, String sha256,
        boolean current, @JsonIgnore byte[] content) {
    public ReportPdfContent {
        content = content.clone();
    }

    @Override
    @JsonIgnore
    public byte[] content() {
        return content.clone();
    }
}
