package org.openelisglobal.program.controller.cytology;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.program.bean.CytologyDashBoardCount;
import org.openelisglobal.program.service.cytology.CytologyDisplayService;
import org.openelisglobal.program.service.cytology.CytologySampleService;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard;
import org.openelisglobal.program.valueholder.cytology.CytologyCaseViewDisplayItem;
import org.openelisglobal.program.valueholder.cytology.CytologyDisplayItem;
import org.openelisglobal.program.valueholder.cytology.CytologySample.CytologyStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CytologyController extends BaseRestController {

    private static final List<String> READ_ROLES = List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST);

    @Autowired
    private CytologySampleService cytologySampleService;

    @Autowired
    private CytologyDisplayService cytologyDisplayService;

    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private SpecialtyCaseWriteGuard specialtyCaseWriteGuard;

    @GetMapping(value = "/rest/cytology/dashboard", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')")
    @ResponseBody
    public List<CytologyDisplayItem> getFilteredCytologyEntries(@RequestParam(required = false) String searchTerm,
            @RequestParam CytologyStatus... statuses) {

        return specialtyCaseWriteGuard
                .filterReadable(cytologySampleService.searchWithStatusAndTerm(Arrays.asList(statuses), searchTerm),
                        READ_ROLES)
                .stream()
                .map(e -> cytologyDisplayService.convertToDisplayItem(e.getId())).collect(Collectors.toList());
    }

    @GetMapping(value = "/rest/cytology/dashboard/count", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')")
    @ResponseBody
    public ResponseEntity<CytologyDashBoardCount> getCytologyDashBoardMetrics() {
        CytologyDashBoardCount count = new CytologyDashBoardCount();
        count.setInProgress(scopedCount(List.of(CytologyStatus.PREPARING_SLIDES, CytologyStatus.SCREENING)));
        count.setAwaitingReview(scopedCount(List.of(CytologyStatus.READY_FOR_CYTOPATHOLOGIST)));

        Timestamp currentTimestamp = new Timestamp(System.currentTimeMillis());
        Instant weekAgoInstant = Instant.now().minus(7, ChronoUnit.DAYS);
        Timestamp weekAgoTimestamp = Timestamp.from(weekAgoInstant);
        count.setComplete(scopedCountBetween(List.of(CytologyStatus.COMPLETED), weekAgoTimestamp, currentTimestamp));
        return ResponseEntity.ok(count);
    }

    @PostMapping(value = "/rest/cytology/assignTechnician", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('RESULTS')")
    @ResponseBody
    public ResponseEntity<String> assignTechnician(@RequestParam Integer cytologySampleId, HttpServletRequest request) {
        String currentUserId = getSysUserId(request);
        cytologySampleService.assignTechnician(cytologySampleId, systemUserService.get(currentUserId));
        return ResponseEntity.ok("ok");
    }

    @PostMapping(value = "/rest/cytology/assignCytoPathologist", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('CYTOPATHOLOGIST')")
    @ResponseBody
    public ResponseEntity<String> assignPathologist(@RequestParam Integer cytologySampleId,
            HttpServletRequest request) {
        String currentUserId = getSysUserId(request);
        cytologySampleService.assignCytoPathologist(cytologySampleId, systemUserService.get(currentUserId));
        return ResponseEntity.ok("ok");
    }

    @GetMapping(value = "/rest/cytology/caseView/{cytologySampleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')")
    @ResponseBody
    public CytologyCaseViewDisplayItem getCytologyEntry(@PathVariable("cytologySampleId") Integer cytologySampleId) {
        specialtyCaseWriteGuard.requireRead(cytologySampleService.get(cytologySampleId), READ_ROLES);
        return cytologyDisplayService.convertToCaseDisplayItem(cytologySampleId);
    }

    private long scopedCount(List<CytologyStatus> statuses) {
        return specialtyCaseWriteGuard.filterReadable(cytologySampleService.getWithStatus(statuses), READ_ROLES)
                .size();
    }

    private long scopedCountBetween(List<CytologyStatus> statuses, Timestamp from, Timestamp to) {
        return specialtyCaseWriteGuard.filterReadable(cytologySampleService.getWithStatus(statuses), READ_ROLES)
                .stream().filter(value -> value.getLastupdated() != null && !value.getLastupdated().before(from)
                        && !value.getLastupdated().after(to))
                .count();
    }

    @PostMapping(value = "/rest/cytology/caseView/{cytologySampleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')")
    @ResponseBody
    public CytologySampleForm createCytologyEntry(@PathVariable("cytologySampleId") Integer cytologySampleId,
            @RequestBody CytologySampleForm form, HttpServletRequest request) {
        form.setSystemUserId(this.getSysUserId(request));
        cytologySampleService.updateWithFormValues(cytologySampleId, form);

        return form;
    }
}
