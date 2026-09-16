package org.openelisglobal.sample.form;

import java.util.Map;

/** Shared list/detail response contract with sequential prerequisite gating. */
public record SpecimenIntakeState(Map<String, Boolean> stepProgress, String specimenIntakeStatus, String statusScope,
        String qaVerificationScope, String reportStatus, boolean hasDisposedSpecimens, boolean hasRejectedSpecimens,
        boolean hasIntakeStatusConflict, boolean hasNoActiveTests) {
    public SpecimenIntakeState {
        stepProgress = Map.copyOf(stepProgress);
    }
}
