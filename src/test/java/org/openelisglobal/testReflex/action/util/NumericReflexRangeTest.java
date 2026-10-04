package org.openelisglobal.testReflex.action.util;

import static org.junit.Assert.*;

import java.lang.reflect.InvocationTargetException;
import org.junit.Test;

public class NumericReflexRangeTest {
    private boolean contains(String encoded, double value) {
        try {
            // The established testReflex test package differs in case from production.
            // Reflect only to keep the production parser package-private on APFS.
            var parser = Class.forName("org.openelisglobal.testreflex.action.util.NumericReflexRange");
            var method = parser.getDeclaredMethod("contains", String.class, double.class);
            method.setAccessible(true);
            return (Boolean) method.invoke(null, encoded, value);
        } catch (InvocationTargetException exception) {
            if (exception.getCause() instanceof RuntimeException)
                throw (RuntimeException) exception.getCause();
            throw new AssertionError(exception.getCause());
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError(exception);
        }
    }

    private void assertInclusive(double lower, double upper, double middle, double below, double above) {
        // Use the exact existing writer encoding, including signs in
        // mantissas/exponents.
        String encoded = Double.toString(lower) + "-" + Double.toString(upper);
        assertTrue(contains(encoded, lower));
        assertTrue(contains(encoded, upper));
        assertTrue(contains(encoded, middle));
        assertFalse(contains(encoded, below));
        assertFalse(contains(encoded, above));
    }

    @Test
    public void positiveBoundariesRetainInclusiveComparison() {
        assertInclusive(1, 5, 3, 0, 6);
    }

    @Test
    public void signedBoundariesAndNegativeZeroAreDistinctFromDelimiter() {
        assertInclusive(-5, -2, -3, -6, -1);
        assertInclusive(-5, 2, 0, -6, 3);
        assertInclusive(-0.0, 0.0, 0.0, -0.1, 0.1);
    }

    @Test
    public void negativeExponentBoundariesParseCompletely() {
        assertInclusive(1e-9, 5e-8, 2e-9, 0, 1e-7);
        assertInclusive(-5e-8, -1e-9, -2e-9, -1e-7, 0);
        assertInclusive(-5e-8, 1e-9, 0, -1e-7, 2e-9);
        assertInclusive(Double.MIN_VALUE, 1e-8, 2e-9, 0, 2e-8);
    }

    @Test
    public void positiveExponentsAndExplicitSignsRemainSupported() {
        assertInclusive(-1e20, 1e20, 0, -2e20, 2e20);
        assertTrue(contains("+1e-9-+2e-9", 1.5e-9));
    }

    @Test
    public void malformedOrAdditionalBoundariesDoNotMatch() {
        for (String encoded : new String[] { "1-", "-1", "1-2-3", "1e--2-3", "bad-5" }) {
            try {
                contains(encoded, 1);
                fail("Expected invalid encoding rejection: " + encoded);
            } catch (NumberFormatException expected) {
                // Invalid legacy encodings remain errors rather than silently matching.
            }
        }
    }
}
