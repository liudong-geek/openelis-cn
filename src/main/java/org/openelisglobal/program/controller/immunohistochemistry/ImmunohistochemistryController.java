package org.openelisglobal.program.controller.immunohistochemistry;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.program.bean.ImmunohistochemistryDashBoardCount;
import org.openelisglobal.program.service.ImmunohistochemistryDisplayService;
import org.openelisglobal.program.service.ImmunohistochemistrySampleService;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistryCaseViewDisplayItem;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistryDisplayItem;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample.ImmunohistochemistryStatus;
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
public class ImmunohistochemistryController extends BaseRestController {

    private static final List<String> READ_ROLES = List.of(Constants.ROLE_RESULTS, Constants.ROLE_PATHOLOGIST);

    @Autowired
    private ImmunohistochemistrySampleService immunohistochemistrySampleService;
    @Autowired
    private ImmunohistochemistryDisplayService immunohistochemistryDisplayService;
    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private SpecialtyCaseWriteGuard specialtyCaseWriteGuard;

    @GetMapping(value = "/rest/immunohistochemistry/dashboard", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'PATHOLOGIST')")
    @ResponseBody
    public List<ImmunohistochemistryDisplayItem> getFilteredImmunohistochemistryEntries(
            @RequestParam(required = false) String searchTerm, @RequestParam ImmunohistochemistryStatus... statuses) {
        return specialtyCaseWriteGuard.filterReadable(
                immunohistochemistrySampleService.searchWithStatusAndTerm(Arrays.asList(statuses), searchTerm),
                READ_ROLES).stream()
                .map(e -> immunohistochemistryDisplayService.convertToDisplayItem(e.getId()))
                .collect(Collectors.toList());
    }

    @GetMapping(value = "/rest/immunohistochemistry/dashboard/count", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'PATHOLOGIST')")
    @ResponseBody
    public ResponseEntity<ImmunohistochemistryDashBoardCount> getFilteredImmunohistochemistryEntries() {
        ImmunohistochemistryDashBoardCount count = new ImmunohistochemistryDashBoardCount();
        count.setInProgress(scopedCount(List.of(ImmunohistochemistryStatus.IN_PROGRESS)));
        count.setAwaitingReview(scopedCount(List.of(ImmunohistochemistryStatus.READY_PATHOLOGIST)));

        Timestamp currentTimestamp = new Timestamp(System.currentTimeMillis());
        Instant weekAgoInstant = Instant.now().minus(7, ChronoUnit.DAYS);
        Timestamp weekAgoTimestamp = Timestamp.from(weekAgoInstant);

        count.setComplete(
                scopedCountBetween(List.of(ImmunohistochemistryStatus.COMPLETED), weekAgoTimestamp, currentTimestamp));

        return ResponseEntity.ok(count);
    }

    @PostMapping(value = "/rest/immunohistochemistry/assignTechnician", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('RESULTS')")
    @ResponseBody
    public ResponseEntity<String> assignTechnician(@RequestParam Integer immunohistochemistrySampleId,
            HttpServletRequest request) {
        String currentUserId = getSysUserId(request);
        immunohistochemistrySampleService.assignTechnician(immunohistochemistrySampleId,
                systemUserService.get(currentUserId));
        return ResponseEntity.ok("ok");
    }

    @PostMapping(value = "/rest/immunohistochemistry/assignPathologist", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('PATHOLOGIST')")
    @ResponseBody
    public ResponseEntity<String> assignPathologist(@RequestParam Integer immunohistochemistrySampleId,
            HttpServletRequest request) {
        String currentUserId = getSysUserId(request);
        immunohistochemistrySampleService.assignPathologist(immunohistochemistrySampleId,
                systemUserService.get(currentUserId));
        return ResponseEntity.ok("ok");
    }

    @GetMapping(value = "/rest/immunohistochemistry/caseView/{immunohistochemistrySampleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'PATHOLOGIST')")
    @ResponseBody
    public ImmunohistochemistryCaseViewDisplayItem getFilteredImmunohistochemistryEntries(
            @PathVariable("immunohistochemistrySampleId") Integer immunohistochemistrySampleId) {
        specialtyCaseWriteGuard.requireRead(immunohistochemistrySampleService.get(immunohistochemistrySampleId),
                READ_ROLES);
        return immunohistochemistryDisplayService.convertToCaseDisplayItem(immunohistochemistrySampleId);
    }

    private long scopedCount(List<ImmunohistochemistryStatus> statuses) {
        return specialtyCaseWriteGuard
                .filterReadable(immunohistochemistrySampleService.getWithStatus(statuses), READ_ROLES).size();
    }

    private long scopedCountBetween(List<ImmunohistochemistryStatus> statuses, Timestamp from, Timestamp to) {
        return specialtyCaseWriteGuard
                .filterReadable(immunohistochemistrySampleService.getWithStatus(statuses), READ_ROLES).stream()
                .filter(value -> value.getLastupdated() != null && !value.getLastupdated().before(from)
                        && !value.getLastupdated().after(to))
                .count();
    }

    @PostMapping(value = "/rest/immunohistochemistry/caseView/{immunohistochemistrySampleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('RESULTS', 'PATHOLOGIST')")
    @ResponseBody
    public ImmunohistochemistrySampleForm getFilteredImmunohistochemistryEntries(
            @PathVariable("immunohistochemistrySampleId") Integer immunohistochemistrySampleId,
            @RequestBody ImmunohistochemistrySampleForm form, HttpServletRequest request) {
        form.setSystemUserId(this.getSysUserId(request));
        immunohistochemistrySampleService.updateWithFormValues(immunohistochemistrySampleId, form);

        return form;
    }
}
