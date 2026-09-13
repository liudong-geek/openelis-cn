package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;

/** Server-only wire capture; never deserialized as part of the submitted form. */
public record EntrySubmissionCommand(String key, String fingerprint, SamplePatientEntryForm form) {
    public static final String HEADER = "Idempotency-Key";
    public static final String ATTRIBUTE = EntrySubmissionCommand.class.getName();
    public static final String HASH_VERSION = "raw-json-v1";
    public static final int MAX_BYTES = 16 * 1024 * 1024;

    public static String validateKey(String key) {
        try {
            if (key == null || !UUID.fromString(key).toString().equals(key)) {
                throw new IllegalArgumentException();
            }
            return key;
        } catch (IllegalArgumentException failure) {
            throw new EntrySubmissionException(400, "ENTRY_SUBMISSION_INVALID", "保存标识无效，请保留当前草稿并重新打开申请。");
        }
    }

    public static String fingerprint(byte[] bytes) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update((HASH_VERSION + "\n").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public static EntrySubmissionCommand fromRequest(HttpServletRequest request, SamplePatientEntryForm form) {
        Object value = request.getAttribute(ATTRIBUTE);
        if (!(value instanceof EntrySubmissionCommand command) || command.form != form
                || !command.key.equals(validateKey(request.getHeader(HEADER)))
                || command.fingerprint == null || !command.fingerprint.matches("[a-f0-9]{64}")) {
            throw new EntrySubmissionException(400, "ENTRY_SUBMISSION_INVALID", "无法核实本次保存内容，请保留草稿，不要重复提交。");
        }
        return command;
    }
}
