package org.openelisglobal.sample.exception;

/** Safe collection errors: never include identifiers or submitted data. */
public class SampleCollectionValidationException extends RuntimeException {
    private final int status;
    private final String errorKey;

    public SampleCollectionValidationException(int status, String errorKey) {
        super(errorKey);
        this.status = status;
        this.errorKey = errorKey;
    }

    public int getStatus() {
        return status;
    }

    public String getErrorKey() {
        return errorKey;
    }

    public String getCode() {
        return "COLLECTION_VALIDATION_FAILED";
    }
}
