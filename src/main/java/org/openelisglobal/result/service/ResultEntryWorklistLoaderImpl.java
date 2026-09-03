package org.openelisglobal.result.service;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class ResultEntryWorklistLoaderImpl implements ResultEntryWorklistLoader {

    private final ObjectProvider<ResultsLoadUtility> resultsLoadUtilityProvider;

    public ResultEntryWorklistLoaderImpl(ObjectProvider<ResultsLoadUtility> resultsLoadUtilityProvider) {
        this.resultsLoadUtilityProvider = resultsLoadUtilityProvider;
    }

    @Override
    public List<TestResultItem> load(List<Analysis> analyses, String systemUserId) {
        ResultsLoadUtility resultsLoadUtility = resultsLoadUtilityProvider.getObject();
        resultsLoadUtility.setSysUser(systemUserId);
        return resultsLoadUtility.getGroupedTestsForAnalysisList(analyses, true);
    }
}
