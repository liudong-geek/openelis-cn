package org.openelisglobal.sample;

import static org.junit.Assert.*;

import java.util.Map;
import org.junit.Test;
import org.openelisglobal.sample.form.SavedOrderReadRequest;

public class SavedOrderReadRequestTest {
    @Test
    public void exactRawNumberAndCharactersArePreserved() {
        assertEquals("HMC001-01", SavedOrderReadRequest.parse(params("HMC001-01")).labNumber());
        assertEquals("原号+%", new SavedOrderReadRequest("原号+%").labNumber());
        assertEquals("x".repeat(25), new SavedOrderReadRequest("x".repeat(25)).labNumber());
    }

    @Test
    public void blanksControlsPaddingAndOverlongNumbersAreRejected() {
        for (String value : new String[] { "", " ", " HMC1", "HMC1 ", "HMC\n1", "x".repeat(26) })
            assertThrows(IllegalArgumentException.class, () -> new SavedOrderReadRequest(value));
        assertThrows(IllegalArgumentException.class, () -> new SavedOrderReadRequest(null));
    }

    @Test
    public void onlyVersionTwoAndTwoSingleValueParametersAreAccepted() {
        assertThrows(IllegalArgumentException.class, () -> SavedOrderReadRequest
                .parse(Map.of("queryVersion", new String[] { "1" }, "labNumber", new String[] { "HMC1" })));
        assertThrows(IllegalArgumentException.class, () -> SavedOrderReadRequest
                .parse(Map.of("queryVersion", new String[] { "2", "2" }, "labNumber", new String[] { "HMC1" })));
        assertThrows(IllegalArgumentException.class, () -> SavedOrderReadRequest
                .parse(Map.of("queryVersion", new String[] { "2" }, "labNumber", new String[] { "HMC1", "HMC2" })));
        assertThrows(IllegalArgumentException.class, () -> SavedOrderReadRequest.parse(Map.of("queryVersion",
                new String[] { "2" }, "labNumber", new String[] { "HMC1" }, "id", new String[] { "1" })));
        assertThrows(IllegalArgumentException.class,
                () -> SavedOrderReadRequest.parse(Map.of("labNumber", new String[] { "HMC1" })));
    }

    private Map<String, String[]> params(String value) {
        return Map.of("queryVersion", new String[] { "2" }, "labNumber", new String[] { value });
    }
}
