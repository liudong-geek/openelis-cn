package org.openelisglobal.workplan.form;

import java.util.Map;
import java.util.Set;
import org.openelisglobal.sample.valueholder.OrderPriority;

public record WorkplanQueryRequest(String type, String filterId, int page, int pageSize) {
    public static WorkplanQueryRequest parse(Map<String, String[]> params) {
        if (params == null
                || params.keySet().stream()
                        .anyMatch(k -> !Set.of("queryVersion", "type", "filterId", "page", "pageSize").contains(k))
                || params.values().stream().anyMatch(v -> v == null || v.length != 1)
                || !"2".equals(value(params, "queryVersion")))
            throw invalid();
        return of(value(params, "type"), value(params, "filterId"), value(params, "page"), value(params, "pageSize"));
    }

    private static String value(Map<String, String[]> p, String k) {
        return p.containsKey(k) ? p.get(k)[0] : null;
    }

    public static WorkplanQueryRequest of(String type, String filterId, String page, String pageSize) {
        if (type == null || !Set.of("test", "panel", "unit", "priority").contains(type))
            throw invalid();
        if ("priority".equals(type)) {
            try {
                OrderPriority.valueOf(filterId);
            } catch (RuntimeException e) {
                throw invalid();
            }
        } else
            positive(filterId);
        int p = page == null ? 1 : positive(page), size = pageSize == null ? 50 : positive(pageSize);
        if (!Set.of(10, 20, 50, 100).contains(size) || (long) (p - 1) * size > Integer.MAX_VALUE)
            throw invalid();
        return new WorkplanQueryRequest(type, filterId, p, size);
    }

    public static int positive(String value) {
        if (value == null || !value.matches("[1-9][0-9]*"))
            throw invalid();
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw invalid();
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("workplan.invalidQuery");
    }
}
