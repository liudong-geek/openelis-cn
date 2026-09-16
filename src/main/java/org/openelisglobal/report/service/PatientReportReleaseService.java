package org.openelisglobal.report.service;

import java.util.List;
import org.openelisglobal.common.service.BaseObjectService;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseService extends BaseObjectService<PatientReportRelease, Long> {
    PatientReportReleaseSummary createDocumentDraft(String documentId, String amendmentReason, String sysUserId);

    PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String sysUserId);

    PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String sysUserId);

    List<PatientReportReleaseSummary> getByDocument(String documentId, String sysUserId);

    byte[] getIssuedPdf(Long releaseId, String sysUserId);

    byte[] recordPrint(Long releaseId, String sysUserId);
}
