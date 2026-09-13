package org.openelisglobal.barcode.controller;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.barcode.service.BarcodeLabelGenerationPermissionService;
import org.openelisglobal.barcode.service.BarcodeLabelGenerationService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("isAuthenticated()")
public class BarcodeLabelGenerationRestController {
    private final BarcodeLabelGenerationPermissionService permissions;
    private final BarcodeLabelGenerationService service;

    public BarcodeLabelGenerationRestController(BarcodeLabelGenerationPermissionService permissions,
            BarcodeLabelGenerationService service) {
        this.permissions = permissions;
        this.service = service;
    }

    @PostMapping(value = "/rest/barcode/labels/generate", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> generate(@RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        // Do not read identifiers, patient data or counters before checking permission.
        var operator = permissions.requirePrintPermission(request);
        BarcodeLabelGenerateRequest input = BarcodeLabelGenerateRequest.fromJson(body);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.generate(input, operator));
    }

    @ExceptionHandler(BarcodeLabelGenerationException.class)
    public ResponseEntity<?> rejected(BarcodeLabelGenerationException exception) {
        return ResponseEntity.status(exception.getStatus()).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", exception.getCode(), "errorKey", exception.getErrorKey()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalidJson(HttpMessageNotReadableException exception) {
        return rejected(new BarcodeLabelGenerationException(400, "BARCODE_REQUEST_INVALID"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> unexpectedFailure(RuntimeException exception) {
        // Do not echo labels, patient data, SQL details or exception text to the client.
        return rejected(new BarcodeLabelGenerationException(500, "BARCODE_GENERATION_FAILED"));
    }
}
