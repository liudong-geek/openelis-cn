package org.openelisglobal.qachecklist.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;

/**
 * Current configuration projection, not evidence of per-specimen acceptance.
 */
public final class QaChecklistSnapshot {
    private QaChecklistSnapshot() {
    }

    public static List<List<String>> configurationSignature(List<Dictionary> configuration) {
        keys(configuration);
        return configuration.stream()
                .map(item -> java.util.Arrays.asList(item.getId(), item.getDictEntry(), item.getLocalAbbreviation(),
                        String.valueOf(item.getSortOrder()),
                        item.getLastupdated() == null ? null : item.getLastupdated().toInstant().toString()))
                .toList();
    }

    public static Map<String, Boolean> normalize(List<Dictionary> configuration, Map<String, Boolean> supplied) {
        if (supplied == null) {
            throw invalid("QA_ITEMS_INVALID", "itemsInvalid");
        }
        for (Map.Entry<?, ?> entry : supplied.entrySet()) {
            if (!(entry.getKey() instanceof String) || !(entry.getValue() instanceof Boolean)) {
                throw invalid("QA_ITEMS_INVALID", "itemsInvalid");
            }
        }
        Map<String, Boolean> result = keys(configuration);
        if (!result.keySet().containsAll(supplied.keySet())) {
            throw invalid("QA_CONFIGURATION_CHANGED", "configurationChanged");
        }
        result.replaceAll((key, value) -> Boolean.TRUE.equals(supplied.get(key)));
        return result;
    }

    private static Map<String, Boolean> keys(List<Dictionary> configuration) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        if (configuration == null || configuration.isEmpty()) {
            throw invalid("QA_CONFIGURATION_INVALID", "configurationInvalid");
        }
        for (var item : configuration) {
            if (item == null || !"Y".equals(item.getIsActive()) || item.getDictEntry() == null
                    || item.getDictEntry().isBlank() || !item.getDictEntry().equals(item.getDictEntry().trim())
                    || result.putIfAbsent(item.getDictEntry(), false) != null) {
                throw invalid("QA_CONFIGURATION_INVALID", "configurationInvalid");
            }
        }
        return result;
    }

    public static Map<String, Object> project(SampleQaChecklist stored, List<Dictionary> configuration) {
        boolean historical = stored != null && Boolean.TRUE.equals(stored.getAllRequiredVerified());
        Map<String, Boolean> items = keys(configuration);
        if (stored != null) {
            items.replaceAll((key, value) -> Boolean.TRUE.equals(stored.getVerifiedItems().get(key)));
        }
        boolean complete = historical && stored.getVerifiedByUserId() != null && stored.getVerifiedByUserId() > 0
                && stored.getVerifiedDate() != null && items.values().stream().allMatch(Boolean.TRUE::equals);
        return Map.of("verifiedItems", items, "allRequiredVerified", complete, "storedChecklistComplete", historical,
                "completionScope", "stored_checklist_snapshot", "currentAcceptanceVerified", false, "verificationState",
                "UNVERIFIED_CURRENT_FACTS");
    }

    private static QaChecklistValidationException invalid(String code, String key) {
        return new QaChecklistValidationException(409, code, "qa.checklist." + key);
    }
}
