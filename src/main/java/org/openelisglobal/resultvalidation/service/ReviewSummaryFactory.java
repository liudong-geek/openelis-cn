package org.openelisglobal.resultvalidation.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.openelisglobal.analysis.form.ReviewPendingAccessionCount;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ReviewPendingSummary;

final class ReviewSummaryFactory {
    private ReviewSummaryFactory() {
    }

    private record Accession(String sampleId, String number) {
    }

    private record Row(String analysisId, String componentId, String resultId) {
    }

    static ReviewPendingSummary unqueried() {
        return new ReviewPendingSummary("filtered", "unqueried", null, null, null, null, Instant.now().toString());
    }

    static ReviewPendingSummary fromRows(String scope, List<AnalysisItem> rows) {
        Set<String> analyses = new HashSet<>();
        Set<String> blocked = new HashSet<>();
        Set<Accession> accessions = new HashSet<>();
        Set<Row> identities = new HashSet<>();
        Map<String, Accession> byAnalysis = new HashMap<>();
        boolean validAnalyses = true, validAccessions = true, uniqueRows = true;
        for (AnalysisItem row : rows) {
            if (row == null || !ReviewScopeService.positive(row.getAnalysisId())) {
                validAnalyses = false;
                continue;
            }
            analyses.add(row.getAnalysisId());
            if (row.isQcReleaseBlocked())
                blocked.add(row.getAnalysisId());
            Accession key = new Accession(row.getSampleId(), row.getAccessionNumber());
            if (!validAccession(key.sampleId(), key.number()))
                validAccessions = false;
            else {
                accessions.add(key);
                Accession previous = byAnalysis.putIfAbsent(row.getAnalysisId(), key);
                if (previous != null && !previous.equals(key))
                    validAccessions = false;
            }
            uniqueRows &= identities
                    .add(new Row(row.getAnalysisId(), row.getTestResultComponentId(), row.getResultId()));
        }
        return summary(scope, validAnalyses ? (long) analyses.size() : null,
                validAnalyses && validAccessions ? (long) accessions.size() : null,
                validAnalyses && uniqueRows ? (long) rows.size() : null, validAnalyses ? (long) blocked.size() : null);
    }

    private static boolean validAccession(String sampleId, String accession) {
        return ReviewScopeService.positive(sampleId) && accession != null && !accession.isBlank();
    }

    private static ReviewPendingSummary summary(String scope, Long analyses, Long accessions, Long rows, Long blocked) {
        return new ReviewPendingSummary(scope,
                analyses != null && accessions != null && rows != null && blocked != null ? "ready" : "partial",
                analyses, accessions, rows, blocked, Instant.now().toString());
    }

    static final class Accumulator implements Consumer<ReviewPendingAccessionCount> {
        private long analyses, accessions;
        private boolean validAnalyses = true, validAccessions = true;

        public void accept(ReviewPendingAccessionCount row) {
            if (row.analysisCount() <= 0)
                throw new IllegalArgumentException("Invalid review projection");
            analyses = Math.addExact(analyses, row.analysisCount());
            accessions = Math.addExact(accessions, 1);
            validAnalyses &= row.minimumAnalysisId() > 0 && row.maximumAnalysisId() <= 9999999999L;
            validAccessions &= validAccession(row.sampleId(), row.accessionNumber());
        }

        ReviewPendingSummary summary(boolean recordStatusMode) {
            if (recordStatusMode && analyses > 0)
                return ReviewSummaryFactory.summary("pending", null, null, null, null);
            return ReviewSummaryFactory.summary("pending", validAnalyses ? analyses : null,
                    validAnalyses && validAccessions ? accessions : null, analyses == 0 ? 0L : null,
                    analyses == 0 ? 0L : null);
        }
    }
}
