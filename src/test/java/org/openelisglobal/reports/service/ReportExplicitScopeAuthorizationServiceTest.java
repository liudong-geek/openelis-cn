package org.openelisglobal.reports.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Internal SIM scope contracts only; no report release, database or network
 * access.
 */
public class ReportExplicitScopeAuthorizationServiceTest {

    private static final String USER_ID = "7";
    private static final String PATIENT_ID = "51";
    private static final String SAMPLE_ID = "201";
    private static final String GROUP_KEY = "SIM-explicit-group";
    private static final String RULE_VERSION = "SIM-rule-1";
    private static final List<String> MEMBER_IDS = List.of("101", "102");

    private ReportAnalysisAuthorizationService service;
    private AnalysisService analysisService;
    private SampleService sampleService;
    private SampleHumanService sampleHumanService;
    private UserService userService;
    private RoleService roleService;
    private Sample selectedSample;
    private Analysis first;
    private Analysis second;

    @Before
    public void setUp() {
        service = new ReportAnalysisAuthorizationService();
        analysisService = mock(AnalysisService.class);
        sampleService = mock(SampleService.class);
        sampleHumanService = mock(SampleHumanService.class);
        userService = mock(UserService.class);
        roleService = mock(RoleService.class);
        ReflectionTestUtils.setField(service, "analysisService", analysisService);
        ReflectionTestUtils.setField(service, "sampleService", sampleService);
        ReflectionTestUtils.setField(service, "sampleHumanService", sampleHumanService);
        ReflectionTestUtils.setField(service, "userService", userService);
        ReflectionTestUtils.setField(service, "roleService", roleService);

        SystemUserService systemUserService = mock(SystemUserService.class);
        LoginUserService loginUserService = mock(LoginUserService.class);
        ReflectionTestUtils.setField(service, "systemUserService", systemUserService);
        ReflectionTestUtils.setField(service, "loginUserService", loginUserService);
        when(systemUserService.getMatch("loginName", "SIM-user")).thenReturn(Optional.of(systemUser()));
        when(loginUserService.getMatch("loginName", "SIM-user")).thenReturn(Optional.of(loginUser()));

        selectedSample = sample(SAMPLE_ID);
        first = analysis("101", "401", selectedSample, "301");
        second = analysis("102", "402", selectedSample, "301");
        when(sampleService.get(SAMPLE_ID)).thenReturn(selectedSample);
        when(sampleHumanService.getPatientForSample(selectedSample)).thenReturn(patient(PATIENT_ID));
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first, second));
        when(roleService.getRoleByName(Constants.ROLE_REPORTS)).thenReturn(role("77"));
        when(userService.getUserTestSections(USER_ID, "77")).thenReturn(List.of(new IdValuePair("301", "SIM-A")));
        SecurityContextHolder.clearContext();
        authenticate("ROLE_REPORTS");
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void definition_preservesExplicitScopeWithoutInferringGroupingRules() {
        ReportScopeDefinition definition = scope();

        assertEquals(PATIENT_ID, definition.patientId());
        assertEquals(SAMPLE_ID, definition.sampleId());
        assertEquals(GROUP_KEY, definition.groupKey());
        assertEquals(RULE_VERSION, definition.ruleVersion());
        assertEquals(MEMBER_IDS, definition.analysisIds());
    }

    @Test
    public void definition_defensivelyCopiesMembersAndExposesAnUnmodifiableList() {
        List<String> source = new ArrayList<>(MEMBER_IDS);
        ReportScopeDefinition definition = new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, RULE_VERSION,
                source);
        source.clear();
        source.add("999");

        assertEquals(MEMBER_IDS, definition.analysisIds());
        assertThrows(UnsupportedOperationException.class, () -> definition.analysisIds().add("103"));
        assertThrows(UnsupportedOperationException.class, () -> definition.analysisIds().set(0, "103"));
    }

    @Test
    public void definition_distinguishesSamePatientDifferentApplicationsAndRuleVersions() {
        ReportScopeDefinition otherApplication = new ReportScopeDefinition(PATIENT_ID, "202", GROUP_KEY, RULE_VERSION,
                List.of("103"));
        ReportScopeDefinition otherRule = new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, "SIM-rule-2",
                MEMBER_IDS);

        assertNotEquals(scope(), otherApplication);
        assertNotEquals(scope(), otherRule);
    }

    @Test
    public void definition_rejectsNonCanonicalPatientIds() {
        for (String id : invalidIds()) {
            assertThrows(IllegalArgumentException.class,
                    () -> new ReportScopeDefinition(id, SAMPLE_ID, GROUP_KEY, RULE_VERSION, MEMBER_IDS));
        }
    }

    @Test
    public void definition_rejectsNonCanonicalSampleIds() {
        for (String id : invalidIds()) {
            assertThrows(IllegalArgumentException.class,
                    () -> new ReportScopeDefinition(PATIENT_ID, id, GROUP_KEY, RULE_VERSION, MEMBER_IDS));
        }
    }

    @Test
    public void definition_rejectsNonCanonicalAnalysisIds() {
        for (String id : invalidIds()) {
            assertThrows(IllegalArgumentException.class, () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID,
                    GROUP_KEY, RULE_VERSION, Arrays.asList("101", id)));
        }
    }

    @Test
    public void definition_rejectsNullMemberList() {
        assertThrows(IllegalArgumentException.class,
                () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, RULE_VERSION, null));
    }

    @Test
    public void definition_rejectsEmptyMemberList() {
        assertThrows(IllegalArgumentException.class,
                () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, RULE_VERSION, List.of()));
    }

    @Test
    public void definition_rejectsDuplicateMembersInsteadOfSilentlyDeduplicating() {
        assertThrows(IllegalArgumentException.class,
                () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, RULE_VERSION, List.of("101", "101")));
    }

    @Test
    public void definition_rejectsMissingOrPaddedGroupKey() {
        for (String key : invalidLabels()) {
            assertThrows(IllegalArgumentException.class,
                    () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, key, RULE_VERSION, MEMBER_IDS));
        }
    }

    @Test
    public void definition_rejectsMissingOrPaddedRuleVersion() {
        for (String version : invalidLabels()) {
            assertThrows(IllegalArgumentException.class,
                    () -> new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, version, MEMBER_IDS));
        }
    }

    @Test
    public void authorize_allowsCompleteExplicitScopeUsingReportsDatabaseRoleId() {
        service.authorizeExplicitScope(scope(), USER_ID);

        verify(sampleService).get(SAMPLE_ID);
        verify(sampleHumanService).getPatientForSample(selectedSample);
        verify(analysisService).get(MEMBER_IDS);
        verify(roleService).getRoleByName(Constants.ROLE_REPORTS);
        verify(userService).getUserTestSections(USER_ID, "77");
        verify(userService, never()).getUserTestSections(USER_ID, Constants.ROLE_REPORTS);
        // No argument combination may silently filter unauthorized members out of this
        // complete scope.
        verify(userService, never()).filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString());
        // No analysis selection may widen the explicit definition into the legacy
        // whole-application scope.
        verify(sampleService, never()).getSamplesByAnalysisIds(anyList());
        // No application ID may trigger a whole-application member reload instead of
        // the exact definition.
        verify(analysisService, never()).getAnalysesBySampleId(anyString());
    }

    @Test
    public void authorize_allowsExactMembersReturnedInDifferentOrder() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(second, first));

        service.authorizeExplicitScope(scope(), USER_ID);

        verify(sampleService).get(SAMPLE_ID);
        verify(sampleHumanService).getPatientForSample(selectedSample);
        verify(analysisService).get(MEMBER_IDS);
        verify(roleService).getRoleByName(Constants.ROLE_REPORTS);
        verify(userService).getUserTestSections(USER_ID, "77");
    }

    @Test
    public void authorize_allowsMembersFromSeveralExplicitlyAuthorizedActualSections() {
        TestSection forbidden = new TestSection();
        forbidden.setId("302");
        second.setTestSection(forbidden);
        when(userService.getUserTestSections(USER_ID, "77"))
                .thenReturn(List.of(new IdValuePair("301", "SIM-A"), new IdValuePair("302", "SIM-B")));

        service.authorizeExplicitScope(scope(), USER_ID);

        verify(sampleService).get(SAMPLE_ID);
        verify(sampleHumanService).getPatientForSample(selectedSample);
        verify(analysisService).get(MEMBER_IDS);
        verify(roleService).getRoleByName(Constants.ROLE_REPORTS);
        verify(userService).getUserTestSections(USER_ID, "77");
    }

    @Test
    public void authorize_samePatientIndependentApplicationsDoNotShareMemberScope() {
        service.authorizeExplicitScope(scope(), USER_ID);
        Sample other = sample("202");
        when(sampleService.get("202")).thenReturn(other);
        when(sampleHumanService.getPatientForSample(other)).thenReturn(patient(PATIENT_ID));
        when(analysisService.get(List.of("103"))).thenReturn(List.of(analysis("103", "403", other, "301")));

        service.authorizeExplicitScope(
                new ReportScopeDefinition(PATIENT_ID, "202", GROUP_KEY, RULE_VERSION, List.of("103")), USER_ID);

        verify(analysisService).get(MEMBER_IDS);
        verify(analysisService).get(List.of("103"));
    }

    @Test
    public void authorize_rejectsMissingAuthenticationBeforeLookup() {
        SecurityContextHolder.clearContext();

        assertDeniedBeforeLookup(scope(), USER_ID);
    }

    @Test
    public void authorize_rejectsUnauthenticatedPrincipalBeforeLookup() {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("SIM-user", "N/A"));

        assertDeniedBeforeLookup(scope(), USER_ID);
    }

    @Test
    public void authorize_rejectsResultsRoleWithoutReportsBeforeLookup() {
        authenticate("ROLE_RESULTS");

        assertDeniedBeforeLookup(scope(), USER_ID);
    }

    @Test
    public void authorize_rejectsGlobalAdministratorWithoutReportsBeforeLookup() {
        authenticate("ROLE_GLOBAL_ADMIN");

        assertDeniedBeforeLookup(scope(), USER_ID);
    }

    @Test
    public void authorize_rejectsNonCanonicalServerUserIdsBeforeLookup() {
        for (String userId : invalidIds()) {
            assertDeniedBeforeLookup(scope(), userId);
        }
    }

    @Test
    public void authorize_rejectsNullScopeBeforeLookup() {
        assertDeniedBeforeLookup(null, USER_ID);
    }

    @Test
    public void authorize_rejectsMissingApplicationBeforePatientAndMemberLookup() {
        when(sampleService.get(SAMPLE_ID)).thenReturn(null);

        assertDenied();

        verifyZeroInteractions(sampleHumanService, analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsApplicationReturnedUnderAnotherId() {
        when(sampleService.get(SAMPLE_ID)).thenReturn(sample("202"));

        assertDenied();

        verifyZeroInteractions(sampleHumanService, analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsApplicationWithoutPersistentId() {
        when(sampleService.get(SAMPLE_ID)).thenReturn(sample(null));

        assertDenied();

        verifyZeroInteractions(sampleHumanService, analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsMissingPatientRelationship() {
        when(sampleHumanService.getPatientForSample(selectedSample)).thenReturn(null);

        assertDenied();

        verifyZeroInteractions(analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsApplicationBelongingToAnotherPatient() {
        when(sampleHumanService.getPatientForSample(selectedSample)).thenReturn(patient("52"));

        assertDenied();

        verifyZeroInteractions(analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsPatientRelationshipWithoutPersistentId() {
        when(sampleHumanService.getPatientForSample(selectedSample)).thenReturn(patient(null));

        assertDenied();

        verifyZeroInteractions(analysisService, roleService, userService);
    }

    @Test
    public void authorize_rejectsMissingMemberWithoutFilteringToExistingMembers() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsNullMemberQueryResult() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(null);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsEmptyMemberQueryResult() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of());

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsExtraMemberOutsideExplicitDefinition() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(
                List.of(first, second, analysis("103", "403", selectedSample, "301")));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsDuplicateReturnedMemberEvenWhenItsIdSetLooksComplete() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first, second, first));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsDuplicateReplacingAnotherRequestedMember() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first, first));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsSameIdDifferentSectionObjectsEvenWhenReturnedCountMatchesRequest() {
        Analysis duplicate = analysis("101", "403", selectedSample, "302");
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first, duplicate));

        // Cardinality alone cannot establish membership; neither object may overwrite
        // the other by ID.
        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsNullElementInReturnedMembers() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(Arrays.asList(first, null));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsReturnedMemberWithoutPersistentId() {
        second.setId(null);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsReturnedMemberWithDifferentId() {
        second.setId("103");

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsMemberFromAnotherApplicationOfTheSamePatient() {
        Sample other = sample("202");
        when(sampleHumanService.getPatientForSample(other)).thenReturn(patient(PATIENT_ID));
        second.getSampleItem().setSample(other);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsSameAccessionTextWhenPersistentApplicationIdsDiffer() {
        selectedSample.setAccessionNumber("SIM-SAME-DISPLAY");
        Sample other = sample("202");
        other.setAccessionNumber("SIM-SAME-DISPLAY");
        second.getSampleItem().setSample(other);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsMemberWithoutSpecimen() {
        second.setSampleItem(null);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsSpecimenWithoutPersistentId() {
        second.getSampleItem().setId(null);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsSpecimenWithNonCanonicalPersistentId() {
        for (String id : invalidIds()) {
            if (id == null) {
                continue;
            }
            second.getSampleItem().setId(id);

            assertDeniedBeforeSectionLookup();
        }
    }

    @Test
    public void authorize_rejectsSpecimenWithoutApplication() {
        second.getSampleItem().setSample(null);

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsSpecimenApplicationWithoutPersistentId() {
        second.getSampleItem().setSample(sample(null));

        assertDeniedBeforeSectionLookup();
    }

    @Test
    public void authorize_rejectsMixedAuthorizedAndUnauthorizedMembersInFull() {
        TestSection forbidden = new TestSection();
        forbidden.setId("302");
        second.setTestSection(forbidden);

        assertDenied();

        // Reject the full definition; no user, member list or role may invoke a
        // partial-result filter.
        verify(userService, never()).filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString());
    }

    @Test
    public void authorize_doesNotGrantGlobalAdministratorAnImplicitSectionBypass() {
        authenticate("ROLE_REPORTS", "ROLE_GLOBAL_ADMIN");
        TestSection forbidden = new TestSection();
        forbidden.setId("302");
        second.setTestSection(forbidden);

        assertDenied();
    }

    @Test
    public void authorize_rejectsAllowedTestDefaultWhenActualAnalysisSectionIsUnauthorized() {
        first.setTest(testWithDefaultSection("301"));
        first.setTestSection(section("302"));

        assertDenied();
    }

    @Test
    public void authorize_allowsActualSectionEvenWhenTestDefaultIsDifferent() {
        first.setTest(testWithDefaultSection("302"));
        first.setTestSection(section("301"));

        service.authorizeExplicitScope(scope(), USER_ID);

        verify(sampleService).get(SAMPLE_ID);
        verify(sampleHumanService).getPatientForSample(selectedSample);
        verify(analysisService).get(MEMBER_IDS);
        verify(roleService).getRoleByName(Constants.ROLE_REPORTS);
        verify(userService).getUserTestSections(USER_ID, "77");
    }

    @Test
    public void authorize_rejectsMissingActualSectionDespiteAnAllowedTestDefault() {
        first.setTest(testWithDefaultSection("301"));
        first.setTestSection(null);

        assertDenied();
    }

    @Test
    public void authorize_rejectsActualSectionWithoutPersistentId() {
        second.setTestSection(section(null));

        assertDenied();
    }

    @Test
    public void authorize_rejectsMissingReportsRoleConfiguration() {
        when(roleService.getRoleByName(Constants.ROLE_REPORTS)).thenReturn(null);

        assertDenied();

        verifyZeroInteractions(userService);
    }

    @Test
    public void authorize_rejectsReportsRoleWithInvalidDatabaseId() {
        when(roleService.getRoleByName(Constants.ROLE_REPORTS)).thenReturn(role("SIM-invalid-role"));

        assertDenied();

        verifyZeroInteractions(userService);
    }

    @Test
    public void authorize_rejectsEmptyReportsSectionAssignments() {
        when(userService.getUserTestSections(USER_ID, "77")).thenReturn(List.of());

        assertDenied();
    }

    @Test
    public void authorize_rejectsNullReportsSectionAssignments() {
        when(userService.getUserTestSections(USER_ID, "77")).thenReturn(null);

        assertDenied();
    }

    @Test
    public void authorize_rejectsMalformedReportsSectionAssignment() {
        when(userService.getUserTestSections(USER_ID, "77")).thenReturn(
                List.of(new IdValuePair("301", "SIM-A"), new IdValuePair("SIM-invalid-section", "SIM-B")));

        assertDenied();
    }

    private void assertDenied() {
        assertThrows(AccessDeniedException.class, () -> service.authorizeExplicitScope(scope(), USER_ID));
    }

    private void assertDeniedBeforeSectionLookup() {
        assertDenied();
        verifyZeroInteractions(roleService, userService);
    }

    private void assertDeniedBeforeLookup(ReportScopeDefinition definition, String userId) {
        assertThrows(AccessDeniedException.class, () -> service.authorizeExplicitScope(definition, userId));
        verifyZeroInteractions(sampleService, sampleHumanService, analysisService, roleService, userService);
    }

    @Test
    public void wholeGroupVisibilityAllowsCompleteGroupAndRejectsMixedPermissionWithoutTruncation() {
        org.junit.Assert.assertTrue(service.isCompleteScopeVisible(scope(), USER_ID));
        TestSection forbidden = new TestSection();
        forbidden.setId("302");
        second.setTestSection(forbidden);
        org.junit.Assert.assertFalse(service.isCompleteScopeVisible(scope(), USER_ID));
        assertThrows(AccessDeniedException.class, () -> service.authorizeExplicitScope(scope(), USER_ID));
    }

    @Test public void wholeGroupListingTreatsMissingMemberEvidenceAsConflict() {
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(first));
        assertThrows(IllegalStateException.class, () -> service.isCompleteScopeVisible(scope(), USER_ID));
    }

    @Test
    public void wholeGroupListingTreatsWrongOwnershipAsConflict() {
        second.getSampleItem().setSample(sample("999"));
        assertThrows(IllegalStateException.class, () -> service.isCompleteScopeVisible(scope(), USER_ID));
    }

    @Test
    public void wholeGroupListingDoesNotCallMissingActualSectionAnOrdinaryDenial() {
        second.setTestSection(null);
        assertThrows(IllegalStateException.class, () -> service.isCompleteScopeVisible(scope(), USER_ID));
    }

    @Test public void wholeGroupListingNeverConvertsDatabaseFailureToFalse() {
        when(analysisService.get(MEMBER_IDS)).thenThrow(new IllegalStateException("SIM database unavailable"));
        assertThrows(IllegalStateException.class, () -> service.isCompleteScopeVisible(scope(), USER_ID));
    }

    @Test
    public void actorGuardBindsSameSessionAcrossWholeList() {
        var guard = service.beginActorCheck(USER_ID);
        service.endActorCheck(guard);
        authenticate("ROLE_REPORTS");
        assertThrows(AccessDeniedException.class, () -> service.endActorCheck(guard));
    }

    @Test
    public void actorGuardRejectsLostReportRoleAndDifferentActor() {
        var guard = service.beginActorCheck(USER_ID);
        authenticate("ROLE_RESULTS");
        assertThrows(AccessDeniedException.class, () -> service.endActorCheck(guard));
        authenticate("ROLE_REPORTS");
        assertThrows(AccessDeniedException.class, () -> service.beginActorCheck("999"));
    }

    private ReportScopeDefinition scope() {
        return new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, GROUP_KEY, RULE_VERSION, MEMBER_IDS);
    }

    private List<String> invalidIds() {
        return Arrays.asList(null, "", " ", "0", "00", "01", "-1", "+1", "1.0", "1e2", " 1", "1 ", "1\n", "\u0661",
                "1/2");
    }

    private List<String> invalidLabels() {
        return Arrays.asList(null, "", " ", "\t", " SIM", "SIM ", "SIM\n", "\u2003SIM", "SIM\u2003");
    }

    private void authenticate(String... authorities) {
        org.springframework.security.core.userdetails.User principal = new org.springframework.security.core.userdetails.User(
                "SIM-user", "N/A", List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, "N/A",
                Arrays.stream(authorities).map(SimpleGrantedAuthority::new).collect(Collectors.toList())));
    }

    private SystemUser systemUser() {
        SystemUser value = new SystemUser();
        value.setId(USER_ID);
        value.setLoginName("SIM-user");
        value.setIsActive("Y");
        return value;
    }

    private LoginUser loginUser() {
        LoginUser value = new LoginUser();
        value.setId(17);
        value.setSystemUserId(Integer.parseInt(USER_ID));
        value.setLoginName("SIM-user");
        value.setAccountDisabled("N");
        value.setAccountLocked("N");
        value.setPasswordExpiredDayNo(30);
        return value;
    }

    private Sample sample(String id) {
        Sample value = new Sample();
        value.setId(id);
        return value;
    }

    private Patient patient(String id) {
        Patient value = new Patient();
        value.setId(id);
        return value;
    }

    private Role role(String id) {
        Role value = new Role();
        value.setId(id);
        return value;
    }

    private TestSection section(String id) {
        TestSection value = new TestSection();
        value.setId(id);
        return value;
    }

    private Analysis analysis(String id, String specimenId, Sample owner, String actualSectionId) {
        SampleItem specimen = new SampleItem();
        specimen.setId(specimenId);
        specimen.setSample(owner);
        Analysis value = new Analysis();
        value.setId(id);
        value.setSampleItem(specimen);
        value.setTestSection(section(actualSectionId));
        return value;
    }

    private org.openelisglobal.test.valueholder.Test testWithDefaultSection(String sectionId) {
        org.openelisglobal.test.valueholder.Test value = new org.openelisglobal.test.valueholder.Test();
        value.setId("501");
        value.setTestSection(section(sectionId));
        return value;
    }
}
