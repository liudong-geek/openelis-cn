package org.openelisglobal.result.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Stable, non-identifying rejection, including transactional rollback failures.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class ResultSaveValidationException extends IllegalArgumentException {
    private final String errorCode;

    public ResultSaveValidationException(String errorCode) {
        super(errorCode);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
