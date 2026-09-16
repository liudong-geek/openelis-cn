package org.openelisglobal.report.form;

import java.sql.Timestamp;
import java.util.List;

public record ReportDocumentSummary(String id, String patientId, String sampleId, String groupKey, String ruleVersion,
        String reportNumber, Timestamp lastUpdated, List<String> analysisIds) {
    public ReportDocumentSummary {
        analysisIds = List.copyOf(analysisIds);
    }
}
