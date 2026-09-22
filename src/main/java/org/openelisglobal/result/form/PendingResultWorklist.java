package org.openelisglobal.result.form;

import java.util.List;
import org.openelisglobal.test.beanItems.TestResultItem;

/**
 * The existing response fields plus a summary of these exact authorized rows.
 */
public record PendingResultWorklist(List<TestResultItem> testResult, int total, PendingResultSummary summary) {
    public PendingResultWorklist {
        testResult = List.copyOf(testResult);
        if (total != testResult.size()) {
            throw new IllegalArgumentException("Pending result total must match its rows");
        }
    }
}
