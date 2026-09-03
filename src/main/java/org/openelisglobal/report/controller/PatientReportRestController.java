package org.openelisglobal.report.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.hibernate.ObjectNotFoundException;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.report.PatientReportDraftRequest;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.PatientReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rest/reports")
public class PatientReportRestController extends BaseRestController {

    @Autowired
    private PatientReportService patientReportService;

    @Autowired
    private PatientReportReleaseService patientReportReleaseService;

    @GetMapping("/patient-results")
    @PreAuthorize("hasRole('RESULTS')")
    public ResponseEntity<ReportingData> getPatientResults(@RequestParam String patientId, HttpServletRequest request) {
        ReportingData data = patientReportService.buildPatientResultsReport(patientId, getSysUserId(request));
        if (data == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(data);
    }

    @GetMapping(value = "/patient-results.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'REPORTS')")
    public ResponseEntity<byte[]> getPatientResultsPdf(@RequestParam String patientId, HttpServletRequest request) {
        byte[] pdf = patientReportService.buildPatientResultsPdf(patientId, getSysUserId(request));
        if (pdf == null) {
            return ResponseEntity.notFound().build();
        }

        ContentDisposition disposition = ContentDisposition.inline()
                .filename("检验结果报告.pdf", StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Report-Version", "PREVIEW-1").contentType(MediaType.APPLICATION_PDF).body(pdf);
    }

    @PostMapping(value = "/patient-results/releases/drafts", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('REPORTS')")
    public ResponseEntity<PatientReportReleaseSummary> createPatientReportDraft(
            @RequestBody PatientReportDraftRequest draftRequest, HttpServletRequest request) {
        PatientReportReleaseSummary release = patientReportReleaseService.createDraft(draftRequest.patientId(),
                draftRequest.amendmentReason(), getSysUserId(request));
        return ResponseEntity.ok(release);
    }

    @PostMapping(value = "/patient-results/releases/{releaseId}/issue", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('REPORTS')")
    public ResponseEntity<PatientReportReleaseSummary> issuePatientReport(@PathVariable Long releaseId,
            @RequestParam Long signatureId, HttpServletRequest request) {
        return ResponseEntity.ok(patientReportReleaseService.issue(releaseId, signatureId, getSysUserId(request)));
    }

    @PostMapping(value = "/patient-results/releases/{releaseId}/void", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('REPORTS')")
    public ResponseEntity<PatientReportReleaseSummary> voidPatientReport(@PathVariable Long releaseId,
            @RequestParam Long signatureId, HttpServletRequest request) {
        return ResponseEntity
                .ok(patientReportReleaseService.voidRelease(releaseId, signatureId, getSysUserId(request)));
    }

    @GetMapping(value = "/patient-results/releases", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'REPORTS')")
    public ResponseEntity<List<PatientReportReleaseSummary>> getPatientReportReleases(@RequestParam String patientId) {
        return ResponseEntity.ok(patientReportReleaseService.getByPatient(patientId));
    }

    @GetMapping(value = "/patient-results/releases/{releaseId}.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'REPORTS')")
    public ResponseEntity<byte[]> getIssuedPatientReport(@PathVariable Long releaseId) {
        return officialPdfResponse(releaseId, patientReportReleaseService.getIssuedPdf(releaseId), false);
    }

    @PostMapping(value = "/patient-results/releases/{releaseId}/print", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasRole('REPORTS')")
    public ResponseEntity<byte[]> printIssuedPatientReport(@PathVariable Long releaseId, HttpServletRequest request) {
        return officialPdfResponse(releaseId,
                patientReportReleaseService.recordPrint(releaseId, getSysUserId(request)), true);
    }

    private ResponseEntity<byte[]> officialPdfResponse(Long releaseId, byte[] pdf, boolean printRecorded) {
        ContentDisposition disposition = ContentDisposition.inline()
                .filename("正式检验报告-" + releaseId + ".pdf", StandardCharsets.UTF_8).build();
        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()).header("X-Report-Type", "OFFICIAL")
                .contentType(MediaType.APPLICATION_PDF);
        if (printRecorded) {
            response.header("X-Report-Print-Audit", "recorded");
        }
        return response.body(pdf);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleInvalidReleaseRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_REPORT_REQUEST", "message",
                exception.getMessage() == null ? "报告请求无效" : exception.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleReleaseConflict(IllegalStateException exception) {
        return ResponseEntity.status(409).body(Map.of("error", "REPORT_STATE_CONFLICT", "message",
                exception.getMessage() == null ? "报告状态不允许当前操作" : exception.getMessage()));
    }

    @ExceptionHandler(ObjectNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleMissingRelease() {
        return ResponseEntity.status(404).body(Map.of("error", "REPORT_NOT_FOUND", "message", "未找到报告记录"));
    }
}
