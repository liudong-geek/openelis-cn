package org.openelisglobal.program.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.UserContextHolder;
import org.openelisglobal.program.valueholder.ProgramSample;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * Authorizes specialty-case writes against the analyses owned by that case's
 * laboratory section. A physical sample can contain pathology and referred IHC
 * analyses at the same time, so the whole sample is never treated as one case.
 */
@Service
public class SpecialtyCaseWriteGuard {

    static final String PATHOLOGY_SECTION = "Pathology";
    static final String CYTOLOGY_SECTION = "Cytology";
    static final String IMMUNOHISTOCHEMISTRY_SECTION = "Immunohistochemistry";

    public record Authorization(String actor, Set<String> analysisIds, List<Analysis> caseAnalyses,
            List<Analysis> sampleAnalyses) {

        public Authorization {
            analysisIds = Set.copyOf(analysisIds);
            caseAnalyses = List.copyOf(caseAnalyses);
            sampleAnalyses = List.copyOf(sampleAnalyses);
        }

    }

    public record Assignment(String roleName, SystemUser assignee) {
    }

    @Autowired
    private UserContextHolder userContextHolder;

    @Autowired
    private UserRoleService userRoleService;

    @Autowired
    private UserService userService;

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private TestSectionService testSectionService;

    public Authorization require(String claimedUserId, ProgramSample caseSample, String roleName) {
        return require(claimedUserId, caseSample, List.of(roleName));
    }

    /**
     * Requires at least one supplied role and exact lab-unit access to all analyses
     * owned by the specialty case. Multiple roles are used for draft writes, which
     * may be performed by either a results technician or the specialist.
     */
    public Authorization require(String claimedUserId, ProgramSample caseSample, List<String> roleNames) {
        return authorize(claimedUserId, caseSample, roleNames, true);
    }

    /** Authorizes a read without treating a completed case as writable. */
    public Authorization requireRead(ProgramSample caseSample, List<String> roleNames) {
        return authorize(userContextHolder.requireSysUserId(), caseSample, roleNames, false);
    }

    /** Filters list/search/count projections without exposing forbidden cases. */
    public <T extends ProgramSample> List<T> filterReadable(List<T> cases, List<String> roleNames) {
        if (cases == null || cases.isEmpty()) {
            return List.of();
        }
        List<T> readable = new ArrayList<>();
        for (T caseSample : cases) {
            try {
                requireRead(caseSample, roleNames);
                readable.add(caseSample);
            } catch (AccessDeniedException ignored) {
                // A dashboard must omit another laboratory's cases rather than reveal
                // their existence through an authorization error.
            }
        }
        return List.copyOf(readable);
    }

    private Authorization authorize(String claimedUserId, ProgramSample caseSample, List<String> roleNames,
            boolean write) {
        String actor = userContextHolder.requireSysUserId();
        if (!Objects.equals(actor, claimedUserId) || caseSample == null || caseSample.getId() == null
                || caseSample.getId() <= 0 || roleNames == null || roleNames.isEmpty()
                || roleNames.stream().anyMatch(StringUtils::isBlank) || write && isCompleted(caseSample)) {
            throw forbidden();
        }

        Sample sample = caseSample.getSample();
        if (sample == null || !positive(sample.getId())) {
            throw forbidden();
        }
        TestSection caseSection = testSectionService.getTestSectionByName(sectionName(caseSample));
        if (caseSection == null || !positive(caseSection.getId())) {
            throw forbidden();
        }

        List<Analysis> sampleAnalyses = analysisService.getAnalysesBySampleId(sample.getId());
        if (sampleAnalyses == null || sampleAnalyses.isEmpty()) {
            throw forbidden();
        }
        Map<String, Analysis> caseAnalyses = new LinkedHashMap<>();
        for (Analysis analysis : sampleAnalyses) {
            validateAnalysisOwner(analysis, sample);
            if (caseSection.getId().equals(analysis.getTestSection().getId())) {
                if (caseAnalyses.putIfAbsent(analysis.getId(), analysis) != null) {
                    throw forbidden();
                }
            }
        }
        if (caseAnalyses.isEmpty()) {
            throw forbidden();
        }

        boolean hasRequiredRole = new LinkedHashSet<>(roleNames).stream()
                .anyMatch(roleName -> userRoleService.userInRole(actor, roleName));
        if (!hasRequiredRole) {
            throw forbidden();
        }
        // Pathologist/Cytopathologist are global identity roles. Laboratory scope is
        // represented by the Results role mapping for the case's test section.
        List<Analysis> permitted = userService.filterAnalysesByLabUnitRoles(actor,
                new ArrayList<>(caseAnalyses.values()), Constants.ROLE_RESULTS);
        if (permitted == null) {
            throw forbidden();
        }
        Set<String> permittedIds = new LinkedHashSet<>();
        for (Analysis analysis : permitted) {
            if (analysis == null || !caseAnalyses.containsKey(analysis.getId())
                    || !permittedIds.add(analysis.getId())) {
                throw forbidden();
            }
        }
        if (!permittedIds.equals(caseAnalyses.keySet())) {
            throw forbidden();
        }
        return new Authorization(actor, caseAnalyses.keySet(), new ArrayList<>(caseAnalyses.values()), sampleAnalyses);
    }

