package org.openelisglobal.report.form;

import java.util.List;
import org.openelisglobal.reports.service.ReportScopeDefinition;

/**
 * Server-persisted, complete membership evidence belonging to one release.
 * Never request-bound.
 */
public record ReportReleaseScope(int schemaVersion, String documentId, String patientId, String sampleId,
        String groupKey, String ruleVersion, List<String> analysisIds) {
    public ReportReleaseScope {
        if (schemaVersion != 1 || documentId == null || !documentId.matches("[1-9][0-9]*")) {
            throw new IllegalArgumentException("Invalid report membership snapshot");
        }
        var scope = new ReportScopeDefinition(patientId, sampleId, groupKey, ruleVersion, analysisIds);
        analysisIds = scope.analysisIds();
    }

    public static ReportReleaseScope from(ReportDocumentSummary document) {
        return new ReportReleaseScope(1, document.id(), document.patientId(), document.sampleId(), document.groupKey(),
                document.ruleVersion(), document.analysisIds());
    }

    public ReportScopeDefinition authorizationScope() {
        return new ReportScopeDefinition(patientId, sampleId, groupKey, ruleVersion, analysisIds);
    }
}
