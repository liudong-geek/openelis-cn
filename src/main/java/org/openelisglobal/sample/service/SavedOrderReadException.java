package org.openelisglobal.sample.service;

public class SavedOrderReadException extends RuntimeException {
    private final int status;

    public SavedOrderReadException(int status, String code) {
        super(code);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
