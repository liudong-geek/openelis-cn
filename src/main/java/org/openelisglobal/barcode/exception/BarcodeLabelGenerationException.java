package org.openelisglobal.barcode.exception;

/** Public errors contain only stable codes, never label or patient content. */
public class BarcodeLabelGenerationException extends RuntimeException {
    private final int status;
    private final String code;

    public BarcodeLabelGenerationException(int status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public String getErrorKey() {
        return "barcode.generate." + code;
    }
}
