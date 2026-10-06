package org.openelisglobal.sample.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.sample.form.SavedOrderReadRequest;
import org.openelisglobal.sample.service.SavedOrderReadException;
import org.openelisglobal.sample.service.SavedOrderReadService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** An explicit saved-order read, detached from entry form/session defaults. */
@RestController
public class SavedOrderReadRestController {
    private final SavedOrderReadService service;

    public SavedOrderReadRestController(SavedOrderReadService service) {
        this.service = service;
    }

    @GetMapping("/rest/order/saved")
    public ResponseEntity<?> read(HttpServletRequest request) {
        SavedOrderReadRequest query;
        try {
            query = SavedOrderReadRequest.parse(request.getParameterMap());
        } catch (IllegalArgumentException e) {
            return response(400, Map.of("code", "INVALID_SAVED_ORDER_QUERY"));
        }
        try {
            return response(200, service.read(query, request));
        } catch (AccessDeniedException e) {
            return response(403, Map.of("code", "SAVED_ORDER_PERMISSION_DENIED"));
        } catch (SavedOrderReadException e) {
            return response(e.status(), Map.of("code", e.getMessage()));
        } catch (RuntimeException e) {
            return response(500, Map.of("code", "SAVED_ORDER_DATA_UNAVAILABLE"));
        }
    }

    private ResponseEntity<?> response(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store, max-age=0").header("Pragma", "no-cache")
                .body(body);
    }
}
