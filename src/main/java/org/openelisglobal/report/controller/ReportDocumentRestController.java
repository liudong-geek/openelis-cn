package org.openelisglobal.report.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.form.ReportGroupingRules;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.service.ReportGroupingConfigurationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rest/reports")
@PreAuthorize("hasRole('REPORTS')")
public class ReportDocumentRestController extends BaseRestController {
    public record PrepareRequest(String sampleId, String groupKey) {
    }

    public record ConfigureRequest(String expectedRuleVersion, List<ReportGroupingRules.Group> groups) {
    }

    @Autowired
    private ReportDocumentService documents;
    @Autowired
    private ReportGroupingConfigurationService configuration;
    @Autowired
    private PatientReportReleaseService releases;

    @GetMapping("/group-rules")
    @PreAuthorize("hasAnyRole('REPORTS', 'ADMIN')")
    public ReportGroupingRules getRules() {
        return configuration.getRules();
    }

    @PutMapping("/group-rules")
    @PreAuthorize("hasRole('ADMIN')")
    public ReportGroupingRules configure(@RequestBody ConfigureRequest body, HttpServletRequest request) {
        return configuration.configure(body.expectedRuleVersion(), body.groups(), getSysUserId(request));
    }

    @PostMapping("/documents")
    public ReportDocumentSummary prepare(@RequestBody PrepareRequest body, HttpServletRequest request) {
        return documents.prepare(body.sampleId(), body.groupKey(), getSysUserId(request));
    }

    @GetMapping("/documents")
    public List<ReportDocumentSummary> list(@RequestParam String sampleId, HttpServletRequest request) {
        return documents.getBySample(sampleId, getSysUserId(request));
    }

    @GetMapping("/documents/{documentId}")
    public ReportDocumentSummary get(@PathVariable String documentId, HttpServletRequest request) {
        return documents.get(documentId, getSysUserId(request));
    }

    @GetMapping("/documents/{documentId}/releases")
    public List<PatientReportReleaseSummary> releases(@PathVariable String documentId, HttpServletRequest request) {
        return releases.getByDocument(documentId, getSysUserId(request));
    }

    @ExceptionHandler({ org.springframework.dao.OptimisticLockingFailureException.class,
            jakarta.persistence.OptimisticLockException.class, org.hibernate.StaleObjectStateException.class })
    public ResponseEntity<Map<String, String>> concurrentChange() {
        return ResponseEntity.status(409).body(Map.of("error", "REPORT_STATE_CONFLICT", "message",
                "Report configuration changed; reload before saving"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException exception) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "INVALID_REPORT_REQUEST", "message", exception.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> conflict(IllegalStateException exception) {
        return ResponseEntity.status(409)
                .body(Map.of("error", "REPORT_STATE_CONFLICT", "message", exception.getMessage()));
    }
}
