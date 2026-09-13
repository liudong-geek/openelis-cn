package org.openelisglobal.qachecklist.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.form.QaChecklistConfirmationCommand;
import org.openelisglobal.qachecklist.service.SampleQaChecklistService;
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
public class QaChecklistConfirmationRestController {
    private final SampleQaChecklistService service;
    private final ObjectMapper json = new ObjectMapper()
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);

    public QaChecklistConfirmationRestController(SampleQaChecklistService service) {
        this.service = service;
    }

    @PostMapping(value = "/rest/qa-checklist/confirm-current", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> confirm(HttpServletRequest request) throws java.io.IOException {
        var media = MediaType.parseMediaType(request.getContentType());
        if (media.getCharset() != null && !java.nio.charset.StandardCharsets.UTF_8.equals(media.getCharset())) {
            throw QaChecklistConfirmationCommand.invalid();
        }
        byte[] bytes = request.getInputStream().readNBytes(64 * 1024 + 1);
        if (bytes.length > 64 * 1024) {
            return failure(413, "QA_CONFIRMATION_TOO_LARGE", "本次核对内容过多，请联系管理员核对。");
        }
        try {
            String content = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes)).toString();
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(service.confirmCurrentChecklist(json.readTree(content), request));
        } catch (com.fasterxml.jackson.core.JsonProcessingException | java.nio.charset.CharacterCodingException e) {
            throw QaChecklistConfirmationCommand.invalid();
        }
    }

    @ExceptionHandler(QaChecklistValidationException.class)
    public ResponseEntity<?> invalid(QaChecklistValidationException error) {
        return failure(error.getStatus(), error.getCode(),
                "QA_CONFIRMATION_STORED_INVALID".equals(error.getCode()) ? "历史核对记录不完整，请联系管理员核对，不能覆盖原记录。"
                        : error.getStatus() == 400 ? "核对提交内容不完整或格式不正确，请重新加载当前申请后再确认。" : "当前标本、核对项目或清单版本已变化，请重新核对后再确认。");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> denied(AccessDeniedException error) {
        return failure(403, "QA_CONFIRMATION_DENIED", "登录身份或标本核对权限已变化，请重新登录并核对。");
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> unknown(RuntimeException error) {
        return failure(500, "QA_CONFIRMATION_UNKNOWN", "暂时无法确认是否保存，请保留核对码并查询当前记录，不要重复提交。");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", code, "message", message));
    }
}
