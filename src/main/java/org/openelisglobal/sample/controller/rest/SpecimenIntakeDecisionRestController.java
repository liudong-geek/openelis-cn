package org.openelisglobal.sample.controller.rest;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SpecimenIntakeDecisionCommand;
import org.openelisglobal.sample.service.SpecimenIntakeDecisionService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("isAuthenticated()")
public class SpecimenIntakeDecisionRestController {
    private static final int MAX_BYTES = 64 * 1024;
    private final SpecimenIntakeDecisionService service;
    private final ObjectMapper json = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);

    public SpecimenIntakeDecisionRestController(SpecimenIntakeDecisionService service) {
        this.service = service;
    }

    @PostMapping(value = "/rest/specimen-intake-decisions", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> decide(HttpServletRequest request) throws java.io.IOException {
        var media = MediaType.parseMediaType(request.getContentType());
        if (media.getCharset() != null && !StandardCharsets.UTF_8.equals(media.getCharset())) {
            throw SpecimenIntakeDecisionCommand.invalid();
        }
        byte[] bytes = request.getInputStream().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) {
            return failure(413, "SPECIMEN_DECISION_TOO_LARGE", "验收内容过大，请重新选择一管标本后提交。");
        }
        try {
            String content = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(service.decide(json.readTree(content), request));
        } catch (JsonProcessingException | CharacterCodingException error) {
            throw SpecimenIntakeDecisionCommand.invalid();
        }
    }

    @ExceptionHandler(EntrySubmissionException.class)
    public ResponseEntity<?> rejected(EntrySubmissionException error) {
        return failure(error.getStatus(), error.getCode(), error.getMessage());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> denied(AccessDeniedException error) {
        return failure(403, "SPECIMEN_DECISION_DENIED", "登录身份或标本验收权限已变化，请重新核对。");
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> failed(RuntimeException error) {
        // An uncertain commit must not be described as a proven rollback or retried
        // automatically.
        return failure(500, "SPECIMEN_DECISION_UNKNOWN", "未能确认验收保存结果，请重新查询本管记录后核对，不要直接重复提交。");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", code, "message", message));
    }
}
