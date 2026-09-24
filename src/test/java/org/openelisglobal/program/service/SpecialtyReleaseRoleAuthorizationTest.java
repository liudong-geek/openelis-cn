package org.openelisglobal.program.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.UserContextHolder;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

public class SpecialtyReleaseRoleAuthorizationTest {

    private SpecialtyCaseWriteGuard guard;
    private UserContextHolder context;
    private UserRoleService roles;
    private UserService users;
    private AnalysisService analyses;
    private TestSectionService sections;
    private Sample sample;
    private Analysis pathologyAnalysis;
    private Analysis ihcAnalysis;
    private PathologySample pathologyCase;

    @Before
    public void setUp() {
        guard = new SpecialtyCaseWriteGuard();
        context = mock(UserContextHolder.class);
        roles = mock(UserRoleService.class);
        users = mock(UserService.class);
        analyses = mock(AnalysisService.class);
        sections = mock(TestSectionService.class);
        ReflectionTestUtils.setField(guard, "userContextHolder", context);
        ReflectionTestUtils.setField(guard, "userRoleService", roles);
        ReflectionTestUtils.setField(guard, "userService", users);
        ReflectionTestUtils.setField(guard, "analysisService", analyses);
        ReflectionTestUtils.setField(guard, "testSectionService", sections);

        sample = new Sample();
        sample.setId("301");
        TestSection pathology = section("401", SpecialtyCaseWriteGuard.PATHOLOGY_SECTION);
        TestSection ihc = section("402", SpecialtyCaseWriteGuard.IMMUNOHISTOCHEMISTRY_SECTION);
        when(sections.getTestSectionByName(SpecialtyCaseWriteGuard.PATHOLOGY_SECTION)).thenReturn(pathology);
        when(sections.getTestSectionByName(SpecialtyCaseWriteGuard.IMMUNOHISTOCHEMISTRY_SECTION)).thenReturn(ihc);
        pathologyAnalysis = analysis("101", pathology, sample, "10");
        ihcAnalysis = analysis("102", ihc, sample, "1");
        when(context.requireSysUserId()).thenReturn("11");
        when(analyses.getAnalysesBySampleId("301")).thenReturn(List.of(pathologyAnalysis, ihcAnalysis));

        pathologyCase = new PathologySample();
        pathologyCase.setId(51);
        pathologyCase.setSample(sample);
    }

    @Test
    public void pathologyAuthorizationScopesSameSampleAwayFromReferredIhc() {
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);
        when(users.filterAnalysesByLabUnitRoles("11", List.of(pathologyAnalysis), Constants.ROLE_RESULTS))
                .thenReturn(List.of(pathologyAnalysis));

        Authorization authorization = guard.require("11", pathologyCase, Constants.ROLE_PATHOLOGIST);

