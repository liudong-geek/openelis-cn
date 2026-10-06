package org.openelisglobal.qaevent.service;

/** Stable error data, without implementation or clinical details. */
public class NceWorkspaceException extends RuntimeException {
    private final int status;
    private final String code;

    public NceWorkspaceException(int status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public static class ClaimCollision extends NceWorkspaceException {
        private final String requestHash;

        public ClaimCollision(String hash) {
            super(409, "NCE_RECEIPT_COLLISION");
            requestHash = hash;
        }

        public String requestHash() {
            return requestHash;
        }
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
