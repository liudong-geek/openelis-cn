package org.openelisglobal.testreflex.action.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the existing two-boundary encoding without treating numeric signs as
 * separators.
 */
final class NumericReflexRange {
    private static final String NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
    private static final Pattern BOUNDS = Pattern.compile("^\\s*(" + NUMBER + ")\\s*-\\s*(" + NUMBER + ")\\s*$");

    private NumericReflexRange() {
    }

    static boolean contains(String encodedBounds, double value) {
        Matcher match = BOUNDS.matcher(encodedBounds);
        if (!match.matches())
            throw new NumberFormatException("Invalid numeric reflex range");
        double lower = Double.parseDouble(match.group(1));
        double upper = Double.parseDouble(match.group(2));
        return value >= lower && value <= upper;
    }
}
