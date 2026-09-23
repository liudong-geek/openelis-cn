package org.openelisglobal.analysis.form;

/** Internal scalar stream; no patient/result objects are materialized. */
public record ReviewPendingAccessionCount(String sampleId, String accessionNumber, long analysisCount,
        long minimumAnalysisId, long maximumAnalysisId) {
}
