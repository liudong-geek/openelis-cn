package org.openelisglobal.sample.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("hasAnyRole('RECEPTION', 'GLOBAL_ADMIN')")
public class SpecimenLookupRestController {
    private final SpecimenLookupService service;

    public SpecimenLookupRestController(SpecimenLookupService service) {
        this.service = service;
    }

    @GetMapping(value = "/rest/specimen-intake/lookup", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> lookup(@RequestParam(required = false) String code, HttpServletRequest request) {
        if (request.getParameterMap().size() != 1 || request.getParameterValues("code") == null
                || request.getParameterValues("code").length != 1) {
            return error(400, "SPECIMEN_LOOKUP_INVALID_CODE", "请只输入一个申请号或标本管码。");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.lookup(code == null ? null : code.trim(), request));
    }

    @ExceptionHandler(SpecimenLookupService.Failure.class)
    public ResponseEntity<?> rejected(SpecimenLookupService.Failure error) {
        return error(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> denied(AccessDeniedException ignored) {
        return error(403, "SPECIMEN_LOOKUP_DENIED", "当前登录身份或接收岗检验权限不足。");
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> unavailable(RuntimeException ignored) {
        return error(503, "SPECIMEN_LOOKUP_UNAVAILABLE", "暂时无法确认查询结果，请稍后重试。");
    }

    private ResponseEntity<?> error(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", code, "message", message));
    }
}
