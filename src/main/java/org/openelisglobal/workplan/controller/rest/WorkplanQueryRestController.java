package org.openelisglobal.workplan.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.workplan.form.*;
import org.openelisglobal.workplan.service.WorkplanQueryService;
import org.openelisglobal.workplan.service.WorkplanReportService;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class WorkplanQueryRestController extends BaseRestController {
    private final WorkplanQueryService queryService;
    private final WorkplanReportService reports;

    public WorkplanQueryRestController(WorkplanQueryService queryService, WorkplanReportService reports) {
        this.queryService = queryService;
        this.reports = reports;
    }

    @GetMapping(value = "/rest/Workplan", params = "queryVersion=2")
    public WorkplanQueryResponse query(HttpServletRequest request) {
        return queryService.query(request, WorkplanQueryRequest.parse(request.getParameterMap()));
    }

    @PostMapping(value = "/rest/PrintWorkplanReport", params = "queryVersion=2")
    public ResponseEntity<byte[]> print(HttpServletRequest request, @RequestBody WorkplanPrintRequest selection) {
        if (request.getParameterMap().size() != 1 || request.getParameterValues("queryVersion").length != 1)
            throw new IllegalArgumentException("workplan.invalidPrintSelection");
        var report = queryService.preparePrint(request, selection);
        byte[] pdf = reports.render(report);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=WorkplanReport.pdf")
                .cacheControl(CacheControl.noStore()).body(pdf);
    }

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> invalidBody() {
        return ResponseEntity.badRequest().body(Map.of("errorCode", "workplan.invalidPrintSelection"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(
                Map.of("errorCode", e.getMessage() != null && e.getMessage().startsWith("workplan.") ? e.getMessage()
                        : "workplan.invalidQuery"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> denied() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("errorCode", "workplan.permissionDenied"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> stale(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("errorCode", "workplan.selectionChanged"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> unavailable() {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("errorCode", "workplan.queryUnavailable"));
    }
}
