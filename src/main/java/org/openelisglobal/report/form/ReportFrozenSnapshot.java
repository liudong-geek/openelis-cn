package org.openelisglobal.report.form;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.report.ReportingData;

public record ReportFrozenSnapshot(int schemaVersion, ReportReleaseScope scope, String reportNumber, int reportVersion,
        String amendmentReason, ReportFrozenTemplate template, ReportingData report, List<AnalysisEvidence> analyses) {
    public record ResultEvidence(String resultId, String lastUpdated, String value, String resultType,
            String reportable, Double minimum, Double maximum, String analyteId, String testResultId,
            String parentResultId) {
        public ResultEvidence {
            if (!canonicalId(resultId) || lastUpdated == null || lastUpdated.isBlank())
                throw new IllegalArgumentException("Unversioned report result");
        }
    }

    public record AnalysisEvidence(String analysisId, String lastUpdated, String statusId, String testId,
            String sampleItemId, String sectionId, List<ResultEvidence> results) {
        public AnalysisEvidence {
            if (!canonicalId(analysisId) || lastUpdated == null || lastUpdated.isBlank() || statusId == null
                    || testId == null || sampleItemId == null || sectionId == null || results == null
                    || results.isEmpty() || results.stream().anyMatch(Objects::isNull)
                    || results.stream().map(ResultEvidence::resultId).distinct().count() != results.size())
                throw new IllegalArgumentException("Incomplete report analysis evidence");
            results = List.copyOf(results);
        }
    }

    public ReportFrozenSnapshot {
        if (schemaVersion != 1 || scope == null || reportNumber == null || reportNumber.isBlank() || reportVersion < 1
                || template == null || report == null || report.getRows() == null || report.getRows().isEmpty()
                || report.getColumns() == null || report.getColumns().isEmpty() || analyses == null
                || analyses.stream().anyMatch(Objects::isNull) || analyses.size() != scope.analysisIds().size()
                || !new HashSet<>(analyses.stream().map(AnalysisEvidence::analysisId).toList())
                        .equals(new HashSet<>(scope.analysisIds())))
            throw new IllegalArgumentException("Incomplete frozen report content");
        analyses = List.copyOf(analyses);
    }

    private static boolean canonicalId(String id) {
        return id != null && id.matches("[1-9][0-9]*");
    }
}
