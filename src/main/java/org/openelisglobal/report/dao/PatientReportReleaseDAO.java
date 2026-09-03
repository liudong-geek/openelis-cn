package org.openelisglobal.report.dao;

import java.util.List;
import org.openelisglobal.common.dao.BaseDAO;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseDAO extends BaseDAO<PatientReportRelease, Long> {

    void lockPatientVersion(String patientId);

    int getNextVersion(String patientId);

    PatientReportRelease getDraft(String patientId);

    PatientReportRelease getLatestIssued(String patientId);

    PatientReportRelease getLatestReleased(String patientId);

    List<PatientReportRelease> getByPatient(String patientId);
}
