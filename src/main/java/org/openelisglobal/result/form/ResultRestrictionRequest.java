package org.openelisglobal.result.form;

import java.util.Map;
import java.util.Set;

/**
 * Exact selected result identity; never a permission or writable order payload.
 */
public record ResultRestrictionRequest(String analysisId, String sampleItemId, String testId, String labNumber,
        String analysisLastupdated) {

    private static final Set<String> PARAMETERS = Set.of("queryVersion", "sampleItemId", "testId", "labNumber",
            "analysisLastupdated");

    public static ResultRestrictionRequest parse(String analysisId, Map<String, String[]> parameters) {
        if (parameters == null || !parameters.keySet().equals(PARAMETERS)
                || !"2".equals(one(parameters, "queryVersion")))
            throw invalid();
        String item = one(parameters, "sampleItemId"), test = one(parameters, "testId");
        String number = one(parameters, "labNumber"), version = one(parameters, "analysisLastupdated");
        if (!id(analysisId) || !id(item) || !id(test) || number == null || !number.matches("[A-Za-z0-9._-]{1,30}")
                || version == null || !version.matches("[0-9]{1,19}"))
            throw invalid();
        try {
            if (Long.parseLong(version) < 0)
                throw invalid();
        } catch (NumberFormatException error) {
            throw invalid();
        }
        return new ResultRestrictionRequest(analysisId, item, test, number, version);
    }

    private static String one(Map<String, String[]> parameters, String name) {
        var values = parameters.get(name);
        if (values == null || values.length != 1 || values[0] == null)
            throw invalid();
        return values[0];
    }

    private static boolean id(String value) {
        try {
            return value != null && value.matches("[1-9][0-9]{0,9}") && Integer.parseInt(value) > 0;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("RESULT_RESTRICTION_INVALID_QUERY");
    }
}
