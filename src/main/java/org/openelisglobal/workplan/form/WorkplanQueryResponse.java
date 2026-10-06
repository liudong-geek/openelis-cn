package org.openelisglobal.workplan.form;

import java.util.List;

public record WorkplanQueryResponse(String queryVersion, String currentUserId, WorkplanQueryRequest query,
        EffectiveScope effectiveScope, Paging paging, List<WorkplanQueryRow> workplanTests, String reportTitle,
        boolean canPrint, String pageSnapshot) {
    public record EffectiveScope(String role, List<String> testIds) {
    }

    public record Paging(String currentPage, String totalPages, long totalResults, int pageSize) {
    }
}
