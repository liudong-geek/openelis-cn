package org.openelisglobal.result;

import static org.junit.Assert.*;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import org.openelisglobal.result.form.ResultRestrictionRequest;

public class ResultRestrictionRequestTest {
    private Map<String, String[]> valid() {
        var p = new HashMap<String, String[]>();
        p.put("queryVersion", new String[] { "2" });
        p.put("sampleItemId", new String[] { "2" });
        p.put("testId", new String[] { "3" });
        p.put("labNumber", new String[] { "HMC-001_2.3" });
        p.put("analysisLastupdated", new String[] { "1700000000123" });
        return p;
    }

    @Test
    public void preservesExactRawNumberAndExistingMillisVersion() {
        var q = ResultRestrictionRequest.parse("1", valid());
        assertEquals("HMC-001_2.3", q.labNumber());
        assertEquals("1700000000123", q.analysisLastupdated());
    }

    @Test
    public void rejectsUnknownMissingAndDuplicateParameters() {
        var p = valid();
        p.put("currentUserId", new String[] { "7" });
        assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
        p.remove("currentUserId");
        p.remove("testId");
        assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
        p.put("testId", new String[] { "3", "4" });
        assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
    }

    @Test
    public void rejectsNoncanonicalOrOverflowIdentities() {
        for (String id : new String[] { "0", "01", "-1", " 1", "1.0", "2147483648" })
            assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse(id, valid()));
        var p = valid();
        p.put("sampleItemId", new String[] { "" });
        assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
    }

    @Test
    public void rejectsWrongVersionAndMalformedTimestamp() {
        var p = valid();
        p.put("queryVersion", new String[] { "1" });
        assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
        p.put("queryVersion", new String[] { "2" });
        for (String v : new String[] { "-1", "2026-10-07 10:00:00", "9223372036854775808", "" }) {
            p.put("analysisLastupdated", new String[] { v });
            assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
        }
    }

    @Test
    public void neverTrimsOrFormatsAnInvalidRawNumber() {
        var p = valid();
        for (String n : new String[] { " HMC01", "HMC01 ", "患者号", "a/b", "x".repeat(31) }) {
            p.put("labNumber", new String[] { n });
            assertThrows(IllegalArgumentException.class, () -> ResultRestrictionRequest.parse("1", p));
        }
    }
}
