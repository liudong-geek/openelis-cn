package org.openelisglobal.result.form;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Counts of the current actor's pending queue; null is unknown, never zero. */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record PendingResultSummary(String scope, String state, Long analysisCount, Long specimenCount,
        Long displayRowCount, long missingSpecimenAnalysisCount, String generatedAt) {
    public PendingResultSummary {
        if (!"pending".equals(scope) || !("ready".equals(state) || "partial".equals(state)) || negative(analysisCount)
                || negative(specimenCount) || negative(displayRowCount) || missingSpecimenAnalysisCount < 0
                || generatedAt == null || ("ready".equals(state) && (analysisCount == null || specimenCount == null
                        || displayRowCount == null || missingSpecimenAnalysisCount != 0))) {
            throw new IllegalArgumentException("Invalid pending result summary");
        }
    }

    private static boolean negative(Long value) {
        return value != null && value < 0;
    }
}
