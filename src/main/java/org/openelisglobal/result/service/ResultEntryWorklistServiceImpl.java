package org.openelisglobal.result.service;

import java.util.List;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResultEntryWorklistServiceImpl implements ResultEntryWorklistService {

    private final AnalysisService analysisService;
    private final IStatusService statusService;
    private final UserService userService;
    private final ResultEntryWorklistLoader worklistLoader;

    public ResultEntryWorklistServiceImpl(AnalysisService analysisService, IStatusService statusService,
            UserService userService, ResultEntryWorklistLoader worklistLoader) {
        this.analysisService = analysisService;
        this.statusService = statusService;
        this.userService = userService;
        this.worklistLoader = worklistLoader;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TestResultItem> getPendingResultsForUser(String systemUserId) {
        String notStartedStatusId = statusService.getStatusID(AnalysisStatus.NotStarted);
        List<Analysis> pendingAnalyses = analysisService.getAnalysesForStatusId(notStartedStatusId);

        List<TestResultItem> pendingResults = worklistLoader.load(pendingAnalyses, systemUserId);
        List<TestResultItem> authorizedResults = userService.filterResultsByLabUnitRoles(systemUserId, pendingResults,
                Constants.ROLE_RESULTS);

        // Result entry uses the flattened TestResultItem fields. Keep the nested
        // Result reference shallow so the REST response cannot traverse the full
        // persistence graph when a previously saved analysis is reopened.
        for (TestResultItem item : authorizedResults) {
            if (item.getResult() != null) {
                Result resultReference = new Result();
                resultReference.setId(item.getResult().getId());
                item.setResult(resultReference);
            }
        }
        return authorizedResults;
    }
}
