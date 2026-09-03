package org.openelisglobal.common.rest.provider;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;
import org.openelisglobal.result.service.PatientResultHistoryService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/rest")
public class ResultsTreeProviderRestController extends BaseRestController {

    private final PatientResultHistoryService historyService;
    private final UserRoleService userRoleService;

    public ResultsTreeProviderRestController(PatientResultHistoryService historyService,
            UserRoleService userRoleService) {
        this.historyService = historyService;
        this.userRoleService = userRoleService;
    }

    @GetMapping(value = "/result-tree", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<ResultTree>> getResultTreeArray(HttpServletRequest request,
            @RequestParam String patientId) {
        HttpStatus authorizationFailure = authorizationFailure(request);
        if (authorizationFailure != null) {
            return ResponseEntity.status(authorizationFailure).build();
        }
        if (StringUtils.isBlank(patientId)) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(historyService.getResultTree(patientId));
    }

    @GetMapping(value = "/test-result-tree", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PanelDisplay> getTestResultTree(HttpServletRequest request, @RequestParam String patientId,
            @RequestParam String testId) {
        HttpStatus authorizationFailure = authorizationFailure(request);
        if (authorizationFailure != null) {
            return ResponseEntity.status(authorizationFailure).build();
        }
        if (StringUtils.isBlank(patientId) || StringUtils.isBlank(testId)) {
            return ResponseEntity.badRequest().build();
        }
        PanelDisplay result = historyService.getTestResultTree(patientId, testId);
        return result == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(result);
    }

    private HttpStatus authorizationFailure(HttpServletRequest request) {
        String userId = resolveUserId(request);
        if (StringUtils.isBlank(userId)) {
            return HttpStatus.UNAUTHORIZED;
        }
        return userRoleService.userInRole(userId, Constants.ROLE_RECEPTION) ? null : HttpStatus.FORBIDDEN;
    }

    private String resolveUserId(HttpServletRequest request) {
        try {
            return getSysUserId(request);
        } catch (RuntimeException e) {
            // Identity infrastructure unavailable means no PHI access. Never infer a user
            // or continue to the history service.
            return null;
        }
    }
}
