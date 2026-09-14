package org.openelisglobal.common.services;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;

/**
 * Resolve legacy NULL ownership from server master data, never from request
 * order.
 */
public final class ResultSaveComponentScope {
    private final String testId;
    private final Set<String> activeIds = new HashSet<>();
    private final String primaryId;
    private final String requestedId;

    public ResultSaveComponentScope(String testId, String requestedId, List<TestResultComponent> components) {
        this.testId = testId;
        if (components == null) {
            throw invalid();
        }
        String primary = null;
        for (TestResultComponent component : components) {
            if (component == null || GenericValidator.isBlankOrNull(component.getId())
                    || !testId.equals(component.getTestId()) || !"Y".equals(component.getIsActive())
                    || !activeIds.add(component.getId())) {
                throw invalid();
            }
            if (component.getIsPrimary()) {
                if (primary != null) {
                    throw invalid();
                }
                primary = component.getId();
            }
        }
        if (!components.isEmpty() && primary == null) {
            throw invalid();
        }
        this.primaryId = primary;
        this.requestedId = GenericValidator.isBlankOrNull(requestedId) ? primary : requestedId;
        if (this.requestedId != null && !activeIds.contains(this.requestedId)) {
            throw invalid();
        }
    }

    public boolean contains(Result result) {
        return contains(result == null ? null : result.getTestResult());
    }

    public boolean contains(TestResult option) {
        if (option != null && (option.getTest() == null || !testId.equals(option.getTest().getId()))) {
            throw invalid();
        }
        String actual = option == null ? null : option.getComponentId();
        String resolved = GenericValidator.isBlankOrNull(actual) ? primaryId : actual;
        return (resolved == null || activeIds.contains(resolved)) && Objects.equals(requestedId, resolved);
    }

    void require(Result result) {
        if (result != null && !contains(result)) {
            throw invalid();
        }
    }

    boolean hasComponents() {
        return !activeIds.isEmpty();
    }

    private static ResultSaveValidationException invalid() {
        return new ResultSaveValidationException("error.results.componentMismatch");
    }
}
