package org.openelisglobal.resultvalidation.service;

import java.io.Serializable;
import java.util.List;
import java.util.Set;

public record ReviewScopeSnapshot(String actor, Set<String> sectionIds, List<String> statusIds,
        boolean validateRejected, String recordStatusMode, String dateLocale,
        boolean depersonalized) implements Serializable {
    public ReviewScopeSnapshot {
        sectionIds = Set.copyOf(sectionIds);
        statusIds = List.copyOf(statusIds);
    }

    public boolean usesRecordStatus() {
        return org.openelisglobal.common.action.IActionConstants.STATUS_RULES_RETROCI.equals(recordStatusMode);
    }
}
