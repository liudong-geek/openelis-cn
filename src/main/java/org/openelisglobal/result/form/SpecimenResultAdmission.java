package org.openelisglobal.result.form;

import java.util.List;

/**
 * Current read facts for the signed-in operator, never a result-write
 * capability.
 */
public record SpecimenResultAdmission(int schema, String sampleId, String sampleItemId, String itemVersion,
        String state, List<Item> analyses) {
    public record Item(String analysisId, String testId, String analysisVersion, boolean allowed,
            String blockedReason) {
    }

    public static SpecimenResultAdmission unavailable(String sampleId, String itemId, String version) {
        return new SpecimenResultAdmission(1, sampleId, itemId, version, "UNAVAILABLE", List.of());
    }
}
