package org.openelisglobal.qachecklist.exception;

/** Expected, safe-to-render rejection of an invalid checklist operation. */
public class QaChecklistValidationException extends RuntimeException {
    private final int status;
    private final String code;
    private final String errorKey;
    private final String blockedStep;

    public QaChecklistValidationException(int status, String code, String errorKey, String blockedStep) {
        super(code);
        this.status = status;
        this.code = code;
        this.errorKey = errorKey;
        this.blockedStep = blockedStep;
    }

    public QaChecklistValidationException(int status, String code, String errorKey) {
        this(status, code, errorKey, null);
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public String getErrorKey() {
        return errorKey;
    }

    public String getBlockedStep() {
        return blockedStep;
    }
}
