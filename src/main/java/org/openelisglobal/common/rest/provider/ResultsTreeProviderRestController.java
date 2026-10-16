package org.openelisglobal.common.rest.provider;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;
import org.openelisglobal.result.service.PatientResultHistoryService;
import org.openelisglobal.systemuser.service.UserService;
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
    private final UserService userService;

    public ResultsTreeProviderRestController(PatientResultHistoryService historyService,
            UserRoleService userRoleService, UserService userService) {
        this.historyService = historyService;
        this.userRoleService = userRoleService;
        this.userService = userService;
    }

    @GetMapping(value = "/result-tree", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<ResultTree>> getResultTreeArray(HttpServletRequest request,
            @RequestParam String patientId) {
        String userId = resolveUserId(request);
        HttpStatus authorizationFailure = authorizationFailure(userId);
        if (authorizationFailure != null) {
            return ResponseEntity.status(authorizationFailure).build();
        }
        if (StringUtils.isBlank(patientId)) {
            return ResponseEntity.badRequest().build();
        }
        Set<String> sections = historySections(userId);
        return ResponseEntity.ok(sections == null ? historyService.getResultTree(patientId)
                : historyService.getResultTree(patientId, sections));
    }

    @GetMapping(value = "/test-result-tree", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PanelDisplay> getTestResultTree(HttpServletRequest request, @RequestParam String patientId,
            @RequestParam String testId) {
        String userId = resolveUserId(request);
        HttpStatus authorizationFailure = authorizationFailure(userId);
        if (authorizationFailure != null) {
            return ResponseEntity.status(authorizationFailure).build();
        }
        if (StringUtils.isBlank(patientId) || StringUtils.isBlank(testId)) {
            return ResponseEntity.badRequest().build();
        }
        Set<String> sections = historySections(userId);
        PanelDisplay result = sections == null ? historyService.getTestResultTree(patientId, testId)
                : historyService.getTestResultTree(patientId, testId, sections);
        return result == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(result);
    }

    private HttpStatus authorizationFailure(String userId) {
        if (StringUtils.isBlank(userId)) {
            return HttpStatus.UNAUTHORIZED;
        }
        // Match the existing patient-results route and report preview read roles.
        return userRoleService.userInRole(userId, Constants.ROLE_RECEPTION)
                || userRoleService.userInRole(userId, Constants.ROLE_RESULTS)
                || userRoleService.userInRole(userId, Constants.ROLE_REPORTS) ? null : HttpStatus.FORBIDDEN;
    }

    private Set<String> historySections(String userId) {
        // Reception retains its existing patient-history scope. Newly admitted roles
        // are restricted to the laboratory sections assigned for each role.
        if (userRoleService.userInRole(userId, Constants.ROLE_RECEPTION)) {
            return null;
        }
        Set<String> sections = new HashSet<>();
        for (String role : List.of(Constants.ROLE_RESULTS, Constants.ROLE_REPORTS)) {
            if (userRoleService.userInRole(userId, role)) {
                sections.addAll(userService.getAnalysisSectionIdsForLabUnitRole(userId, role));
            }
        }
        return Set.copyOf(sections);
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
