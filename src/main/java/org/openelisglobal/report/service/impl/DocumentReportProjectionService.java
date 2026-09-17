package org.openelisglobal.report.service.impl;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Reuses the established result text/unit/reference mapping after whole-scope
 * authorization.
 */
@Service
public class DocumentReportProjectionService {
    @Autowired
    private ObjectProvider<ResultsLoadUtility> utilities;

    public List<TestResultItem> project(List<Analysis> analyses, String actor) {
        ResultsLoadUtility utility = utilities.getObject();
        utility.setSysUser(actor);
        return utility.getGroupedTestsForAnalysisList(analyses, true);
    }
}
