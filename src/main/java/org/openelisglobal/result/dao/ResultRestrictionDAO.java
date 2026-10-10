package org.openelisglobal.result.dao;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.Optional;

/**
 * Narrow scalar reads avoid provider/patient graph hydration and pending
 * writes.
 */
public interface ResultRestrictionDAO {
    record AnalysisFacts(String analysisId, String testId, String sectionId, String sampleItemId, String sampleId,
            String labNumber, Timestamp analysisVersion, Timestamp sampleVersion, Timestamp itemVersion,
            String analysisStatusId, String specimenStatusId, Boolean rejected, Boolean voided, Timestamp releasedDate,
            Date printedDate, String sortOrder) {
    }

    record StatusFacts(String id, String type, String code, String name, String isActive) {
    }

    Optional<AnalysisFacts> findAnalysis(String analysisId);

    Optional<StatusFacts> findStatus(String id);

    void refresh(Object value);
}
