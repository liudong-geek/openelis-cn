package org.openelisglobal.result.service;

import java.util.EnumMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.State;
import org.openelisglobal.result.exception.ResultSaveValidationException;

/**
 * Ordinary entry is distinct from review, release and controlled correction.
 */
final class OrdinaryResultReviewPolicy {
    static final String REVIEWED = "error.results.reviewedResultLocked";
    static final String UNAVAILABLE = "error.results.analysisEntryUnavailable";
    static final String CONFIGURATION = "error.results.statusConfigurationInvalid";
    private final Map<AnalysisStatus, String> ids;

    private OrdinaryResultReviewPolicy(Map<AnalysisStatus, String> ids) {
        this.ids = Map.copyOf(ids);
    }

    static OrdinaryResultReviewPolicy read(IStatusService statuses) {
        Map<AnalysisStatus, String> ids = new EnumMap<>(AnalysisStatus.class);
        Set<String> distinct = new HashSet<>();
        for (AnalysisStatus status : AnalysisStatus.values()) {
            String id = statuses.getStatusID(status);
            if (id == null || !id.matches("[1-9][0-9]{0,9}") || !distinct.add(id))
                throw new ResultSaveValidationException(CONFIGURATION);
            ids.put(status, id);
        }
        return new OrdinaryResultReviewPolicy(ids);
    }

    boolean sameConfiguration(OrdinaryResultReviewPolicy other) {
        return ids.equals(other.ids);
    }

    String sourceReason(State state) {
        return reason(state, false);
    }

    String targetReason(State state, boolean explicitRejection) {
        return reason(state, explicitRejection);
    }

    private String reason(State state, boolean target) {
        if (state == null || state.analysisId() == null || !state.analysisId().matches("[1-9][0-9]{0,9}"))
            return UNAVAILABLE;
        if (state.releasedDate() != null || state.printedDate() != null
                || ids.get(AnalysisStatus.Finalized).equals(state.statusId()))
            return REVIEWED;
        if (ids.get(AnalysisStatus.NotStarted).equals(state.statusId())
                || ids.get(AnalysisStatus.TechnicalAcceptance).equals(state.statusId())
                || ids.get(AnalysisStatus.BiologistRejected).equals(state.statusId()))
            return null;
        // An explicit review return may be re-entered, but released/printed facts above
        // always remain locked. A new valid entry goes back through TechnicalAcceptance.
        // Entry may record a new explicit technical rejection, not edit an existing
        // canceled/rejected/reviewed result through an ordinary save.
        if (target && (ids.get(AnalysisStatus.TechnicalRejected).equals(state.statusId())
                || ids.get(AnalysisStatus.Canceled).equals(state.statusId())))
            return null;
        return UNAVAILABLE;
    }

    static State state(Analysis analysis) {
        return analysis == null ? null
                : new State(analysis.getId(), analysis.getStatusId(), analysis.getReleasedDate(),
                        analysis.getPrintedDate());
    }

    static void require(String reason) {
        if (reason != null)
            throw new ResultSaveValidationException(reason);
    }
}
