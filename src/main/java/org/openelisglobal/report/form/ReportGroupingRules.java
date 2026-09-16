package org.openelisglobal.report.form;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Explicit site configuration. No default clinical grouping is inferred. */
public record ReportGroupingRules(String ruleVersion, List<Group> groups) {
    public record Group(String key, String label, List<String> testIds) {
        public Group {
            if (key == null || !key.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,127}") || label == null || label.isBlank()
                    || !label.equals(label.strip()) || label.length() > 200 || testIds == null || testIds.isEmpty()
                    || testIds.size() > 2000) {
                throw new IllegalArgumentException("Invalid report group configuration");
            }
            Set<String> ids = new HashSet<>();
            for (String id : testIds) {
                if (id == null || !id.matches("[1-9][0-9]*") || !ids.add(id)) {
                    throw new IllegalArgumentException("Invalid or duplicate report group test");
                }
            }
            testIds = List.copyOf(testIds);
        }
    }

    public ReportGroupingRules {
        if (ruleVersion == null || !ruleVersion.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,63}") || groups == null
                || groups.isEmpty() || groups.size() > 100) {
            throw new IllegalArgumentException("Invalid report grouping configuration");
        }
        Set<String> keys = new HashSet<>();
        for (Group group : groups) {
            if (group == null || !keys.add(group.key())) {
                throw new IllegalArgumentException("Duplicate report group key");
            }
        }
        groups = List.copyOf(groups);
    }

    public Group requireGroup(String key) {
        return groups.stream().filter(group -> group.key().equals(key)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown configured report group"));
    }
}
