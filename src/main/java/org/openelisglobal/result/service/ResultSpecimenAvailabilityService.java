package org.openelisglobal.result.service;

import java.util.List;
import java.util.Objects;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only worklist explanation; never evidence of clinical acceptance. */
@Service
public class ResultSpecimenAvailabilityService {
    private final OrdinaryResultSaveStateDAO states;
    private final IStatusService statuses;

    public ResultSpecimenAvailabilityService(OrdinaryResultSaveStateDAO states, IStatusService statuses) {
        this.states = states;
        this.statuses = statuses;
    }

    /**
     * Explain every component/placeholder using current lifecycle and intake facts.
     */
    @Transactional(readOnly = true)
    public void explain(Analysis analysis, List<TestResultItem> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        SpecimenState state = analysis != null && positive(analysis.getId())
                ? states.findSpecimenState(analysis.getId())
                : null;
        String reason = reason(analysis, state);
        for (TestResultItem row : rows) {
            if (row == null) {
                throw new IllegalArgumentException("Invalid result worklist row");
            }
            String rowReason = reason;
            if (state == null || !Objects.equals(state.analysisId(), row.getAnalysisId())
                    || !Objects.equals(state.testId(), row.getTestId())
                    || !Objects.equals(state.sampleItemId(), row.getSampleItemId())) {
                rowReason = ResultSpecimenWriteGuard.BLOCKED;
            }
            if (rowReason != null) {
                row.setReadOnly(true);
                row.setResultEntryBlockedReason(rowReason);
            }
            // An eligible lifecycle must not clear another read-only restriction
            // or turn a historical checklist into an acceptance decision.
        }
    }

    private String reason(Analysis analysis, SpecimenState state) {
        if (analysis == null || state == null || !positive(state.analysisId()) || !positive(state.testId())
                || !positive(state.sampleItemId()) || !positive(state.sampleId())
                || !state.analysisId().equals(analysis.getId()) || analysis.getTest() == null
                || !state.testId().equals(analysis.getTest().getId()) || analysis.getSampleItem() == null
                || !state.sampleItemId().equals(analysis.getSampleItem().getId())
                || analysis.getSampleItem().getSample() == null
                || !state.sampleId().equals(analysis.getSampleItem().getSample().getId())) {
            return ResultSpecimenWriteGuard.BLOCKED;
        }
        var item = analysis.getSampleItem();
        if (Boolean.TRUE.equals(state.voided()) || item.isVoided()) {
            return "error.results.specimenVoided";
        }
        if (Boolean.TRUE.equals(state.rejected()) || item.isRejected()) {
            return "error.results.specimenRejected";
        }
        if (!Boolean.FALSE.equals(state.voided()) || !Boolean.FALSE.equals(state.rejected())
                || !Objects.equals(state.statusId(), item.getStatusId())) {
            return ResultSpecimenWriteGuard.BLOCKED;
        }
        String entered = statuses.getStatusID(SampleStatus.Entered);
        if (!positive(entered)) {
            return ResultSpecimenWriteGuard.BLOCKED;
        }
        java.util.Set<String> configuredIds = new java.util.HashSet<>();
        configuredIds.add(entered);
        for (SampleStatus status : List.of(SampleStatus.SampleRejected, SampleStatus.Canceled, SampleStatus.Disposed)) {
            String id = statuses.getStatusID(status);
            if (positive(id) && !configuredIds.add(id)) {
                return ResultSpecimenWriteGuard.BLOCKED;
            }
        }
        if (entered.equals(state.statusId())) {
            return ResultIntakeAdmission.reason(states.findIntakeState(state.sampleItemId()), state.sampleId(),
                    state.sampleItemId(), state.analysisId(), state.testId());
        }
        if (positive(state.statusId()) && state.statusId().equals(statuses.getStatusID(SampleStatus.SampleRejected))) {
            return "error.results.specimenRejected";
        }
        if (positive(state.statusId()) && state.statusId().equals(statuses.getStatusID(SampleStatus.Canceled))) {
            return "error.results.specimenCanceled";
        }
        if (positive(state.statusId()) && state.statusId().equals(statuses.getStatusID(SampleStatus.Disposed))) {
            return "error.results.specimenDisposed";
        }
        return ResultSpecimenWriteGuard.BLOCKED;
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }
}
