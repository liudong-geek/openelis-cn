package org.openelisglobal.report.form;

import org.openelisglobal.report.PatientReportReleaseSummary;

/**
 * Permission-checked projection. Availability is recalculated on each
 * original/print request.
 */
public record ReportReleaseDetail(PatientReportReleaseSummary release, ReportReleaseScope scope,
        boolean canReviewOriginal, boolean canPrintCurrent) {
}
