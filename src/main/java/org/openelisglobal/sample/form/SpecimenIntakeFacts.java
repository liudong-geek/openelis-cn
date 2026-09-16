package org.openelisglobal.sample.form;

/**
 * Scalar current facts; a saved QA Boolean is not a versioned acceptance event.
 */
public record SpecimenIntakeFacts(boolean registered, boolean collected, boolean stored, boolean savedQaSnapshot,
        boolean hasDisposedSpecimens, boolean hasRejectedSpecimens, boolean hasIntakeStatusConflict,
        boolean hasNoActiveTests) {
}
