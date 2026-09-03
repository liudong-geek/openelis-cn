package org.openelisglobal.testcalculated.action.util;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;

public class SafeCalculationExpressionEvaluatorTest {

    @Test
    public void evaluate_supportsArithmeticPrecedenceAndBrackets() {
        assertEquals("14", SafeCalculationExpressionEvaluator.evaluate("2 + 3 * 4"));
        assertEquals("20", SafeCalculationExpressionEvaluator.evaluate("(2 + 3) * 4"));
    }

    @Test
    public void evaluate_supportsComparisonLogicalOperatorsAndRangeSentinels() {
        assertEquals("true", SafeCalculationExpressionEvaluator.evaluate("5 >= 0 && 5 <= 10"));
        assertEquals("true", SafeCalculationExpressionEvaluator.evaluate("5 >= -Infinity && 5 <= Infinity"));
        assertEquals("false", SafeCalculationExpressionEvaluator.evaluate("5 < 0 || 5 > 10"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void evaluate_rejectsScriptContent() {
        SafeCalculationExpressionEvaluator.evaluate("1; java.lang.Runtime.getRuntime()");
    }

    @Test(expected = IllegalArgumentException.class)
    public void evaluate_rejectsDivisionByZero() {
        SafeCalculationExpressionEvaluator.evaluate("10 / 0");
    }

    @Test
    public void validateDefinition_acceptsKnownTokenSequenceAndNormalizesOrder() {
        Calculation calculation = calculationWith(operation(Operation.OperationType.TEST_RESULT, "10", 99),
                operation(Operation.OperationType.MATH_FUNCTION, Operation.ADD, null),
                operation(Operation.OperationType.INTEGER, "2.5", null));

        SafeCalculationExpressionEvaluator.validateDefinition(calculation);

        assertEquals(Integer.valueOf(0), calculation.getOperations().get(0).getOrder());
        assertEquals(Integer.valueOf(1), calculation.getOperations().get(1).getOrder());
        assertEquals(Integer.valueOf(2), calculation.getOperations().get(2).getOrder());
    }

    @Test(expected = IllegalArgumentException.class)
    public void validateDefinition_rejectsUnknownOperator() {
        Calculation calculation = calculationWith(operation(Operation.OperationType.INTEGER, "1", null),
                operation(Operation.OperationType.MATH_FUNCTION, "; shutdown", null));

        SafeCalculationExpressionEvaluator.validateDefinition(calculation);
    }

    @Test(expected = IllegalArgumentException.class)
    public void validateDefinition_rejectsUnsupportedWeightAttribute() {
        Calculation calculation = calculationWith(
                operation(Operation.OperationType.PATIENT_ATTRIBUTE, Operation.PatientAttribute.WEIGHT.toString(), null));

        SafeCalculationExpressionEvaluator.validateDefinition(calculation);
    }

    private Calculation calculationWith(Operation... operations) {
        Calculation calculation = new Calculation();
        calculation.setName("BMI");
        calculation.setSampleId(1);
        calculation.setTestId(2);
        calculation.setOperations(new ArrayList<>(List.of(operations)));
        return calculation;
    }

    private Operation operation(Operation.OperationType type, String value, Integer sampleId) {
        Operation operation = new Operation();
        operation.setType(type);
        operation.setValue(value);
        operation.setSampleId(sampleId);
        operation.setOrder(99);
        return operation;
    }
}
