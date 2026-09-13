package org.openelisglobal.sample.controller.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.service.SpecimenReceiptService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("isAuthenticated()")
public class SpecimenReceiptRestController {
    private final SpecimenReceiptService service;
    private static final int MAX_BYTES = 64 * 1024;
    private final ObjectMapper json = new ObjectMapper()
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);

    public SpecimenReceiptRestController(SpecimenReceiptService service) {
        this.service = service;
    }

    @PostMapping(value = "/rest/specimen-receipts", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> receive(HttpServletRequest request) throws java.io.IOException {
        var media = MediaType.parseMediaType(request.getContentType());
        if (media.getCharset() != null && !java.nio.charset.StandardCharsets.UTF_8.equals(media.getCharset())) {
            throw org.openelisglobal.sample.form.SpecimenReceiptCommand.invalid();
        }
        byte[] bytes = request.getInputStream().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) {
            return failure(413, "SPECIMEN_RECEIPT_TOO_LARGE", "签收内容过大，请减少本次标本数量。");
        }
        try {
            String content = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes)).toString();
            var body = json.readTree(content);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.receive(body, request));
        } catch (com.fasterxml.jackson.core.JsonProcessingException
                | java.nio.charset.CharacterCodingException invalid) {
            throw org.openelisglobal.sample.form.SpecimenReceiptCommand.invalid();
        }
    }

    @ExceptionHandler(EntrySubmissionException.class)
    public ResponseEntity<?> rejected(EntrySubmissionException error) {
        return failure(error.getStatus(), error.getCode(), error.getMessage());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> denied(AccessDeniedException error) {
        return failure(403, "SPECIMEN_RECEIPT_DENIED", "登录身份或标本登记权限已变化，请重新核对后签收。");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> malformed(HttpMessageNotReadableException error) {
        return rejected(org.openelisglobal.sample.form.SpecimenReceiptCommand.invalid());
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> failed(RuntimeException error) {
        // No claim that 500 proves rollback; the client must verify persisted per-tube
        // facts.
        return failure(500, "SPECIMEN_RECEIPT_UNKNOWN", "未能确认签收结果，请核对当前逐管记录，不要直接重复提交。");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", code, "message", message));
    }
}
