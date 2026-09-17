package org.openelisglobal.report.service;

import java.util.List;
import org.openelisglobal.common.service.BaseObjectService;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.form.ReportPdfContent;
import org.openelisglobal.report.form.ReportReleaseDetail;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseService extends BaseObjectService<PatientReportRelease, Long> {
    PatientReportReleaseSummary createDocumentDraft(String documentId, String amendmentReason, String sysUserId);

    org.openelisglobal.report.form.ReportFrozenResponse freeze(String documentId, Long releaseId, String actor);

    org.openelisglobal.report.form.ReportFrozenResponse getSnapshot(String documentId, Long releaseId, String actor);

    byte[] previewFrozen(String documentId, Long releaseId, String actor);

    PatientReportReleaseSummary issueDocument(String documentId, Long releaseId, String snapshotSha256, String password,
            String actor, String clientIp, String userAgent);

    PatientReportReleaseSummary voidDocument(String documentId, Long releaseId, String expectedPdfSha256,
            String password, String reason, String actor, String clientIp, String userAgent);

    PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String sysUserId);

    PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String sysUserId);

    List<PatientReportReleaseSummary> getByDocument(String documentId, String sysUserId);

    ReportReleaseDetail getDetail(String documentId, Long releaseId, String actor);

    ReportPdfContent getOriginalPdf(String documentId, Long releaseId, String actor);

    ReportPdfContent recordPrint(String documentId, Long releaseId, String actor);
}
