package org.openelisglobal.sample.form;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

public record OrderDashboardResponse(List<Order> orders, long totalCount,
        @JsonInclude(JsonInclude.Include.ALWAYS) Long externalCount, int page, int pageSize, String externalCountScope,
        boolean externalOrdersIncluded) {
    public OrderDashboardResponse {
        orders = List.copyOf(orders);
    }

    public record Order(String id, String labNumber, String lastUpdated, String priority, boolean isExternal,
            boolean returnedFromQA, String patientName, String facilityName, Map<String, Boolean> stepProgress,
            String status, boolean storageSkipped, String specimenIntakeStatus, String statusScope, String reportStatus,
            boolean hasDisposedSpecimens, boolean hasRejectedSpecimens, boolean hasIntakeStatusConflict,
            boolean hasNoActiveTests, String qaVerificationScope, DecisionSummary specimenDecisions,
            String labelEvidenceScope) {
        public Order {
            stepProgress = Map.copyOf(stepProgress);
        }
    }

    public record DecisionSummary(int acceptedRecorded, int rejectedRecorded, int notRecorded, int reviewRequired,
            boolean currentAcceptanceVerified) {
    }
}
