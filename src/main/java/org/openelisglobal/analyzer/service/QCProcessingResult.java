package org.openelisglobal.analyzer.service;

/**
 * Receipt for QC result creation. CREATED does not mean that QC rules passed.
 */
public record QCProcessingResult(Status status, String qcResultId, String reasonCode) {
    public enum Status {
        CREATED, NOT_PROCESSED, UNKNOWN, DUPLICATE_SKIPPED
    }

    public static QCProcessingResult created(String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalStateException("QC result creation returned no persisted identifier");
        }
        return new QCProcessingResult(Status.CREATED, id, null);
    }

    public static QCProcessingResult notProcessed(String reasonCode) {
        return new QCProcessingResult(Status.NOT_PROCESSED, null, reasonCode);
    }

    public static QCProcessingResult unknown() {
        return new QCProcessingResult(Status.UNKNOWN, null, "QC_PROCESSING_OUTCOME_UNKNOWN");
    }

    public static QCProcessingResult duplicateSkipped() {
        return new QCProcessingResult(Status.DUPLICATE_SKIPPED, null, "DUPLICATE_STAGING_SKIPPED");
    }
}
