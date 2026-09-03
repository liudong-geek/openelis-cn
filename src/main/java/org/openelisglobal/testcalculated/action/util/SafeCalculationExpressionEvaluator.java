package org.openelisglobal.testcalculated.action.util;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;

/**
 * Evaluates the deliberately small expression language used by calculated
 * tests. This class must not be replaced with a general-purpose script engine:
 * calculation rules are configuration supplied by users and therefore must
 * never acquire code-execution capabilities.
 */
public final class SafeCalculationExpressionEvaluator {

    private static final Set<String> BINARY_OPERATORS = Set.of(Operation.ADD, Operation.SUBTRACT, Operation.DIVIDE,
            Operation.MULTIPLY, Operation.EQUALS, Operation.NOT_EQUALS, Operation.GREATER_OR_EQUALS,
            Operation.LESS_OR_EQUALS, Operation.LOGICAL_AND, Operation.LOGICAL_OR, Operation.OPEN_BRACKET,
            Operation.CLOSE_BRACKET);

    private SafeCalculationExpressionEvaluator() {
    }

    public static String evaluate(String expression) {
        Value value = new Parser(expression).parse();
        if (value.isBoolean()) {
            return Boolean.toString(value.asBoolean());
        }
        double number = value.asNumber();
        if (!Double.isFinite(number)) {
            throw new IllegalArgumentException("Calculation result must be a finite number");
        }
        return BigDecimal.valueOf(number).stripTrailingZeros().toPlainString();
    }

    /**
     * Validates both the persisted tokens and their grammar before a rule is
     * saved. Test identifiers are represented by harmless numeric placeholders;
     * the real values are only resolved while processing a laboratory result.
     */
    public static void validateDefinition(Calculation calculation) {
        if (calculation == null) {
            throw new IllegalArgumentException("Calculation is required");
        }
        if (StringUtils.isBlank(calculation.getName())) {
            throw new IllegalArgumentException("Calculation name is required");
        }
        if (calculation.getSampleId() == null || calculation.getSampleId() <= 0 || calculation.getTestId() == null
                || calculation.getTestId() <= 0) {
            throw new IllegalArgumentException("Calculated sample and test are required");
        }

        List<Operation> operations;
        try {
            operations = calculation.getOperations();
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Calculation operations are invalid", exception);
        }
        if (operations == null || operations.isEmpty()) {
            throw new IllegalArgumentException("At least one calculation operation is required");
        }

        StringBuilder placeholderExpression = new StringBuilder();
        for (int index = 0; index < operations.size(); index++) {
            Operation operation = operations.get(index);
            if (operation == null || operation.getType() == null || StringUtils.isBlank(operation.getValue())) {
                throw new IllegalArgumentException("Calculation operation " + (index + 1) + " is incomplete");
            }
            operation.setOrder(index);
            switch (operation.getType()) {
            case TEST_RESULT:
                requirePositiveInteger(operation.getValue(), "Test result identifier");
                if (operation.getSampleId() == null || operation.getSampleId() <= 0) {
                    throw new IllegalArgumentException("Test result sample is required");
                }
                placeholderExpression.append("1 ");
                break;
            case INTEGER:
                double number = parseFiniteNumber(operation.getValue(), "Numeric constant");
                placeholderExpression.append(number).append(' ');
                break;
            case PATIENT_ATTRIBUTE:
                if (!Operation.PatientAttribute.AGE.toString().equals(operation.getValue())) {
                    throw new IllegalArgumentException("Unsupported patient attribute: " + operation.getValue());
                }
                placeholderExpression.append("1 ");
                break;
            case MATH_FUNCTION:
                appendMathFunction(placeholderExpression, operation.getValue());
                break;
            default:
                throw new IllegalArgumentException("Unsupported calculation operation type");
            }
        }

        new Parser(placeholderExpression.toString()).parse();
    }

    private static void appendMathFunction(StringBuilder expression, String value) {
        if (Operation.IN_NORMAL_RANGE.equals(value)) {
            expression.append(">= 0 && 1 <= 10 ");
        } else if (Operation.OUTSIDE_NORMAL_RANGE.equals(value)) {
            expression.append("< 0 || 1 > 10 ");
        } else if (BINARY_OPERATORS.contains(value)) {
            expression.append(value).append(' ');
        } else {
            throw new IllegalArgumentException("Unsupported calculation operator: " + value);
        }
    }

    private static void requirePositiveInteger(String value, String label) {
        try {
            if (Integer.parseInt(value) <= 0) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(label + " must be a positive integer", exception);
        }
    }

    private static double parseFiniteNumber(String value, String label) {
        try {
            double number = Double.parseDouble(value);
            if (!Double.isFinite(number)) {
                throw new NumberFormatException();
            }
            return number;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(label + " must be a finite number", exception);
        }
    }

    private static final class Parser {

        private final String input;
        private int position;

