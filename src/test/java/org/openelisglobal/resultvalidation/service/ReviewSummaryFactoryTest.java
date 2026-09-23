package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.Test;
import org.openelisglobal.analysis.form.ReviewPendingAccessionCount;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ReviewPendingSummary;

public class ReviewSummaryFactoryTest {
    @Test
    public void distinctAnalysisAccessionRowAndQcUnitsAreIndependent() {
        List<AnalysisItem> rows = new ArrayList<>();
        for (int id : List.of(1, 2, 7, 8, 9, 10, 11, 13)) {
            String sample = id < 7 ? "1" : id < 9 ? "2" : "3";
            rows.add(row(String.valueOf(id), sample, "SIM-" + sample, "c1"));
        }
        rows.add(row("2", "1", "SIM-1", "c2"));
        rows.stream().filter(r -> "9".equals(r.getAnalysisId())).forEach(r -> r.setQcReleaseBlocked(true));
        var summary = ReviewSummaryFactory.fromRows("pending", rows);
        assertEquals("ready", summary.state());
        assertEquals(Long.valueOf(8), summary.analysisCount());
        assertEquals(Long.valueOf(3), summary.accessionCount());
        assertEquals(Long.valueOf(9), summary.displayRowCount());
        assertEquals(Long.valueOf(1), summary.qcBlockedAnalysisCount());
        Instant.parse(summary.generatedAt());
    }

    @Test
    public void missingOrConflictingAccessionIsUnknownWithoutChangingRows() {
        for (String accession : new String[] { null, "", "  " }) {
            var row = row("1", "1", accession, "c1");
            var result = ReviewSummaryFactory.fromRows("filtered", List.of(row));
            assertEquals("partial", result.state());
            assertNull(result.accessionCount());
            assertEquals(Long.valueOf(1), result.analysisCount());
            assertEquals(accession, row.getAccessionNumber());
        }
        var conflict = ReviewSummaryFactory.fromRows("pending",
                List.of(row("1", "1", "A", "c1"), row("1", "2", "B", "c2")));
        assertNull(conflict.accessionCount());
        assertEquals("partial", conflict.state());
        assertEquals(Long.valueOf(1), conflict.analysisCount());
    }

    @Test
    public void duplicateRowsAndInvalidAnalysisNeverClaimCompleteSummary() {
        var row = row("1", "1", "A", "c1");
        var duplicate = ReviewSummaryFactory.fromRows("pending", List.of(row, row));
        assertNull(duplicate.displayRowCount());
        assertEquals("partial", duplicate.state());
        var invalid = ReviewSummaryFactory.fromRows("pending", List.of(row("bad", "1", "A", "c1")));
        assertNull(invalid.analysisCount());
        assertNull(invalid.qcBlockedAnalysisCount());
    }

    @Test
    public void lightProjectionIsPartialExceptConfirmedEmptyAndRetrociNeverGuesses() {
        var count = new ReviewSummaryFactory.Accumulator();
        assertEquals("ready", count.summary(false).state());
        assertEquals(Long.valueOf(0), count.summary(true).displayRowCount());
        count.accept(new ReviewPendingAccessionCount("1", "A", 8, 1, 13));
        var normal = count.summary(false);
        assertEquals(Long.valueOf(8), normal.analysisCount());
        assertEquals(Long.valueOf(1), normal.accessionCount());
        assertEquals("partial", normal.state());
        assertNull(normal.displayRowCount());
        assertNull(normal.qcBlockedAnalysisCount());
        var retroci = count.summary(true);
        assertNull(retroci.analysisCount());
        assertNull(retroci.accessionCount());
        assertEquals("partial", retroci.state());
        count.accept(new ReviewPendingAccessionCount("2", " ", 1, 14, 14));
        assertNull(count.summary(false).accessionCount());
    }

    @Test
    public void dtoHasOnlySevenExplicitFieldsAndUnqueriedIsNotEmpty() throws Exception {
        var summary = ReviewSummaryFactory.unqueried();
        var tree = new ObjectMapper().valueToTree(summary);
        assertEquals(7, tree.size());
        var fields = new java.util.HashSet<String>();
        tree.fieldNames().forEachRemaining(fields::add);
        assertEquals(Set.of("scope", "state", "analysisCount", "accessionCount", "displayRowCount",
                "qcBlockedAnalysisCount", "generatedAt"), fields);
        assertEquals("unqueried", summary.state());
        assertNull(summary.analysisCount());
        assertThrows(IllegalArgumentException.class,
                () -> new ReviewPendingSummary("pending", "ready", 1L, 1L, null, null, "time"));
        assertThrows(IllegalArgumentException.class,
                () -> new ReviewPendingSummary("pending", "ready", 1L, 1L, 1L, 2L, "time"));
        assertThrows(IllegalArgumentException.class,
                () -> new ReviewPendingSummary("pending", "unqueried", null, null, null, null, "time"));
    }

    static AnalysisItem row(String analysis, String sample, String accession, String component) {
        AnalysisItem row = new AnalysisItem();
        row.setAnalysisId(analysis);
        row.setSampleId(sample);
        row.setAccessionNumber(accession);
        row.setTestResultComponentId(component);
        row.setResultId("r-" + analysis + component);
        return row;
    }
}