    /**
     * Dashboard assignment endpoints are first-claim/idempotent-self-claim
     * operations. They cannot take an occupied slot from another user.
     */
    public void requireSelfAssignment(Authorization authorization, SystemUser assignee, SystemUser currentAssignee) {
        if (authorization == null || assignee == null || !Objects.equals(authorization.actor(), assignee.getId())
                || currentAssignee != null && !Objects.equals(authorization.actor(), currentAssignee.getId())) {
            throw forbidden();
        }
    }

    /**
     * Ordinary case saves are only available to the user who already owns the
     * corresponding work slot. Empty cases must first be claimed through the
     * dedicated self-assignment endpoint; the case form is not an assignment or
     * transfer API.
     */
    public void requireCurrentAssignment(Authorization authorization, List<Assignment> assignments) {
        if (authorization == null || assignments == null || assignments.isEmpty()) {
            throw forbidden();
        }
        for (Assignment assignment : assignments) {
            if (assignment != null && StringUtils.isNotBlank(assignment.roleName())
                    && assignment.assignee() != null
                    && Objects.equals(authorization.actor(), assignment.assignee().getId())
                    && userRoleService.userInRole(authorization.actor(), assignment.roleName())) {
                return;
            }
        }
        throw forbidden();
    }

    /** A release requires both work slots, with the caller owning the specialist slot. */
    public void requireReleaseAssignments(Authorization authorization, Assignment specialist,
            SystemUser technician) {
        requireCurrentAssignment(authorization, List.of(specialist));
        if (technician == null || !positive(technician.getId())) {
            throw forbidden();
        }
    }

    /** The case form may echo an owner, but cannot assign or transfer the slot. */
    public void requireUnchangedAssignment(SystemUser currentAssignee, String submittedAssigneeId) {
        if (StringUtils.isBlank(submittedAssigneeId)) {
            return;
        }
        if (currentAssignee == null || !Objects.equals(currentAssignee.getId(), submittedAssigneeId)) {
            throw forbidden();
        }
    }

    /** COMPLETED is a release outcome, never a draft-selectable status. */
    public void requireDraftStatus(boolean release, Enum<?> requestedStatus) {
        if (!release && requestedStatus != null && "COMPLETED".equals(requestedStatus.name())) {
            throw forbidden();
        }
    }

    /** Re-read after reflex/calculated analysis creation before closing the order. */
    public boolean allAnalysesTerminal(Sample sample, Set<String> terminalStatusIds) {
        if (sample == null || !positive(sample.getId()) || terminalStatusIds == null || terminalStatusIds.isEmpty()
                || terminalStatusIds.stream().anyMatch(statusId -> !positive(statusId))) {
            return false;
        }
        List<Analysis> latest = analysisService.getAnalysesBySampleId(sample.getId());
        if (latest == null || latest.isEmpty()) {
            return false;
        }
        for (Analysis analysis : latest) {
            validateAnalysisOwner(analysis, sample);
            if (!terminalStatusIds.contains(analysis.getStatusId())) {
                return false;
            }
        }
        return true;
    }

    public void requireExactReleaseSet(Authorization authorization, Set<String> releasedAnalysisIds) {
        if (authorization == null || releasedAnalysisIds == null
                || !authorization.analysisIds().equals(releasedAnalysisIds)) {
            throw forbidden();
        }
    }

    private void validateAnalysisOwner(Analysis analysis, Sample sample) {
        if (analysis == null || !positive(analysis.getId()) || analysis.getTestSection() == null
                || !positive(analysis.getTestSection().getId()) || analysis.getSampleItem() == null
                || analysis.getSampleItem().getSample() == null
                || !sample.getId().equals(analysis.getSampleItem().getSample().getId())) {
            throw forbidden();
        }
    }

    private String sectionName(ProgramSample caseSample) {
        if (caseSample instanceof PathologySample) {
            return PATHOLOGY_SECTION;
        }
        if (caseSample instanceof CytologySample) {
            return CYTOLOGY_SECTION;
        }
        if (caseSample instanceof ImmunohistochemistrySample) {
            return IMMUNOHISTOCHEMISTRY_SECTION;
        }
        throw forbidden();
    }

    private boolean isCompleted(ProgramSample caseSample) {
        if (caseSample instanceof PathologySample pathology) {
            return pathology.getStatus() == PathologySample.PathologyStatus.COMPLETED;
        }
        if (caseSample instanceof CytologySample cytology) {
            return cytology.getStatus() == CytologySample.CytologyStatus.COMPLETED;
        }
        if (caseSample instanceof ImmunohistochemistrySample immunohistochemistry) {
            return immunohistochemistry
                    .getStatus() == ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED;
        }
        throw forbidden();
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }

    private static AccessDeniedException forbidden() {
        return new AccessDeniedException("error.notauthorized");
    }
}
