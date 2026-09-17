package org.openelisglobal.report.form;

import java.sql.Timestamp;

public record ReportFrozenResponse(Long releaseId, String documentId, String snapshotSha256, Timestamp frozenAt,
        ReportFrozenSnapshot snapshot) {
}
