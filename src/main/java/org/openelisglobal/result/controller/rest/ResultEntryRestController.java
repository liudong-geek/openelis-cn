package org.openelisglobal.result.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.validator.GenericValidator;
import org.hibernate.StaleObjectStateException;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.dataexchange.fhir.exception.FhirPersistanceException;
import org.openelisglobal.dataexchange.fhir.exception.FhirTransformationException;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.controller.LogbookResultsBaseController;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.result.form.SingleResultEntryForm;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.ResultEntryPresenceService;
import org.openelisglobal.result.service.ResultEntryWorklistService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testalertrule.service.TestAlertEvaluationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * REST surface for the unified Results worklist (OGC-1020, slice R1 of
 * OGC-811).
 *
 * <p>
 * Concurrency model (FRS §O — version checks and transactional row locks):
 * <ul>
 * <li><b>FR-O1</b> — the save payload is one analysis ({@code
 * SingleResultEntryForm}); saving a row can never write another row.</li>
 * <li><b>FR-O2</b> — the client round-trips {@code analysisLastupdated} (loaded
 * via {@code ResultsLoadUtility}); a mismatch is rejected 409 naming who saved
 * and when. Hibernate's {@code @Version} on {@code
 * Analysis.lastupdated} remains the transactional backstop.</li>
 * <li><b>FR-O3</b> — session-bound, in-memory presence; advisory only.</li>
 * </ul>
 *
 * Audit: result/analysis writes are recorded automatically in the {@code
 * history} table by the audited services (activity 'I' = RESULT_SAVED, 'U' =
 * RESULT_MODIFIED semantics; the single-char activity column predates named
 * events).
 */
@Controller
@RequestMapping(value = "/rest/results-entry")
public class ResultEntryRestController extends LogbookResultsBaseController {

    @Autowired
    private TestSectionService testSectionService;
    @Autowired
    private UserService userService;
    @Autowired
    private RoleService roleService;
    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private LogbookResultsPersistService logbookPersistService;
    @Autowired
    private FhirTransformService fhirTransformService;
    @Autowired
    private ResultEntryPresenceService presenceService;
    @Autowired
    private ResultEntryWorklistService resultEntryWorklistService;
    @Autowired(required = false)
    private TestAlertEvaluationService testAlertEvaluationService;

