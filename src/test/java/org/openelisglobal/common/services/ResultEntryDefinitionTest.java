package org.openelisglobal.common.services;

import static org.junit.Assert.*;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;

/**
 * Pure synthetic master-data checks; no database, framework context or
 * generated definitions.
 */
public class ResultEntryDefinitionTest {
    @Test
    public void submittedTypeCannotOverrideTheComponentDefinition() {
        ResultEntryDefinition.requireType(scope("701"), List.of(option("801", "701", "N")), "N");
        for (String type : new String[] { null, "", "A", "D", "M" })
            assertThrows(ResultSaveValidationException.class,
                    () -> ResultEntryDefinition.requireType(scope("701"), List.of(option("801", "701", "N")), type));
        assertThrows(ResultSaveValidationException.class, () -> ResultEntryDefinition.requireType(scope("701"),
                List.of(option("801", "701", "N"), option("802", "701", "A")), "N"));
    }

    @Test
    public void missingAndUnusableDefinitionsAreBlocked() {
        TestResult inactive = option("801", "701", "N");
        inactive.setIsActive(false);
        TestResult blankType = option("802", "701", null);
        TestResult unknownType = option("803", "701", "UNSUPPORTED");
        TestResult unsupportedStandaloneQualifier = option("804", "701", "Q");
        TestResult invalidId = option("0", "701", "N");
        for (List<TestResult> definitions : List.of(List.<TestResult>of(), List.of(inactive), List.of(blankType),
                List.of(unknownType), List.of(unsupportedStandaloneQualifier), List.of(invalidId))) {
            ResultSaveValidationException error = assertThrows(ResultSaveValidationException.class,
                    () -> ResultEntryDefinition.requireDefined(scope("701"), definitions));
            assertEquals(ResultEntryDefinition.MISSING, error.getErrorCode());
        }
        assertThrows(ResultSaveValidationException.class,
                () -> ResultEntryDefinition.requireDefined(scope("701"), null));
    }

    @Test
    public void legalNumericTextAndDictionaryDefinitionsAreNotInventedOrReplaced() {
        for (String type : List.of("N", "A", "D", "M", "C", "R", "T")) {
            TestResult definition = option("801", "701", type);
            assertEquals(List.of(definition),
                    ResultEntryDefinition.scopedDefinitions(scope("701"), List.of(definition)));
        }
    }

    @Test
    public void historicalNullDefinitionOnlyBelongsToTheUniqueServerPrimary() {
        TestResult legacy = option("801", null, "N");
        ResultEntryDefinition.requireDefined(scope(null), List.of(legacy));
        ResultEntryDefinition.requireDefined(scope("701"), List.of(legacy));
        assertThrows(ResultSaveValidationException.class,
                () -> ResultEntryDefinition.requireDefined(scope("702"), List.of(legacy)));
    }

    @Test
    public void zeroComponentLegacyDefinitionStillWorksWithoutCreatingAComponent() {
        ResultSaveComponentScope legacyScope = new ResultSaveComponentScope("401", null, List.of());
        ResultEntryDefinition.requireDefined(legacyScope, List.of(option("801", null, "N")));
        assertThrows(ResultSaveValidationException.class,
                () -> ResultEntryDefinition.requireDefined(legacyScope, List.of(option("802", "701", "N"))));
    }

    @Test
    public void anotherTestCannotSupplyThisRowsDefinition() {
        TestResult definition = option("801", "701", "N");
        org.openelisglobal.test.valueholder.Test foreign = new org.openelisglobal.test.valueholder.Test();
        foreign.setId("402");
        definition.setTest(foreign);
        assertThrows(ResultSaveValidationException.class,
                () -> ResultEntryDefinition.requireDefined(scope("701"), List.of(definition)));
    }

    private ResultSaveComponentScope scope(String requested) {
        TestResultComponent primary = component("701", true);
        TestResultComponent secondary = component("702", false);
        return new ResultSaveComponentScope("401", requested, List.of(primary, secondary));
    }

    private TestResultComponent component(String id, boolean primary) {
        TestResultComponent component = new TestResultComponent();
        component.setId(id);
        component.setTestId("401");
        component.setIsPrimary(primary);
        return component;
    }

    private TestResult option(String id, String componentId, String type) {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        TestResult definition = new TestResult();
        definition.setId(id);
        definition.setTest(test);
        definition.setTestResultType(type);
        definition.setComponentId(componentId);
        definition.setValue("10");
        return definition;
    }
}
