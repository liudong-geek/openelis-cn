package org.openelisglobal.result.service;

import static org.junit.Assert.*;

import java.time.Instant;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.analysis.form.PendingResultSpecimenCount;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.test.beanItems.TestResultItem;

public class PendingResultSummaryTest {
    @Test
    public void loadedRowsSeparateAnalysesSpecimensAndComponentRows() {
        TestResultItem first = row("1", "10", "A", "primary");
        first.setReadOnly(true);
        PendingResultSummary summary = PendingResultSummaryFactory.fromRows(List.of(first,
                row("1", "10", "A", "secondary"), row("2", "10", "A", "primary"), row("3", "11", "A", "primary")));
        assertEquals("ready", summary.state());
        assertEquals(Long.valueOf(3), summary.analysisCount());
        assertEquals(Long.valueOf(2), summary.specimenCount());
        assertEquals(Long.valueOf(4), summary.displayRowCount());
        assertNotNull(Instant.parse(summary.generatedAt()));
    }

    @Test
    public void specimenIdentityIncludesAccessionAndDoesNotMergeMissingIds() {
        PendingResultSummary summary = PendingResultSummaryFactory
                .fromRows(List.of(row("1", "10", "A", null), row("2", "10", "B", null)));
        assertEquals(Long.valueOf(2), summary.specimenCount());
        summary = PendingResultSummaryFactory
                .fromRows(List.of(row("1", null, "A", "one"), row("1", null, "A", "two"), row("2", "0", "A", null)));
        assertEquals("partial", summary.state());
        assertNull(summary.specimenCount());
        assertEquals(2, summary.missingSpecimenAnalysisCount());
        assertEquals(Long.valueOf(2), summary.analysisCount());
    }

    @Test
    public void invalidAnalysisAndDuplicateRowKeysCannotClaimCompleteCounts() {
        PendingResultSummary invalid = PendingResultSummaryFactory.fromRows(List.of(row("bad", "1", "A", null)));
        assertNull(invalid.analysisCount());
        assertEquals("partial", invalid.state());
        PendingResultSummary duplicate = PendingResultSummaryFactory
                .fromRows(List.of(row("1", "1", "A", null), row("1", "1", "A", "")));
        assertNull(duplicate.displayRowCount());
        assertEquals("partial", duplicate.state());
    }

    @Test
    public void lightweightCountsHaveBoundedAccumulatorAndNeverClaimDisplayRows() {
        PendingResultSummaryFactory.Accumulator counts = new PendingResultSummaryFactory.Accumulator();
        for (int i = 1; i <= 10000; i++) {
            counts.accept(new PendingResultSpecimenCount(String.valueOf(i), "A", 3, 1, 30000));
        }
        PendingResultSummary summary = counts.summary();
        assertEquals(Long.valueOf(30000), summary.analysisCount());
        assertEquals(Long.valueOf(10000), summary.specimenCount());
        assertNull(summary.displayRowCount());
        assertEquals("partial", summary.state());
    }

    @Test
    public void missingProjectionIdentitiesAreNotConvertedIntoFalseSpecimens() {
        PendingResultSummaryFactory.Accumulator counts = new PendingResultSummaryFactory.Accumulator();
        counts.accept(new PendingResultSpecimenCount(null, "", 4, 1, 4));
        PendingResultSummary summary = counts.summary();
        assertNull(summary.specimenCount());
        assertEquals(4, summary.missingSpecimenAnalysisCount());
        assertEquals("partial", summary.state());
    }

    @Test
    public void absentAccessionAndConflictingAnalysisIdentityRemainPartial() {
        for (String accession : new String[] { null, "", "  " }) {
            PendingResultSummary full = PendingResultSummaryFactory.fromRows(List.of(row("1", "10", accession, null)));
            assertNull(full.specimenCount());
            assertEquals(1, full.missingSpecimenAnalysisCount());
            PendingResultSummaryFactory.Accumulator counts = new PendingResultSummaryFactory.Accumulator();
            counts.accept(new PendingResultSpecimenCount("10", accession, 2, 1, 2));
            assertNull(counts.summary().specimenCount());
            assertEquals(2, counts.summary().missingSpecimenAnalysisCount());
        }
        PendingResultSummary conflict = PendingResultSummaryFactory
                .fromRows(List.of(row("1", "10", "A", "one"), row("1", "11", "A", "two")));
        assertNull(conflict.specimenCount());
        assertEquals(1, conflict.missingSpecimenAnalysisCount());
        assertEquals("partial", conflict.state());
    }

    @Test
    public void confirmedEmptyCountsAreReadyAndNullDisplayCountCannotBeReady() {
        PendingResultSummary summary = new PendingResultSummaryFactory.Accumulator().summary();
        assertEquals("ready", summary.state());
        assertEquals(Long.valueOf(0), summary.analysisCount());
        assertEquals(Long.valueOf(0), summary.specimenCount());
        assertEquals(Long.valueOf(0), summary.displayRowCount());
        assertThrows(IllegalArgumentException.class,
                () -> new PendingResultSummary("pending", "ready", 1L, 1L, null, 0, Instant.now().toString()));
    }

    private TestResultItem row(String analysisId, String specimenId, String accession, String component) {
        TestResultItem row = new TestResultItem();
        row.setAnalysisId(analysisId);
        row.setSampleItemId(specimenId);
        row.setAccessionNumber(accession);
        row.setTestResultComponentId(component);
        return row;
    }
}