    /**
     * Lab Units the user may enter results for, each carrying its domain so the
     * page can derive {@code currentDomain} (FR-M1).
     */
    @GetMapping(value = "lab-units", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @PreAuthorize("hasRole('RESULTS')")
    public List<Map<String, String>> getUserLabUnits(HttpServletRequest request) {
        Role resultsRole = roleService.getRoleByName(Constants.ROLE_RESULTS);
        if (resultsRole == null) {
            return Collections.emptyList();
        }
        List<IdValuePair> sections = userService.getUserTestSections(getSysUserId(request), resultsRole.getId());
        List<Map<String, String>> labUnits = new ArrayList<>();
        for (IdValuePair pair : sections) {
            Map<String, String> unit = new HashMap<>();
            unit.put("id", pair.getId());
            unit.put("value", pair.getValue());
            TestSection section = testSectionService.get(pair.getId());
            unit.put("domain",
                    section != null && !GenericValidator.isBlankOrNull(section.getDomain()) ? section.getDomain()
                            : "CLINICAL");
            labUnits.add(unit);
        }
        return labUnits;
    }

    /**
     * Canonical dashboard-to-results task list. Its predicate deliberately matches
     * the dashboard's ORDERS_IN_PROGRESS metric (analysis status NotStarted), then
     * applies the current user's Results lab-unit permissions.
     */
    @GetMapping(value = "pending", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @PreAuthorize("hasRole('RESULTS')")
    public Map<String, Object> getPendingResults(HttpServletRequest request) {
        List<TestResultItem> pendingResults = resultEntryWorklistService
                .getPendingResultsForUser(getSysUserId(request));
        Map<String, Object> response = new HashMap<>();
        response.put("testResult", pendingResults);
        response.put("total", pendingResults.size());
        return response;
    }

    /**
     * Per-analysis result save (FR-O1/FR-O2). The path names the one analysis this
     * request may write; the body carries its edited values and the version token
     * it was loaded with.
     */
    @PostMapping(value = "analysis/{analysisId}/result", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @PreAuthorize("hasRole('RESULTS')")
    public ResponseEntity<Map<String, Object>> saveSingleAnalysisResult(HttpServletRequest request,
            @PathVariable String analysisId,
            @Validated(LogbookResultsForm.LogbookResults.class) @RequestBody SingleResultEntryForm form) {

        TestResultItem item = form.getTestResult();
        Map<String, Object> body = new HashMap<>();

        if (item == null || !analysisId.equals(item.getAnalysisId())) {
            body.put("error", "error.results.analysisMismatch");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        org.openelisglobal.result.service.ResultEntrySaveOutcome saved;
        try {
            saved = logbookPersistService.saveSingleResult(item, request);
        } catch (LIMSRuntimeException e) {
            LogEvent.logError(e);
            body.put("error", e.getCause() instanceof StaleObjectStateException ? "error.results.staleSave"
                    : "errors.UpdateException");
            return ResponseEntity.status(e.getCause() instanceof StaleObjectStateException ? HttpStatus.CONFLICT
                    : HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
        if (saved.status() != 200)
            return ResponseEntity.status(saved.status()).body(saved.response());

        ResultsUpdateDataSet dataSet = saved.dataSet();
        // The service owns a new transaction. These effects cannot precede its commit.
        try {
            fhirTransformService.transformPersistResultsEntryFhirObjects(dataSet);
        } catch (FhirTransformationException | FhirPersistanceException e) {
            LogEvent.logError(e);
        }
        if (testAlertEvaluationService != null) {
            String currentUser = dataSet.getCurrentUserId();
            dataSet.getNewResults().forEach(rs -> {
                try {
                    testAlertEvaluationService.evaluateAndDispatch(rs.result, currentUser);
                } catch (RuntimeException ex) {
                    LogEvent.logError(ex);
                }
            });
        }
        for (IResultUpdate updater : saved.updaters()) {
            try {
                updater.postTransactionalCommitUpdate(dataSet);
            } catch (RuntimeException e) {
                LogEvent.logError(e);
            }
        }
        return ResponseEntity.ok(saved.response());
    }

    /**
     * FR-O3 presence heartbeat. Body: {@code analysisId} the caller currently has
     * open in Edit (null/blank = none) and the {@code visibleAnalysisIds} on their
     * screen. Returns analysisId → display name of the OTHER user editing it.
     */
    @PostMapping(value = "presence", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @PreAuthorize("hasRole('RESULTS')")
    public Map<String, String> presenceHeartbeat(HttpServletRequest request, @RequestBody PresenceHeartbeatForm form) {
        String sessionId = request.getSession().getId();
        presenceService.heartbeat(sessionId, getUserDisplayName(getSysUserId(request)), form.getAnalysisId());
        return presenceService.getPresence(
                form.getVisibleAnalysisIds() == null ? Collections.emptyList() : form.getVisibleAnalysisIds(),
                sessionId);
    }

    public static class PresenceHeartbeatForm {
        private String analysisId;
        private List<String> visibleAnalysisIds;

        public String getAnalysisId() {
            return analysisId;
        }

        public void setAnalysisId(String analysisId) {
            this.analysisId = analysisId;
        }

        public List<String> getVisibleAnalysisIds() {
            return visibleAnalysisIds;
        }

        public void setVisibleAnalysisIds(List<String> visibleAnalysisIds) {
            this.visibleAnalysisIds = visibleAnalysisIds;
        }
    }

    @ExceptionHandler(ResultSaveValidationException.class)
    public ResponseEntity<Map<String, Object>> resultSaveValidationFailure(ResultSaveValidationException exception) {
        String code = exception.getErrorCode();
        List<String> known = List.of("error.results.specimenNotEligible", "error.results.analysisMismatch",
                "error.results.resultMismatch", "error.results.qualifiedResultMismatch", "error.results.testMismatch",
                "error.results.componentMismatch", "error.results.resultDefinitionMissing",
                "error.results.orderMismatch", "error.results.reviewedResultLocked",
                "error.results.statusConfigurationInvalid", "error.results.specimenIntakeMissing",
                "error.results.specimenIntakeChanged", "error.results.testIntakeChanged",
                "error.results.analysisEntryUnavailable", "error.results.staleSave", "error.results.specimenRejected");
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", code != null && known.contains(code) ? code : "error.save.msg"));
    }

    private String getUserDisplayName(String sysUserId) {
        try {
            SystemUser user = systemUserService.getUserById(sysUserId);
            if (user != null) {
                return user.getDisplayName();
            }
        } catch (RuntimeException e) {
            LogEvent.logError(e);
        }
        return MessageUtil.getMessage("label.results.anotherUser");
    }

    @Override
    protected String findLocalForward(String forward) {
        return "PageNotFound";
    }
}
