package org.openelisglobal.result.form;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import org.openelisglobal.sample.service.SpecimenLookupService;

/**
 * Current read-only facts, not acceptance evidence or a permission to write.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record ResultRestrictionResponse(String queryVersion, String currentUserId, boolean readOnly,
        ResultRestrictionRequest query, Identity identity, Status specimenStatus, Status analysisStatus,
        String blockedReason, Facts facts, List<String> diagnosticCodes, boolean canOpenIntake,
        String actionUnavailableReason, boolean canEditIntake, String intakeEditUnavailableReason, Target target,
        SpecimenLookupService.Result intakeLookup, List<String> warningCodes) {
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Identity(String sampleId, String sampleItemId, String analysisId, String testId, String labNumber,
            String analysisLastupdated, String sampleLastupdated, String sampleItemLastupdated) {
    }

    /**
     * statusType is the expected category; actualStatusType is persisted, when
     * known.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Status(String statusId, String statusType, String actualStatusType, String statusCode,
            String statusName, boolean known) {
    }

    public enum FactState {
        RECORDED, MISSING, INCONSISTENT, UNKNOWN
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DateFact(FactState state, String value) {
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record RequestFact(FactState state, String id, String statusCode) {
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AcceptanceFact(FactState state, String id, String decision) {
    }

    public record Facts(DateFact collection, DateFact receipt, RequestFact request, AcceptanceFact acceptance) {
    }

    public record Target(String sampleId, String sampleItemId, String requestId, String analysisId, String testId,
            String labNumber, String lookupCode) {
    }
}