        private Parser(String input) {
            this.input = input == null ? "" : input;
        }

        private Value parse() {
            Value value = parseOr();
            skipWhitespace();
            if (position != input.length()) {
                throw error("Unexpected token");
            }
            return value;
        }

        private Value parseOr() {
            Value value = parseAnd();
            while (match("||")) {
                Value right = parseAnd();
                value = Value.of(value.asBoolean() || right.asBoolean());
            }
            return value;
        }

        private Value parseAnd() {
            Value value = parseEquality();
            while (match("&&")) {
                Value right = parseEquality();
                value = Value.of(value.asBoolean() && right.asBoolean());
            }
            return value;
        }

        private Value parseEquality() {
            Value value = parseComparison();
            while (true) {
                if (match("==")) {
                    Value right = parseComparison();
                    value = Value.of(value.equalsValue(right));
                } else if (match("!=")) {
                    Value right = parseComparison();
                    value = Value.of(!value.equalsValue(right));
                } else {
                    return value;
                }
            }
        }

        private Value parseComparison() {
            Value value = parseAdditive();
            while (true) {
                if (match(">=")) {
                    value = Value.of(value.asNumber() >= parseAdditive().asNumber());
                } else if (match("<=")) {
                    value = Value.of(value.asNumber() <= parseAdditive().asNumber());
                } else if (match(">")) {
                    value = Value.of(value.asNumber() > parseAdditive().asNumber());
                } else if (match("<")) {
                    value = Value.of(value.asNumber() < parseAdditive().asNumber());
                } else {
                    return value;
                }
            }
        }

        private Value parseAdditive() {
            Value value = parseMultiplicative();
            while (true) {
                if (match("+")) {
                    value = Value.of(value.asNumber() + parseMultiplicative().asNumber());
                } else if (match("-")) {
                    value = Value.of(value.asNumber() - parseMultiplicative().asNumber());
                } else {
                    return value;
                }
            }
        }

        private Value parseMultiplicative() {
            Value value = parseUnary();
            while (true) {
                if (match("*")) {
                    value = Value.of(value.asNumber() * parseUnary().asNumber());
                } else if (match("/")) {
                    double divisor = parseUnary().asNumber();
                    if (divisor == 0) {
                        throw error("Division by zero");
                    }
                    value = Value.of(value.asNumber() / divisor);
                } else {
                    return value;
                }
            }
        }

        private Value parseUnary() {
            if (match("+")) {
                return Value.of(parseUnary().asNumber());
            }
            if (match("-")) {
                return Value.of(-parseUnary().asNumber());
            }
            return parsePrimary();
        }

        private Value parsePrimary() {
            if (match("(")) {
                Value value = parseOr();
                if (!match(")")) {
                    throw error("Missing closing bracket");
                }
                return value;
            }
            skipWhitespace();
            if (input.startsWith("Infinity", position)) {
                position += "Infinity".length();
                return Value.of(Double.POSITIVE_INFINITY);
            }
            return Value.of(parseNumber());
        }

        private double parseNumber() {
            skipWhitespace();
            int start = position;
            boolean exponentSeen = false;
            while (position < input.length()) {
                char current = input.charAt(position);
                if (Character.isDigit(current) || current == '.') {
                    position++;
                } else if ((current == 'e' || current == 'E') && !exponentSeen) {
                    exponentSeen = true;
                    position++;
                    if (position < input.length() && (input.charAt(position) == '+' || input.charAt(position) == '-')) {
                        position++;
                    }
                } else {
                    break;
                }
            }
            if (start == position) {
                throw error("Number expected");
            }
            try {
                return Double.parseDouble(input.substring(start, position));
            } catch (NumberFormatException exception) {
                throw error("Invalid number");
            }
        }

        private boolean match(String expected) {
            skipWhitespace();
            if (!input.startsWith(expected, position)) {
                return false;
            }
            position += expected.length();
            return true;
        }

        private void skipWhitespace() {
            while (position < input.length() && Character.isWhitespace(input.charAt(position))) {
                position++;
            }
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at position " + position);
        }
    }

    private static final class Value {

        private final Double number;
        private final Boolean bool;

        private Value(Double number, Boolean bool) {
            this.number = number;
            this.bool = bool;
        }

        private static Value of(double number) {
            return new Value(number, null);
        }

        private static Value of(boolean bool) {
            return new Value(null, bool);
        }

        private boolean isBoolean() {
            return bool != null;
        }

        private double asNumber() {
            if (number == null) {
                throw new IllegalArgumentException("Number expected");
            }
            return number;
        }

        private boolean asBoolean() {
            if (bool == null) {
                throw new IllegalArgumentException("Boolean expected");
            }
            return bool;
        }

        private boolean equalsValue(Value other) {
            if (isBoolean() != other.isBoolean()) {
                return false;
            }
            return isBoolean() ? bool.equals(other.bool) : Double.compare(number, other.number) == 0;
        }
    }
}
