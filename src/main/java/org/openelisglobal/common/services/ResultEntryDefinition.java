package org.openelisglobal.common.services;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl.ResultType;

/**
 * Read and write agree on real result definitions; display fallbacks are not
 * master data.
 */
public final class ResultEntryDefinition {
    public static final String MISSING = "error.results.resultDefinitionMissing";
    private static final Set<String> RESULT_TYPES = Arrays.stream(ResultType.values())
            .map(ResultType::getCharacterValue).collect(Collectors.toUnmodifiableSet());

    private ResultEntryDefinition() {
    }

    public static List<TestResult> scopedDefinitions(ResultSaveComponentScope scope, List<TestResult> definitions) {
        List<TestResult> available = new ArrayList<>();
        if (definitions != null) {
            for (TestResult definition : definitions) {
                if (definition != null && definition.getId() != null && definition.getId().matches("[1-9][0-9]*")
                        && Boolean.TRUE.equals(definition.getIsActive()) && definition.getTestResultType() != null
                        && RESULT_TYPES.contains(definition.getTestResultType()) && scope.contains(definition)) {
                    available.add(definition);
                }
            }
        }
        return available;
    }

    public static void requireDefined(ResultSaveComponentScope scope, List<TestResult> definitions) {
        if (scopedDefinitions(scope, definitions).isEmpty()) {
            throw new ResultSaveValidationException(MISSING);
        }
    }

    /**
     * A client cannot turn a numeric component into free text to skip validation.
     */
    public static void requireType(ResultSaveComponentScope scope, List<TestResult> definitions, String type) {
        List<TestResult> scoped = scopedDefinitions(scope, definitions);
        if (scoped.isEmpty() || type == null || scoped.stream().anyMatch(d -> !type.equals(d.getTestResultType())))
            throw new ResultSaveValidationException(MISSING);
    }
}
