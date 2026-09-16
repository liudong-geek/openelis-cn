package org.openelisglobal.report.dao;

import java.util.List;
import org.openelisglobal.common.dao.BaseDAO;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseDAO extends BaseDAO<PatientReportRelease, Long> {
    int getNextVersion(String documentId);

    PatientReportRelease getDraft(String documentId);

    PatientReportRelease getLatestIssued(String documentId);

    PatientReportRelease getLatestReleased(String documentId);

    List<PatientReportRelease> getByDocument(String documentId);
}
