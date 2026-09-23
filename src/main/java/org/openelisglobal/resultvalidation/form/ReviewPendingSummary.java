package org.openelisglobal.resultvalidation.form;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.util.List;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ReviewPendingSummary(String scope, String state, Long analysisCount, Long accessionCount,
        Long displayRowCount, Long qcBlockedAnalysisCount, String generatedAt) implements Serializable {
    public ReviewPendingSummary {
        if (scope == null || state == null || !List.of("pending", "filtered").contains(scope)
                || !List.of("unqueried", "partial", "ready").contains(state) || generatedAt == null) {
            throw new IllegalArgumentException("Invalid review summary identity");
        }
        Long[] counts = { analysisCount, accessionCount, displayRowCount, qcBlockedAnalysisCount };
        int known = 0;
        for (Long count : counts) {
            if (count != null) {
                if (count < 0)
                    throw new IllegalArgumentException("Negative review count");
                known++;
            }
        }
        if ("ready".equals(state) && known != 4 || "partial".equals(state) && known == 4
                || "unqueried".equals(state) && (!"filtered".equals(scope) || known != 0)
                || analysisCount != null && qcBlockedAnalysisCount != null && qcBlockedAnalysisCount > analysisCount) {
            throw new IllegalArgumentException("Unconfirmed review summary");
        }
    }
}
