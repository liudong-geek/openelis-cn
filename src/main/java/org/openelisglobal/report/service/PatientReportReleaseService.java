package org.openelisglobal.report.service;

import java.util.List;
import org.openelisglobal.common.service.BaseObjectService;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseService extends BaseObjectService<PatientReportRelease, Long> {

    PatientReportReleaseSummary createDraft(String patientId, String amendmentReason, String sysUserId);

    PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String sysUserId);

    PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String sysUserId);

    List<PatientReportReleaseSummary> getByPatient(String patientId);

    byte[] getIssuedPdf(Long releaseId);

    byte[] recordPrint(Long releaseId, String sysUserId);
}
