package org.openelisglobal.reports.service;

import java.util.LinkedHashSet;
import java.util.List;

/**
 * Immutable internal definition of a complete, explicitly configured report group.
 * A future server-side group resolver must supply this definition; it must never
 * be bound directly from a client-selected analysis list. The rule version is
 * provenance, not a release version or a substitute for a persisted document ID.
 */
public record ReportScopeDefinition(String patientId, String sampleId, String groupKey, String ruleVersion,
        List<String> analysisIds) {

    public ReportScopeDefinition {
        if (!isCanonicalId(patientId) || !isCanonicalId(sampleId) || !isExplicitKey(groupKey)
                || !isExplicitKey(ruleVersion) || analysisIds == null || analysisIds.isEmpty()) {
            throw invalidDefinition();
        }
        LinkedHashSet<String> members = new LinkedHashSet<>();
        for (String analysisId : analysisIds) {
            if (!isCanonicalId(analysisId) || !members.add(analysisId)) {
                throw invalidDefinition();
            }
        }
        analysisIds = List.copyOf(members);
    }

    static boolean isCanonicalId(String value) {
        return value != null && value.matches("[1-9][0-9]*");
    }

    private static boolean isExplicitKey(String value) {
        return value != null && !value.isBlank() && value.equals(value.strip());
    }

    private static IllegalArgumentException invalidDefinition() {
        return new IllegalArgumentException("Invalid explicit report scope definition");
    }
}
