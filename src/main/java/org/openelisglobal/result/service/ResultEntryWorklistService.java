package org.openelisglobal.result.service;

import java.util.List;
import org.openelisglobal.common.rest.provider.form.PatientDashBoardForm;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.result.form.PendingResultWorklist;
import org.openelisglobal.test.beanItems.TestResultItem;

/** Builds task-oriented result-entry worklists for the current user. */
public interface ResultEntryWorklistService {

    /**
     * Returns analyses that are waiting for result entry and that the user is
     * authorized to process through their Results lab-unit roles.
     */
    List<TestResultItem> getPendingResultsForUser(String systemUserId);

    PendingResultWorklist getPendingWorklistForUser(String systemUserId);

    PendingResultSummary getPendingSummaryForUser(String systemUserId);

    PatientDashBoardForm getPendingDashboardPageForUser(String systemUserId, int page, int pageSize);
}
