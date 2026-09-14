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

    record IntakeTube(String itemId, String sampleId, String labNo, String registered, String typeId, Boolean active,
            String collected, String received, String version, String parentId, String rejectReason, String domain,
            String clinicalDomain) {
    }

    record IntakeRequest(String id, String sampleId, String itemId, String typeId,
            org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status status, String tests,
            String version) {
    }

    record IntakeTest(String id, String testId, String active) {
    }

    record IntakeState(IntakeTube tube, java.util.List<String> patients, java.util.List<IntakeRequest> requests,
            java.util.List<IntakeTest> tests,
            java.util.List<org.openelisglobal.sample.valueholder.SpecimenIntakeDecision> decisions) {
    }

    IntakeState findIntakeState(String sampleItemId);

    /**
     * Compare managed critical facts without refreshing away pending result edits.
     */
    IntakeState managedIntakeState(String sampleItemId);

    void flush();
}
