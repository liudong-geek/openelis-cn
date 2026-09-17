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

    public record DraftRequest(String amendmentReason) {
    }

    public record IssueRequest(String snapshotSha256,
            @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String password) {
        @Override
        public String toString() {
            return "IssueRequest[credentials=REDACTED]";
        }
    }

    public record VoidRequest(String expectedPdfSha256,
            @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String password,
            String reason) {
        @Override
        public String toString() {
            return "VoidRequest[credentials=REDACTED]";
        }
    }

    @Autowired
    private ReportDocumentService documents;
    @Autowired
    private ReportGroupingConfigurationService configuration;
    @Autowired
    private PatientReportReleaseService releases;

    @GetMapping("/applications")
    public List<org.openelisglobal.report.form.ReportApplicationSummary> applications(@RequestParam String patientId,
            HttpServletRequest request) {
        return documents.getApplications(patientId, getSysUserId(request));
    }

    @PostMapping("/documents/{documentId}/releases")
    public PatientReportReleaseSummary draft(@PathVariable String documentId, @RequestBody DraftRequest body,
            HttpServletRequest request) {
        return releases.createDocumentDraft(documentId, body.amendmentReason(), getSysUserId(request));
    }

    @PostMapping("/documents/{documentId}/releases/{releaseId}/freeze")
    public org.openelisglobal.report.form.ReportFrozenResponse freeze(@PathVariable String documentId,
            @PathVariable Long releaseId, HttpServletRequest request) {
        return releases.freeze(documentId, releaseId, getSysUserId(request));
    }

    @GetMapping("/documents/{documentId}/releases/{releaseId}/snapshot")
    public org.openelisglobal.report.form.ReportFrozenResponse snapshot(@PathVariable String documentId,
            @PathVariable Long releaseId, HttpServletRequest request) {
        return releases.getSnapshot(documentId, releaseId, getSysUserId(request));
    }

    @GetMapping(value = "/documents/{documentId}/releases/{releaseId}/preview.pdf", produces = "application/pdf")
    public ResponseEntity<byte[]> preview(@PathVariable String documentId, @PathVariable Long releaseId,
            HttpServletRequest request) {
        return ResponseEntity.ok().contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                .header("X-Report-Type", "FROZEN_PREVIEW").header("X-Content-Type-Options", "nosniff")
                .header("Cache-Control", "no-store, private")
                .body(releases.previewFrozen(documentId, releaseId, getSysUserId(request)));
    }

    @PostMapping("/documents/{documentId}/releases/{releaseId}/issue")
    public PatientReportReleaseSummary issue(@PathVariable String documentId, @PathVariable Long releaseId,
            @RequestBody IssueRequest body, HttpServletRequest request) {
        return releases.issueDocument(documentId, releaseId, body.snapshotSha256(), body.password(),
                getSysUserId(request), request.getRemoteAddr(), request.getHeader("User-Agent"));
    }

    @PostMapping("/documents/{documentId}/releases/{releaseId}/void")
    public PatientReportReleaseSummary voidReport(@PathVariable String documentId, @PathVariable Long releaseId,
            @RequestBody VoidRequest body, HttpServletRequest request) {
        return releases.voidDocument(documentId, releaseId, body.expectedPdfSha256(), body.password(), body.reason(),
                getSysUserId(request), request.getRemoteAddr(), request.getHeader("User-Agent"));
    }

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

    @GetMapping("/documents/{documentId}/releases/{releaseId}")
    public org.openelisglobal.report.form.ReportReleaseDetail detail(@PathVariable String documentId,
            @PathVariable Long releaseId, HttpServletRequest request) {
        return releases.getDetail(documentId, releaseId, getSysUserId(request));
    }

    @GetMapping(value = "/documents/{documentId}/releases/{releaseId}.pdf", produces = "application/pdf")
    public ResponseEntity<byte[]> original(@PathVariable String documentId, @PathVariable Long releaseId,
            HttpServletRequest request) {
        return PatientReportRestController
                .originalPdfResponse(releases.getOriginalPdf(documentId, releaseId, getSysUserId(request)), false);
    }

    @PostMapping(value = "/documents/{documentId}/releases/{releaseId}/print", produces = "application/pdf")
    public ResponseEntity<byte[]> print(@PathVariable String documentId, @PathVariable Long releaseId,
            HttpServletRequest request) {
        return PatientReportRestController
                .originalPdfResponse(releases.recordPrint(documentId, releaseId, getSysUserId(request)), true);
    }

    @org.springframework.web.bind.annotation.ModelAttribute
    public void preventClinicalResponseCaching(jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader(org.springframework.http.HttpHeaders.CACHE_CONTROL, "no-store, private");
    }

    @ExceptionHandler(org.hibernate.ObjectNotFoundException.class)
    public ResponseEntity<Map<String, String>> missing() {
        return ResponseEntity.status(404).body(Map.of("error", "REPORT_NOT_FOUND", "message", "Report does not exist"));
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