        assertEquals(Set.of("101"), authorization.analysisIds());
        assertEquals(List.of(pathologyAnalysis), authorization.caseAnalyses());
        assertEquals(List.of(pathologyAnalysis, ihcAnalysis), authorization.sampleAnalyses());
        verify(users).filterAnalysesByLabUnitRoles("11", List.of(pathologyAnalysis), Constants.ROLE_RESULTS);
    }

    @Test
    public void referredIhcUsesItsOwnPersistedSectionEvenOnTheSameSample() {
        ImmunohistochemistrySample ihcCase = new ImmunohistochemistrySample();
        ihcCase.setId(52);
        ihcCase.setSample(sample);
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);
        when(users.filterAnalysesByLabUnitRoles("11", List.of(ihcAnalysis), Constants.ROLE_RESULTS))
                .thenReturn(List.of(ihcAnalysis));

        Authorization authorization = guard.require("11", ihcCase, Constants.ROLE_PATHOLOGIST);

        assertEquals(Set.of("102"), authorization.analysisIds());
    }

    @Test
    public void resultsTechnicianCanAuthorizeDraftWithoutSpecialistRole() {
        when(roles.userInRole("11", Constants.ROLE_RESULTS)).thenReturn(true);
        when(users.filterAnalysesByLabUnitRoles("11", List.of(pathologyAnalysis), Constants.ROLE_RESULTS))
                .thenReturn(List.of(pathologyAnalysis));

        Authorization authorization = guard.require("11", pathologyCase,
                List.of(Constants.ROLE_RESULTS, Constants.ROLE_PATHOLOGIST));

        assertEquals("11", authorization.actor());
        assertEquals(Set.of("101"), authorization.analysisIds());
        verify(roles).userInRole("11", Constants.ROLE_RESULTS);
        verify(roles, never()).userInRole("11", Constants.ROLE_PATHOLOGIST);
    }

    @Test
    public void specialistOutsideTheCaseLabSectionIsRejected() {
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);
        when(users.filterAnalysesByLabUnitRoles("11", List.of(pathologyAnalysis), Constants.ROLE_RESULTS))
                .thenReturn(List.of());

        assertThrows(AccessDeniedException.class,
                () -> guard.require("11", pathologyCase, Constants.ROLE_PATHOLOGIST));
    }

    @Test
    public void claimedUserMismatchIsRejectedBeforeCaseDataLookup() {
        assertThrows(AccessDeniedException.class, () -> guard.require("12", pathologyCase, Constants.ROLE_PATHOLOGIST));

        verify(roles, never()).userInRole("11", Constants.ROLE_PATHOLOGIST);
        verify(analyses, never()).getAnalysesBySampleId("301");
    }

    @Test
    public void assignmentMustRemainSelfAssignment() {
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(pathologyAnalysis),
                List.of(pathologyAnalysis));
        SystemUser anotherUser = new SystemUser();
        anotherUser.setId("12");

        assertThrows(AccessDeniedException.class, () -> guard.requireSelfAssignment(authorization, anotherUser, null));
    }

    @Test
    public void selfAssignmentCannotReplaceAnotherAssigneeButIsIdempotentForTheActor() {
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(pathologyAnalysis),
                List.of(pathologyAnalysis));
        SystemUser actor = user("11");
        SystemUser anotherUser = user("12");

        assertThrows(AccessDeniedException.class,
                () -> guard.requireSelfAssignment(authorization, actor, anotherUser));
        guard.requireSelfAssignment(authorization, actor, actor);
    }

    @Test
    public void completedCaseCannotBeWrittenButRemainsReadableWithinLabScope() {
        pathologyCase.setStatus(PathologySample.PathologyStatus.COMPLETED);
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);
        when(users.filterAnalysesByLabUnitRoles("11", List.of(pathologyAnalysis), Constants.ROLE_RESULTS))
                .thenReturn(List.of(pathologyAnalysis));

        assertThrows(AccessDeniedException.class,
                () -> guard.require("11", pathologyCase, Constants.ROLE_PATHOLOGIST));
        assertEquals(Set.of("101"),
                guard.requireRead(pathologyCase, List.of(Constants.ROLE_PATHOLOGIST)).analysisIds());
    }

    @Test
    public void draftCannotSubmitCompletedStatus() {
        assertThrows(AccessDeniedException.class,
                () -> guard.requireDraftStatus(false, PathologySample.PathologyStatus.COMPLETED));
        guard.requireDraftStatus(false, PathologySample.PathologyStatus.READY_PATHOLOGIST);
        guard.requireDraftStatus(true, PathologySample.PathologyStatus.COMPLETED);
    }

    @Test
    public void caseSaveRequiresTheCurrentOwnerForTheActorsRole() {
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(pathologyAnalysis),
                List.of(pathologyAnalysis));
        SystemUser actor = user("11");
        SystemUser colleague = user("12");
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);

        guard.requireCurrentAssignment(authorization,
                List.of(new Assignment(Constants.ROLE_PATHOLOGIST, actor)));

        assertThrows(AccessDeniedException.class,
                () -> guard.requireCurrentAssignment(authorization,
                        List.of(new Assignment(Constants.ROLE_PATHOLOGIST, colleague))));
        assertThrows(AccessDeniedException.class,
                () -> guard.requireCurrentAssignment(authorization,
                        List.of(new Assignment(Constants.ROLE_PATHOLOGIST, null))));
    }

    @Test
    public void caseFormCannotAssignOrTransferAnOwner() {
        SystemUser actor = user("11");

        guard.requireUnchangedAssignment(actor, null);
        guard.requireUnchangedAssignment(actor, "11");
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchangedAssignment(actor, "12"));
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchangedAssignment(null, "11"));
    }

    @Test
    public void releaseRequiresTheSpecialistOwnerAndAPersistedTechnician() {
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(pathologyAnalysis),
                List.of(pathologyAnalysis));
        SystemUser pathologist = user("11");
        SystemUser technician = user("12");
        when(roles.userInRole("11", Constants.ROLE_PATHOLOGIST)).thenReturn(true);

        guard.requireReleaseAssignments(authorization,
                new Assignment(Constants.ROLE_PATHOLOGIST, pathologist), technician);

        assertThrows(AccessDeniedException.class,
                () -> guard.requireReleaseAssignments(authorization,
                        new Assignment(Constants.ROLE_PATHOLOGIST, pathologist), null));
        assertThrows(AccessDeniedException.class,
                () -> guard.requireReleaseAssignments(authorization,
                        new Assignment(Constants.ROLE_PATHOLOGIST, user("12")), technician));
    }

    @Test
    public void sampleCompletionUsesLatestPersistedAnalysisSet() {
        when(analyses.getAnalysesBySampleId("301")).thenReturn(List.of(pathologyAnalysis, ihcAnalysis));

        assertFalse(guard.allAnalysesTerminal(sample, Set.of("10", "11", "12")));
        ihcAnalysis.setStatusId("10");
        assertTrue(guard.allAnalysesTerminal(sample, Set.of("10", "11", "12")));
    }

    @Test
    public void releaseMustCoverEveryAnalysisOwnedByTheCase() {
        Authorization authorization = new Authorization("11", Set.of("101", "103"), List.of(pathologyAnalysis),
                List.of(pathologyAnalysis));

        assertThrows(AccessDeniedException.class, () -> guard.requireExactReleaseSet(authorization, Set.of("101")));
    }

    private Analysis analysis(String id, TestSection section, Sample owner, String statusId) {
        SampleItem item = new SampleItem();
        item.setId("2" + id);
        item.setSample(owner);
        Analysis value = new Analysis();
        value.setId(id);
        value.setSampleItem(item);
        value.setTestSection(section);
        value.setStatusId(statusId);
        return value;
    }

    private TestSection section(String id, String name) {
        TestSection value = new TestSection();
        value.setId(id);
        value.setTestSectionName(name);
        return value;
    }

    private SystemUser user(String id) {
        SystemUser value = new SystemUser();
        value.setId(id);
        return value;
    }
}
