package org.openelisglobal.common.services;

import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.serviceBeans.ResultSaveBean;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl.ResultType;

/**
 * Shared by ordinary entry, legacy entry and validation result construction.
 */
final class ResultSaveIdentityGuard {
    record LoadedResults(Result result, Result qualifiedResult, ResultSaveComponentScope componentScope) {
    }

    private ResultSaveIdentityGuard() {
    }

    static LoadedResults validate(Analysis analysis, ResultSaveBean bean, ResultService resultService,
            TestResultComponentService componentService) {
        requireAnalysisChain(analysis);
        if (bean == null || !analysis.getTest().getId().equals(bean.getTestId())) {
            throw invalid("error.results.testMismatch");
        }
        if (componentService == null) {
            throw invalid("error.results.componentMismatch");
        }
        ResultSaveComponentScope scope = new ResultSaveComponentScope(bean.getTestId(), bean.getTestResultComponentId(),
                componentService.getActiveComponentsByTestId(bean.getTestId()));
        Result result = load(bean.getResultId(), analysis, resultService);
        Result qualified = load(bean.getQualifiedResultId(), analysis, resultService);
        if (result != null && result.getParentResult() != null) {
            throw invalid("error.results.resultMismatch");
        }
        if (qualified != null) {
            if (result == null || result.getId().equals(qualified.getId()) || qualified.getParentResult() == null) {
                throw invalid("error.results.qualifiedResultMismatch");
            }
            String parentId = qualified.getParentResult().getId();
            if (!ResultType.isMultiSelectVariant(bean.getResultType()) && !result.getId().equals(parentId)) {
                throw invalid("error.results.qualifiedResultMismatch");
            }
            // parentResult can be a lazy reference after getData returns. Only its
            // identifier is safe here; explicitly load a different multiselect parent.
            Result parent = result.getId().equals(parentId) ? result : load(parentId, analysis, resultService);
            if (parent == null) {
                throw invalid("error.results.qualifiedResultMismatch");
            }
            scope.require(parent);
        }
        scope.require(result);
        return new LoadedResults(result, qualified, scope);
    }

    private static Result load(String id, Analysis analysis, ResultService service) {
        if (GenericValidator.isBlankOrNull(id)) {
            return null;
        }
        if (!validId(id)) {
            throw invalid("error.results.resultMismatch");
        }
        Result result = new Result();
        result.setId(id);
        service.getData(result);
        if (!id.equals(result.getId())) {
            throw invalid("error.results.resultMismatch");
        }
        requireResultChain(result, analysis);
        return result;
    }

    private static void requireResultChain(Result result, Analysis analysis) {
        Analysis owner = result.getAnalysis();
        requireAnalysisChain(owner);
        if (!analysis.getId().equals(owner.getId())
                || !analysis.getSampleItem().getId().equals(owner.getSampleItem().getId())
                || !analysis.getSampleItem().getSample().getId().equals(owner.getSampleItem().getSample().getId())
                || !analysis.getTest().getId().equals(owner.getTest().getId())) {
            throw invalid("error.results.resultMismatch");
        }
        if (result.getTestResult() != null && (result.getTestResult().getTest() == null
                || !analysis.getTest().getId().equals(result.getTestResult().getTest().getId()))) {
            throw invalid("error.results.testMismatch");
        }
    }

    static void requireAnalysisChain(Analysis analysis) {
        if (analysis == null || !validId(analysis.getId()) || analysis.getTest() == null
                || !validId(analysis.getTest().getId()) || analysis.getSampleItem() == null
                || !validId(analysis.getSampleItem().getId()) || analysis.getSampleItem().getSample() == null
                || !validId(analysis.getSampleItem().getSample().getId())) {
            throw invalid("error.results.analysisMismatch");
        }
    }

    private static boolean validId(String id) {
        return id != null && id.matches("[1-9][0-9]*");
    }

    private static ResultSaveValidationException invalid(String code) {
        return new ResultSaveValidationException(code);
    }
}
