package org.openelisglobal.sample.form;

import java.util.Map;
import java.util.Set;

/** Exact raw accession. No trimming or specimen suffix interpretation. */
public record SavedOrderReadRequest(String labNumber) {
    public SavedOrderReadRequest {
        if (labNumber == null || labNumber.isBlank() || labNumber.length() > 25 || !labNumber.equals(labNumber.strip())
                || labNumber.codePoints().anyMatch(Character::isISOControl))
            throw new IllegalArgumentException("INVALID_SAVED_ORDER_QUERY");
    }

    public static SavedOrderReadRequest parse(Map<String, String[]> parameters) {
        if (parameters == null || !parameters.keySet().equals(Set.of("queryVersion", "labNumber")))
            throw new IllegalArgumentException("INVALID_SAVED_ORDER_QUERY");
        for (var entry : parameters.entrySet())
            if (entry.getValue() == null || entry.getValue().length != 1 || entry.getValue()[0] == null)
                throw new IllegalArgumentException("INVALID_SAVED_ORDER_QUERY");
        if (!"2".equals(parameters.get("queryVersion")[0]))
            throw new IllegalArgumentException("INVALID_SAVED_ORDER_QUERY");
        return new SavedOrderReadRequest(parameters.get("labNumber")[0]);
    }
}
