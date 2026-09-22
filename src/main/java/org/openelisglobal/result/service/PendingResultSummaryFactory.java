package org.openelisglobal.result.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.openelisglobal.analysis.form.PendingResultSpecimenCount;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.test.beanItems.TestResultItem;

final class PendingResultSummaryFactory {
    private PendingResultSummaryFactory() {
    }

    private static boolean positiveId(String value) {
        return value != null && value.matches("^[1-9][0-9]{0,9}$");
    }

    private static boolean validSpecimen(String id, String accession) {
        return positiveId(id) && accession != null && !accession.isBlank();
    }

    private record SpecimenKey(String sampleItemId, String accessionNumber) {
    }

    private record RowKey(String analysisId, String componentId) {
    }

    static PendingResultSummary fromRows(List<TestResultItem> rows) {
        Set<String> analyses = new HashSet<>();
        Set<String> missingSpecimens = new HashSet<>();
        Set<SpecimenKey> specimens = new HashSet<>();
        Set<RowKey> identities = new HashSet<>();
        Map<String, SpecimenKey> analysisSpecimens = new HashMap<>();
        boolean validAnalyses = true;
        boolean uniqueRows = true;
        for (TestResultItem row : rows) {
            if (row == null || !positiveId(row.getAnalysisId())) {
                validAnalyses = false;
                continue;
            }
            analyses.add(row.getAnalysisId());
            if (validSpecimen(row.getSampleItemId(), row.getAccessionNumber())) {
                SpecimenKey identity = new SpecimenKey(row.getSampleItemId(), row.getAccessionNumber());
                specimens.add(identity);
                SpecimenKey previous = analysisSpecimens.putIfAbsent(row.getAnalysisId(), identity);
                if (previous != null && !previous.equals(identity)) {
                    missingSpecimens.add(row.getAnalysisId());
                }
            } else {
                missingSpecimens.add(row.getAnalysisId());
            }
            String component = row.getTestResultComponentId();
            uniqueRows &= identities.add(
                    new RowKey(row.getAnalysisId(), component == null || component.isEmpty() ? "primary" : component));
        }
        Long analysisCount = validAnalyses ? (long) analyses.size() : null;
        Long specimenCount = validAnalyses && missingSpecimens.isEmpty() ? (long) specimens.size() : null;
        Long rowCount = validAnalyses && uniqueRows ? (long) rows.size() : null;
        return summary(analysisCount, specimenCount, rowCount, missingSpecimens.size());
    }

    private static PendingResultSummary summary(Long analysisCount, Long specimenCount, Long rowCount,
            long missingSpecimens) {
        String state = analysisCount != null && specimenCount != null && rowCount != null ? "ready" : "partial";
        return new PendingResultSummary("pending", state, analysisCount, specimenCount, rowCount, missingSpecimens,
                Instant.now().toString());
    }

    /**
     * Constant-memory consumer of database groups, rather than a list of clinical
     * objects.
     */
    static final class Accumulator implements Consumer<PendingResultSpecimenCount> {
        private long analyses;
        private long specimens;
        private long missingSpecimens;
        private boolean validAnalyses = true;

        @Override
        public void accept(PendingResultSpecimenCount group) {
            if (group.analysisCount() <= 0) {
                throw new IllegalArgumentException("Invalid pending result count projection");
            }
            analyses = Math.addExact(analyses, group.analysisCount());
            validAnalyses &= group.minimumAnalysisId() > 0 && group.maximumAnalysisId() <= 9999999999L;
            if (validSpecimen(group.sampleItemId(), group.accessionNumber())) {
                specimens = Math.addExact(specimens, 1);
            } else {
                missingSpecimens = Math.addExact(missingSpecimens, group.analysisCount());
            }
        }

        PendingResultSummary summary() {
            // The nonempty lightweight path does not claim exact component-row counts.
            return PendingResultSummaryFactory.summary(validAnalyses ? analyses : null,
                    validAnalyses && missingSpecimens == 0 ? specimens : null, analyses == 0 ? 0L : null,
                    missingSpecimens);
        }
    }
}
