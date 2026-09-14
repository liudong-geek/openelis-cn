package org.openelisglobal.result.dao;

import java.sql.Timestamp;
import java.util.Date;

/**
 * Scalar reads expose persisted state without flushing pending changes. Lock
 * methods also return managed entities so callers can check unflushed changes.
 */
public interface OrdinaryResultSaveStateDAO {
    record State(String analysisId, String statusId, Timestamp releasedDate, Date printedDate) {
    }

    State findState(String analysisId);

    /**
     * Raw persisted ownership and specimen lifecycle, not an acceptance decision.
     */
    record SpecimenState(String analysisId, String testId, String sampleItemId, String sampleId, String statusId,
            Boolean rejected, Boolean voided) {
    }

    SpecimenState findSpecimenState(String analysisId);

    org.openelisglobal.sampleitem.valueholder.SampleItem lockSpecimen(String sampleItemId);

    org.openelisglobal.analysis.valueholder.Analysis lockAnalysis(String analysisId);
}
