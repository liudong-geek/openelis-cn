package org.openelisglobal.analysis.form;

/**
 * Internal scalar projection, consumed within the service transaction, never
 * exposed by REST.
 */
public record PendingResultSpecimenCount(String sampleItemId, String accessionNumber, long analysisCount,
        long minimumAnalysisId, long maximumAnalysisId) {
}
