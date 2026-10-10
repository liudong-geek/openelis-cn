package org.openelisglobal.result.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.service.ResultRestrictionException;
import org.openelisglobal.result.service.ResultRestrictionService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ResultRestrictionRestController {
    private final ResultRestrictionService service;

    public ResultRestrictionRestController(ResultRestrictionService service) {
        this.service = service;
    }

    @GetMapping(value = "/rest/results-entry/analysis/{analysisId}/restriction", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> inspect(@PathVariable String analysisId, HttpServletRequest request) {
        final ResultRestrictionRequest query;
        try {
            query = ResultRestrictionRequest.parse(analysisId, request.getParameterMap());
        } catch (IllegalArgumentException invalid) {
            return failure(400, "RESULT_RESTRICTION_INVALID_QUERY", request);
        }
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.inspect(query, request));
        } catch (AccessDeniedException denied) {
            return failure(403, "RESULT_RESTRICTION_DENIED", request);
        } catch (ResultRestrictionException error) {
            return failure(error.status(), error.code(), request);
        } catch (RuntimeException unavailable) {
            return failure(503, "RESULT_RESTRICTION_UNAVAILABLE", request);
        }
    }

    private ResponseEntity<?> failure(int status, String code, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("queryVersion", "2");
        var actor = request.getAttribute("resultRestrictionCurrentUserId");
        if (actor instanceof String id && id.matches("[1-9][0-9]*"))
            body.put("currentUserId", id);
        body.put("code", code);
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
}
