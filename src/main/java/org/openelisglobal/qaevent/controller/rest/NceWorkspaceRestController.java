package org.openelisglobal.qaevent.controller.rest;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceWorkspaceQuery;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.service.NceWorkspaceService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Versioned detached NCE contract; legacy handlers retain their explicit
 * migration debt.
 */
@RestController
@RequestMapping("/rest/nce")
public class NceWorkspaceRestController {
    private final NceWorkspaceService service;
    private final ObjectMapper strict;

    public NceWorkspaceRestController(NceWorkspaceService service) {
        this.service = service;
        this.strict = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

    @GetMapping("/registration/meta")
    public ResponseEntity<?> meta(@RequestParam Map<String, String> query, HttpServletRequest request) {
        query(query, Set.of("queryVersion"));
        return ok(service.meta(request));
    }

    @GetMapping("/workspace")
    public ResponseEntity<?> workspace(@RequestParam Map<String, String> query, HttpServletRequest request) {
        query(query, Set.of("queryVersion", "keyword", "status", "categoryId", "severity", "page", "pageSize"));
        var q = new NceWorkspaceQuery(query.get("keyword"), query.get("status"), query.get("categoryId"),
                query.get("severity"), NceWorkspaceQuery.integer(query.get("page"), 1),
                NceWorkspaceQuery.integer(query.get("pageSize"), 25));
        return ok(service.workspace(q, request));
    }

    @GetMapping("/registration/orders")
    public ResponseEntity<?> orders(@RequestParam Map<String, String> query, HttpServletRequest request) {
        query(query, Set.of("queryVersion", "searchType", "value", "page", "pageSize"));
        return ok(service.orders(query.get("searchType"), query.get("value"),
                NceWorkspaceQuery.integer(query.get("page"), 1), NceWorkspaceQuery.integer(query.get("pageSize"), 10),
                request));
    }

    @GetMapping("/registration/receipt")
    public ResponseEntity<?> receipt(@RequestParam Map<String, String> query, HttpServletRequest request) {
        query(query, Set.of("queryVersion", "requestId", "operation"));
        return ok(service.receipt(query.get("requestId"), query.get("operation"), request));
    }

    @GetMapping("/registration/users")
    public ResponseEntity<?> users(@RequestParam Map<String, String> query, HttpServletRequest request) {
        query(query, Set.of("queryVersion", "search"));
        return ok(service.users(query.get("search"), request));
    }

    @GetMapping("/registration/attachments/{attachmentId}")
    public ResponseEntity<?> attachment(@PathVariable String attachmentId, @RequestParam Map<String, String> query,
            HttpServletRequest request) {
        query(query, Set.of("queryVersion", "eventId"));
        var file = service.attachment(query.get("eventId"), attachmentId, request);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .contentLength(file.bytes().length).body(file.bytes());
    }

    @PostMapping(value = "/registration", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> create(@RequestParam Map<String, String> query, @RequestBody String body,
            HttpServletRequest request) {
        query(query, Set.of("queryVersion"));
        return create(parse(body, NceRegistrationCommand.class, request), List.of(), request);
    }

    @PostMapping(value = "/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(@RequestParam Map<String, String> query, @RequestPart("nceData") String body,
            @RequestPart(value = "files", required = false) List<MultipartFile> files, HttpServletRequest request) {
        // Multipart text parts are not query filters; inspect URL parameters only.
        query(query, Set.of("queryVersion", "nceData"));
        return create(parse(body, NceRegistrationCommand.class, request), files, request);
    }

    private ResponseEntity<?> create(NceRegistrationCommand command, List<MultipartFile> files,
            HttpServletRequest request) {
        request.setAttribute("nceRequestId", command.requestId());
        try {
            return ok(service.create(command, files, request));
        } catch (NceWorkspaceException.ClaimCollision collision) {
            return collision(command.requestId(), "CREATE", collision, request);
        }
    }

    @PostMapping(value = "/events/{eventId}/actions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> action(@PathVariable String eventId, @RequestParam Map<String, String> query,
            @RequestBody String body, HttpServletRequest request) {
        query(query, Set.of("queryVersion"));
        var command = parse(body, NceActionCommand.class, request);
        request.setAttribute("nceRequestId", command.requestId());
        try {
            return ok(service.action(eventId, command, request));
        } catch (NceWorkspaceException.ClaimCollision collision) {
            return collision(command.requestId(), command.type(), collision, request);
        }
    }

    private ResponseEntity<?> collision(String key, String operation, NceWorkspaceException.ClaimCollision collision,
            HttpServletRequest request) {
        var result = service.receipt(key, operation, request);
        if ("APPLIED".equals(result.outcome()) && collision.requestHash().equals(result.requestHash()))
            return ok(result);
        throw new NceWorkspaceException(409,
                "APPLIED".equals(result.outcome()) ? "NCE_REQUEST_REPLAY_MISMATCH" : "NCE_RECEIPT_INCOMPLETE");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> invalid(IllegalArgumentException failure, HttpServletRequest request) {
        return error(400, "INVALID_NCE_REQUEST", "NOT_APPLIED", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> denied(AccessDeniedException failure, HttpServletRequest request) {
        return error(403, "NCE_PERMISSION_DENIED", isWrite(request) ? "UNKNOWN" : "NOT_APPLIED", request);
    }

    @ExceptionHandler(NceWorkspaceException.class)
    public ResponseEntity<?> failed(NceWorkspaceException failure, HttpServletRequest request) {
        boolean uncertain = isWrite(request)
                && Set.of("NCE_REQUEST_REPLAY_MISMATCH", "NCE_REQUEST_OPERATION_MISMATCH", "NCE_RECEIPT_INCOMPLETE")
                        .contains(failure.code());
        return error(failure.status(), failure.code(), uncertain ? "UNKNOWN" : "NOT_APPLIED", request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unknown(Exception failure, HttpServletRequest request) {
        return error(500, "NCE_RESULT_UNKNOWN", "UNKNOWN", request);
    }

    private boolean isWrite(HttpServletRequest request) {
        return "POST".equals(request.getMethod());
    }

    private ResponseEntity<?> error(int status, String code, String outcome, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("queryVersion", "2");
        body.put("code", code);
        body.put("outcome", outcome);
        body.put("requestId", request.getAttribute("nceRequestId"));
        Object actor = request.getAttribute("nceCurrentUserId");
        if (actor instanceof String id && id.matches("[1-9][0-9]*"))
            body.put("currentUserId", id);
        return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }

    private <T> T parse(String body, Class<T> type, HttpServletRequest request) {
        if (body == null || body.length() > 1024 * 1024)
            throw new IllegalArgumentException("INVALID_NCE_REQUEST");
        try {
            var tree = strict.readTree(body);
            if (tree != null && tree.isObject() && tree.path("requestId").isTextual()) {
                try {
                    request.setAttribute("nceRequestId", NceRegistrationCommand.key(tree.path("requestId").asText()));
                } catch (IllegalArgumentException invalidKey) {
                    /* Do not guess or reflect an invalid receipt key. */}
            }
            var value = strict.treeToValue(tree, type);
            if (value == null)
                throw new IllegalArgumentException("INVALID_NCE_REQUEST");
            return value;
        } catch (Exception e) {
            throw new IllegalArgumentException("INVALID_NCE_REQUEST");
        }
    }

    private void query(Map<String, String> query, Set<String> allowed) {
        if (!"2".equals(query.get("queryVersion")) || !allowed.containsAll(query.keySet()))
            throw new IllegalArgumentException("INVALID_NCE_QUERY");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
