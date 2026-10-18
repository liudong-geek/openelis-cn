package org.openelisglobal.report.dao;

import java.util.List;
import org.openelisglobal.common.dao.BaseDAO;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public interface PatientReportReleaseDAO extends BaseDAO<PatientReportRelease, Long> {
    PatientReportRelease lockRelease(Long releaseId);

    int getNextVersion(String documentId);

    PatientReportRelease getDraft(String documentId);

    PatientReportRelease getLatestIssued(String documentId);

    PatientReportRelease getLatestReleased(String documentId);

    List<PatientReportRelease> getByDocument(String documentId);

    /**
     * Committed formal version IDs only, in ascending keyset pages of at most 100.
     */
    List<Long> getPublicationIds(java.time.Instant through, Long afterId, int limit);

    List<PatientReportRelease> getPublishedByAnalysisUuid(java.util.UUID uuid);

    List<PatientReportRelease> findPublished(String reportNumber, String patientId, int limit);

    void flush();
}
