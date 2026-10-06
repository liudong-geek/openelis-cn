package org.openelisglobal.workplan;

import static org.junit.Assert.*;

import java.util.Map;
import org.junit.Test;
import org.openelisglobal.workplan.form.WorkplanQueryRequest;

public class WorkplanQueryRequestTest {
    @Test
    public void completeFiltersAndDefaultsAreKept() {
        var q = WorkplanQueryRequest.parse(Map.of("queryVersion", new String[] { "2" }, "type",
                new String[] { "panel" }, "filterId", new String[] { "17" }));
        assertEquals("panel", q.type());
        assertEquals("17", q.filterId());
        assertEquals(1, q.page());
        assertEquals(50, q.pageSize());
    }

    @Test
    public void allPriorityValuesUseExistingEnum() {
        for (var p : org.openelisglobal.sample.valueholder.OrderPriority.values())
            assertEquals(p.name(), WorkplanQueryRequest.of("priority", p.name(), "2", "20").filterId());
    }

    @Test
    public void rejectsBadTypeIdentityAndPaging() {
        for (String[] p : new String[][] { { "NFS", "1", "1", "50" }, { "test", "NFS", "1", "50" },
                { "test", "01", "1", "50" }, { "unit", "1", "0", "50" }, { "panel", "1", "1x", "50" },
                { "panel", "1", "2147483647", "100" }, { "priority", "urgent", "1", "50" },
                { "test", "1", "1", "30" } })
            invalid(() -> WorkplanQueryRequest.of(p[0], p[1], p[2], p[3]));
    }

    @Test
    public void rejectsDuplicateAndUnknownQueryParameters() {
        invalid(() -> WorkplanQueryRequest.parse(Map.of("queryVersion", new String[] { "2" }, "type",
                new String[] { "test", "panel" }, "filterId", new String[] { "1" })));
        invalid(() -> WorkplanQueryRequest.parse(Map.of("queryVersion", new String[] { "2" }, "type",
                new String[] { "test" }, "filterId", new String[] { "1" }, "status", new String[] { "4" })));
    }

    private void invalid(Runnable r) {
        try {
            r.run();
            fail("invalid query accepted");
        } catch (IllegalArgumentException expected) {
            assertEquals("workplan.invalidQuery", expected.getMessage());
        }
    }
}
