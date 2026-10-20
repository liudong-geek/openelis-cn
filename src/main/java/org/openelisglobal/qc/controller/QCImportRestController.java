package org.openelisglobal.qc.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.NoSuchElementException;
import org.openelisglobal.analyzer.service.QCProcessingResult;
import org.openelisglobal.analyzer.service.QCStagingService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Authorized review of retained instrument QC imports, independent of clinical
 * result acceptance.
 */
@RestController
@RequestMapping("/rest/qc/imports")
@PreAuthorize("hasAnyRole('ADMIN', 'GLOBAL_ADMIN', 'LAB_SUPERVISOR')")
public class QCImportRestController extends BaseRestController {

    @Autowired
    private QCStagingService stagingService;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "OPEN") String status,
            @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        try {
            if (limit < 1 || limit > 100 || offset < 0) {
                return ResponseEntity.badRequest().body(Map.of("errorKey", "qc.imports.invalidQuery"));
            }
            return ResponseEntity.ok(stagingService.list(status, limit, offset));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("errorKey", "qc.imports.invalidQuery"));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id) {
        try {
            return ResponseEntity.ok(stagingService.get(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("errorKey", "qc.imports.invalidRecord"));
        }
    }

    @PostMapping("/{id}/reprocess")
    public ResponseEntity<?> reprocess(@PathVariable String id, HttpServletRequest request) {
        Object sessionUser = request.getSession(false) == null ? null
                : request.getSession(false).getAttribute(IActionConstants.USER_SESSION_DATA);
        if (!(sessionUser instanceof UserSessionData user) || user.getSystemUserId() <= 0) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String userId = Integer.toString(user.getSystemUserId());
        try {
            QCProcessingResult existing = stagingService.readOutcome(id);
            if (existing.status() == QCProcessingResult.Status.CREATED
                    || "QC_LEGACY_REVIEW_REQUIRED".equals(existing.reasonCode())) {
                return receipt(existing);
            }
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("errorKey", "qc.imports.invalidRecord"));
        } catch (Exception unavailable) {
            LogEvent.logError("QCImportRestController", "reprocess", "QC original readback unavailable");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(QCProcessingResult.unknown());
        }
        // Record identity is valid. Configuration can change during processing, so
        // even business validation exceptions require transactional outcome readback.
        try {
            return receipt(stagingService.process(id, userId));
        } catch (Exception e) {
            LogEvent.logError("QCImportRestController", "reprocess", "QC transaction acknowledgement unavailable");
            // This is a separate transaction. It first checks the durable QC link;
            // it never replays a possibly committed creation.
            try {
                return receipt(stagingService.markUnknown(id, userId));
            } catch (Exception unavailable) {
                LogEvent.logError("QCImportRestController", "reprocess", "QC outcome readback unavailable");
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(QCProcessingResult.unknown());
            }
        }
    }

    private ResponseEntity<QCProcessingResult> receipt(QCProcessingResult result) {
        return ResponseEntity
                .status(result.status() == QCProcessingResult.Status.UNKNOWN ? HttpStatus.ACCEPTED : HttpStatus.OK)
                .body(result);
    }
}
