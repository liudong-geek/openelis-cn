package org.openelisglobal.reports.service;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
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
import org.openelisglobal.security.DaemonAuthenticationToken;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.test.util.ReflectionTestUtils;

/** Human principal binding for the internal SIM scope only; no authentication endpoint or database access. */
public class ReportExplicitScopePrincipalBindingTest {

    private static final String LOGIN = "SIM-Report.User";
    private static final String USER_ID = "7";
    private static final String PATIENT_ID = "51";
    private static final String SAMPLE_ID = "201";
    private static final List<String> MEMBER_IDS = List.of("101");
    private static final List<GrantedAuthority> REPORTS = List.of(new SimpleGrantedAuthority("ROLE_REPORTS"));
    private static final String PRIVATE_FAILURE = "SIM-private-login-query-content";

    private ReportAnalysisAuthorizationService service;
    private SystemUserService systemUserService;
    private LoginUserService loginUserService;
    private SampleService sampleService;
    private SampleHumanService sampleHumanService;
    private AnalysisService analysisService;
    private RoleService roleService;
    private UserService userService;
    private SystemUser systemUser;
    private LoginUser loginUser;
    private Sample sample;
    private Analysis analysis;

    @Before
    public void setUp() {
        service = new ReportAnalysisAuthorizationService();
        systemUserService = mock(SystemUserService.class);
        loginUserService = mock(LoginUserService.class);
        sampleService = mock(SampleService.class);
        sampleHumanService = mock(SampleHumanService.class);
        analysisService = mock(AnalysisService.class);
        roleService = mock(RoleService.class);
        userService = mock(UserService.class);
        ReflectionTestUtils.setField(service, "systemUserService", systemUserService);
        ReflectionTestUtils.setField(service, "loginUserService", loginUserService);
        ReflectionTestUtils.setField(service, "sampleService", sampleService);
        ReflectionTestUtils.setField(service, "sampleHumanService", sampleHumanService);
        ReflectionTestUtils.setField(service, "analysisService", analysisService);
        ReflectionTestUtils.setField(service, "roleService", roleService);
        ReflectionTestUtils.setField(service, "userService", userService);

        systemUser = systemUser(USER_ID, LOGIN);
        loginUser = loginUser(7, LOGIN);
        when(systemUserService.getMatch("loginName", LOGIN)).thenReturn(Optional.of(systemUser));
        when(loginUserService.getMatch("loginName", LOGIN)).thenReturn(Optional.of(loginUser));

        sample = new Sample();
        sample.setId(SAMPLE_ID);
        Patient patient = new Patient();
        patient.setId(PATIENT_ID);
        SampleItem specimen = new SampleItem();
        specimen.setId("401");
        specimen.setSample(sample);
        TestSection section = new TestSection();
        section.setId("301");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setSampleItem(specimen);
        analysis.setTestSection(section);
        Role reportsRole = new Role();
        reportsRole.setId("77");
        when(sampleService.get(SAMPLE_ID)).thenReturn(sample);
        when(sampleHumanService.getPatientForSample(sample)).thenReturn(patient);
        when(analysisService.get(MEMBER_IDS)).thenReturn(List.of(analysis));
        when(roleService.getRoleByName(Constants.ROLE_REPORTS)).thenReturn(reportsRole);
        when(userService.getUserTestSections(USER_ID, "77")).thenReturn(List.of(new IdValuePair("301", "SIM-A")));
        SecurityContextHolder.clearContext();
        install(formAuthentication(formUser(true, true, true, true)));
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void form_allowsExactUniqueActiveIdentityBeforeAnyBusinessLookup() {
        authorize();

        verifyFormMappingAndBusinessOrder();
        verifyNoMoreInteractions(systemUserService, loginUserService);
    }

    @Test
    public void form_acceptsLowercaseUnlockedEnabledFlagsFromExistingLoginContract() {
        loginUser.setAccountDisabled("n");
        loginUser.setAccountLocked("n");

        authorize();

        verifyFormMappingAndBusinessOrder();
    }

    @Test
    public void saml_allowsRealPrincipalWithoutConsultingLocalPasswordAccount() {
        install(samlAuthentication());
        loginUser.setAccountDisabled("Y");
        loginUser.setPasswordExpiredDayNo(-1);

        authorize();

        verifySsoMappingAndBusinessOrder();
    }

    @Test
    public void oauth_allowsRealPrincipalWithoutConsultingLocalPasswordAccount() {
        install(oauthAuthentication());
        when(loginUserService.getMatch("loginName", LOGIN)).thenThrow(new IllegalStateException(PRIVATE_FAILURE));

        authorize();

        verifySsoMappingAndBusinessOrder();
    }

    @Test
    public void oidc_allowsRealPrincipalWithoutConsultingLocalPasswordAccount() {
        Instant issued = Instant.parse("2026-09-01T00:00:00Z");
        OidcIdToken token = new OidcIdToken("SIM-id-token", issued, issued.plusSeconds(60), Map.of("sub", LOGIN));
        DefaultOidcUser principal = new DefaultOidcUser(REPORTS, token, "sub");
        install(new OAuth2AuthenticationToken(principal, REPORTS, "SIM-oidc-client"));

        authorize();

        verifySsoMappingAndBusinessOrder();
    }

    @Test
    public void principalA_cannotBorrowUserBEvenWhenBHasIdenticalReportsSections() {
        when(userService.getUserTestSections("8", "77")).thenReturn(List.of(new IdValuePair("301", "SIM-A")));

        assertRejectedBeforeBusiness("8");

        verify(systemUserService).getMatch("loginName", LOGIN);
        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsMissingAuthenticationBeforeIdentityLookup() {
        SecurityContextHolder.clearContext();

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsUnauthenticatedTokenBeforeIdentityLookup() {
        install(new UsernamePasswordAuthenticationToken(formUser(true, true, true, true), "SIM-unused"));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsResultsRoleWithoutReportsBeforeIdentityLookup() {
        install(new UsernamePasswordAuthenticationToken(formUser(true, true, true, true), "SIM-unused",
                List.of(new SimpleGrantedAuthority("ROLE_RESULTS"))));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsAnonymousTokenEvenWithReportsAuthorityAndUserDetailsPrincipal() {
        install(new AnonymousAuthenticationToken("SIM-anonymous-key", formUser(true, true, true, true), REPORTS));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsRememberMeTokenEvenWithReportsAuthorityAndUserDetailsPrincipal() {
        install(new RememberMeAuthenticationToken("SIM-remember-key", formUser(true, true, true, true), REPORTS));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsDaemonTokenBeforeIdentityLookup() {
        install(new DaemonAuthenticationToken(USER_ID));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsDaemonTokenEvenWithReportsAuthorityAndValidHumanPrincipal() {
        UserDetails principal = formUser(true, true, true, true);
        install(new DaemonAuthenticationToken(USER_ID) {
            private static final long serialVersionUID = 1L;

            @Override
            public Collection<GrantedAuthority> getAuthorities() {
                return REPORTS;
            }

            @Override
            public Object getPrincipal() {
                return principal;
            }
        });

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsNullAuthorityCollectionCleanlyBeforeIdentityLookup() {
        install(new UsernamePasswordAuthenticationToken(formUser(true, true, true, true), "SIM-unused", REPORTS) {
            private static final long serialVersionUID = 1L;

            @Override
            public Collection<GrantedAuthority> getAuthorities() {
                return null;
            }
        });

        assertSanitized(assertRejectedBeforeBusiness(USER_ID));
        verifyZeroInteractions(systemUserService, loginUserService);
    }

    @Test
    public void rejectsNullAuthorityAfterReportsWithoutShortCircuitingToSuccess() {
        install(new UsernamePasswordAuthenticationToken(formUser(true, true, true, true), "SIM-unused", REPORTS) {
            private static final long serialVersionUID = 1L;

            @Override
            public Collection<GrantedAuthority> getAuthorities() {
                // A leading Reports authority must not hide a malformed later element.
                return Arrays.asList(new SimpleGrantedAuthority("ROLE_REPORTS"), null);
            }
        });

        assertSanitized(assertRejectedBeforeBusiness(USER_ID));
        verifyZeroInteractions(systemUserService, loginUserService);
    }

    @Test
    public void rejectsStringPrincipalEvenWhenAuthenticatedWithReportsRole() {
        install(new UsernamePasswordAuthenticationToken(LOGIN, "SIM-unused", REPORTS));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsUnknownPrincipalEvenWhenAuthenticatedWithReportsRole() {
        install(new UsernamePasswordAuthenticationToken(new Object(), "SIM-unused", REPORTS));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsDisabledUserDetailsBeforeIdentityLookup() {
        install(formAuthentication(formUser(false, true, true, true)));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsExpiredUserDetailsAccountBeforeIdentityLookup() {
        install(formAuthentication(formUser(true, false, true, true)));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsExpiredUserDetailsCredentialsBeforeIdentityLookup() {
        install(formAuthentication(formUser(true, true, false, true)));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsLockedUserDetailsBeforeIdentityLookup() {
        install(formAuthentication(formUser(true, true, true, false)));

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsMissingBlankOrPaddedPrincipalLoginWithoutNormalizingIt() {
        for (String login : Arrays.asList(null, "", " ", "\t", " " + LOGIN, LOGIN + " ", "\u2003" + LOGIN)) {
            MutableUserDetails principal = new MutableUserDetails();
            principal.username = login;
            install(formAuthentication(principal));

            assertRejectedBeforeIdentity();
        }
    }

    @Test
    public void rejectsAuthenticationNameThatDisagreesWithPrincipalLogin() {
        Authentication token = new UsernamePasswordAuthenticationToken(formUser(true, true, true, true), "SIM-unused",
                REPORTS) {
            private static final long serialVersionUID = 1L;

            @Override
            public String getName() {
                return "SIM-another-login";
            }
        };
        install(token);

        assertRejectedBeforeIdentity();
    }

    @Test
    public void rejectsAbsentOrNonUniqueSystemUserMapping() {
        // BaseObjectService.getMatch returns empty for either no row or multiple rows.
        when(systemUserService.getMatch("loginName", LOGIN)).thenReturn(Optional.empty());

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsNullSystemUserMappingResponse() {
        when(systemUserService.getMatch("loginName", LOGIN)).thenReturn(null);

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSystemUserIdThatIsMissingNonCanonicalOrNotTheCallerId() {
        for (String id : Arrays.asList(null, "", "0", "07", "-7", "7 ", "8")) {
            systemUser.setId(id);

            assertRejectedBeforeBusiness(USER_ID);
        }
        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSystemUserLoginWithMissingCaseChangedOrPaddedValue() {
        for (String login : Arrays.asList(null, "", "sim-report.user", LOGIN + " ", " " + LOGIN)) {
            systemUser.setLoginName(login);

            assertRejectedBeforeBusiness(USER_ID);
        }
        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSystemUserActivityOtherThanExactUppercaseY() {
        for (String active : Arrays.asList(null, "", "N", "y", "Y ", " Y", "true")) {
            systemUser.setIsActive(active);

            assertRejectedBeforeBusiness(USER_ID);
        }
        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void sanitizesSystemUserMappingFailureWithoutContinuingOrLeakingCause() {
        when(systemUserService.getMatch("loginName", LOGIN)).thenThrow(new IllegalStateException(PRIVATE_FAILURE));

        assertSanitized(assertRejectedBeforeBusiness(USER_ID));

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void form_rejectsAbsentOrNonUniqueLocalLoginMapping() {
        when(loginUserService.getMatch("loginName", LOGIN)).thenReturn(Optional.empty());

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void form_rejectsNullLocalLoginMappingResponse() {
        when(loginUserService.getMatch("loginName", LOGIN)).thenReturn(null);

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void form_rejectsLocalLoginNameThatDoesNotExactlyMatchPrincipal() {
        for (String login : Arrays.asList(null, "", "sim-report.user", LOGIN + " ")) {
            loginUser.setLoginName(login);

            assertRejectedBeforeBusiness(USER_ID);
        }
    }

    @Test
    public void form_rejectsLocalLoginWithNonPositiveOrDifferentSystemUserId() {
        for (int id : new int[] { 0, -1, 8 }) {
            loginUser.setSystemUserId(id);

            assertRejectedBeforeBusiness(USER_ID);
        }
    }

    @Test
    public void form_rejectsDisabledOrUnknownLocalDisabledState() {
        for (String flag : Arrays.asList(null, "", "Y", "y", "N ", " N", "false")) {
            loginUser.setAccountDisabled(flag);

            assertRejectedBeforeBusiness(USER_ID);
        }
    }

    @Test
    public void form_rejectsLockedOrUnknownLocalLockedState() {
        for (String flag : Arrays.asList(null, "", "Y", "y", "N ", " N", "false")) {
            loginUser.setAccountLocked(flag);

            assertRejectedBeforeBusiness(USER_ID);
        }
    }

    @Test
    public void form_rejectsLocalPasswordExpiringToday() {
        loginUser.setPasswordExpiredDayNo(0);

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void form_rejectsAlreadyExpiredLocalPassword() {
        loginUser.setPasswordExpiredDayNo(-1);

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void form_sanitizesLocalLoginMappingFailureWithoutLeakingCause() {
        when(loginUserService.getMatch("loginName", LOGIN)).thenThrow(new IllegalStateException(PRIVATE_FAILURE));

        assertSanitized(assertRejectedBeforeBusiness(USER_ID));
    }

    @Test
    public void rejectsContextClearedDuringSystemUserMappingBeforeLocalOrBusinessLookup() {
        duringSystemMapping(SecurityContextHolder::clearContext);

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsDifferentPrincipalInstalledDuringSystemUserMapping() {
        duringSystemMapping(() -> install(formAuthentication(new User("SIM-other-user", "SIM-unused", REPORTS))));

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSameIdentityNewTokenInstalledDuringSystemUserMapping() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringSystemMapping(() -> install(formAuthentication((UserDetails) original.getPrincipal())));

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsAuthenticationRevokedDuringSystemUserMapping() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringSystemMapping(() -> original.setAuthenticated(false));

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsReportsAuthorityRemovedDuringSystemUserMapping() {
        MutableAuthentication original = new MutableAuthentication(formUser(true, true, true, true));
        install(original);
        duringSystemMapping(() -> original.currentAuthorities = List.of());

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSameTokenWithPrincipalObjectReplacedDuringSystemUserMapping() {
        MutableAuthentication original = new MutableAuthentication(formUser(true, true, true, true));
        install(original);
        duringSystemMapping(() -> original.principal = formUser(true, true, true, true));

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSamePrincipalWhoseLoginChangesDuringSystemUserMapping() {
        MutableUserDetails principal = new MutableUserDetails();
        install(formAuthentication(principal));
        duringSystemMapping(() -> principal.username = "SIM-other-user");

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsAnyUserDetailsAccountStateRevokedDuringSystemUserMapping() {
        for (Consumer<MutableUserDetails> revoke : accountRevocations()) {
            MutableUserDetails principal = new MutableUserDetails();
            install(formAuthentication(principal));
            duringSystemMapping(() -> revoke.accept(principal));

            assertRejectedBeforeBusiness(USER_ID);
        }
        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsSameIdentityNewTokenInstalledDuringLocalLoginMapping() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringLoginMapping(() -> install(formAuthentication((UserDetails) original.getPrincipal())));

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void rejectsAuthenticationRevokedDuringLocalLoginMapping() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringLoginMapping(() -> original.setAuthenticated(false));

        assertRejectedBeforeBusiness(USER_ID);
    }

    @Test
    public void rejectsAnyUserDetailsAccountStateRevokedDuringLocalLoginMapping() {
        for (Consumer<MutableUserDetails> revoke : accountRevocations()) {
            MutableUserDetails principal = new MutableUserDetails();
            install(formAuthentication(principal));
            duringLoginMapping(() -> revoke.accept(principal));

            assertRejectedBeforeBusiness(USER_ID);
        }
    }

    @Test
    public void saml_rejectsContextReplacedDuringSystemUserMappingWithoutLocalPasswordFallback() {
        install(samlAuthentication());
        duringSystemMapping(() -> install(samlAuthentication()));

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void oauth_rejectsContextClearedDuringSystemUserMappingWithoutLocalPasswordFallback() {
        install(oauthAuthentication());
        duringSystemMapping(SecurityContextHolder::clearContext);

        assertRejectedBeforeBusiness(USER_ID);

        verifyZeroInteractions(loginUserService);
    }

    @Test
    public void rejectsContextClearedDuringMemberLookupInsteadOfReturningEarlierIdentityApproval() {
        duringAnalysisLookup(SecurityContextHolder::clearContext);

        assertRejectedAfterMemberLookup();
    }

    @Test
    public void rejectsSameIdentityNewTokenInstalledDuringMemberLookup() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringAnalysisLookup(() -> install(formAuthentication((UserDetails) original.getPrincipal())));

        assertRejectedAfterMemberLookup();
    }

    @Test
    public void rejectsAuthenticationRevokedDuringMemberLookup() {
        Authentication original = SecurityContextHolder.getContext().getAuthentication();
        duringAnalysisLookup(() -> original.setAuthenticated(false));

        assertRejectedAfterMemberLookup();
    }

    @Test
    public void rejectsContextChangedDuringFinalReportsSectionLookup() {
        when(userService.getUserTestSections(USER_ID, "77")).thenAnswer(invocation -> {
            SecurityContextHolder.clearContext();
            return List.of(new IdValuePair("301", "SIM-A"));
        });

        assertRejectedAfterMemberLookup();

        verify(userService).getUserTestSections(USER_ID, "77");
    }

    @Test
    public void correctIdentityDoesNotBypassUnauthorizedReportMember() {
        TestSection unauthorized = new TestSection();
        unauthorized.setId("302");
        analysis.setTestSection(unauthorized);

        assertThrows(AccessDeniedException.class, this::authorize);

        verifyFormMappingAndBusinessOrder();
    }

    private void authorize() {
        service.authorizeExplicitScope(scope(), USER_ID);
    }

    private ReportScopeDefinition scope() {
        return new ReportScopeDefinition(PATIENT_ID, SAMPLE_ID, "SIM-explicit-group", "SIM-rule-1", MEMBER_IDS);
    }

    private AccessDeniedException assertRejectedBeforeBusiness(String userId) {
        AccessDeniedException denied = assertThrows(AccessDeniedException.class,
                () -> service.authorizeExplicitScope(scope(), userId));
        verifyZeroInteractions(sampleService, sampleHumanService, analysisService, roleService, userService);
        return denied;
    }

    private void assertRejectedBeforeIdentity() {
        assertRejectedBeforeBusiness(USER_ID);
        verifyZeroInteractions(systemUserService, loginUserService);
    }

    private void assertRejectedAfterMemberLookup() {
        assertThrows(AccessDeniedException.class, this::authorize);
        verify(sampleService).get(SAMPLE_ID);
        verify(sampleHumanService).getPatientForSample(sample);
        verify(analysisService).get(MEMBER_IDS);
    }

    private void assertSanitized(AccessDeniedException denied) {
        assertFalse(String.valueOf(denied.getMessage()).contains(PRIVATE_FAILURE));
        assertNull(denied.getCause());
    }

    private void verifyFormMappingAndBusinessOrder() {
        InOrder sequence = inOrder(systemUserService, loginUserService, sampleService, sampleHumanService,
                analysisService, roleService, userService);
        sequence.verify(systemUserService).getMatch("loginName", LOGIN);
        sequence.verify(loginUserService).getMatch("loginName", LOGIN);
        verifyBusinessOrder(sequence);
    }

    private void verifySsoMappingAndBusinessOrder() {
        InOrder sequence = inOrder(systemUserService, sampleService, sampleHumanService, analysisService, roleService,
                userService);
        sequence.verify(systemUserService).getMatch("loginName", LOGIN);
        verifyBusinessOrder(sequence);
        verifyZeroInteractions(loginUserService);
        verifyNoMoreInteractions(systemUserService);
    }

    private void verifyBusinessOrder(InOrder sequence) {
        sequence.verify(sampleService).get(SAMPLE_ID);
        sequence.verify(sampleHumanService).getPatientForSample(sample);
        sequence.verify(analysisService).get(MEMBER_IDS);
        sequence.verify(roleService).getRoleByName(Constants.ROLE_REPORTS);
        sequence.verify(userService).getUserTestSections(USER_ID, "77");
    }

    private void duringSystemMapping(Runnable change) {
        when(systemUserService.getMatch("loginName", LOGIN)).thenAnswer(invocation -> {
            change.run();
            return Optional.of(systemUser);
        });
    }

    private void duringLoginMapping(Runnable change) {
        when(loginUserService.getMatch("loginName", LOGIN)).thenAnswer(invocation -> {
            change.run();
            return Optional.of(loginUser);
        });
    }

    private void duringAnalysisLookup(Runnable change) {
        when(analysisService.get(MEMBER_IDS)).thenAnswer(invocation -> {
            change.run();
            return List.of(analysis);
        });
    }

    private List<Consumer<MutableUserDetails>> accountRevocations() {
        return List.of(value -> value.enabled = false, value -> value.accountNonExpired = false,
                value -> value.credentialsNonExpired = false, value -> value.accountNonLocked = false);
    }

    private UserDetails formUser(boolean enabled, boolean accountNonExpired, boolean credentialsNonExpired,
            boolean accountNonLocked) {
        return new User(LOGIN, "SIM-unused-password", enabled, accountNonExpired, credentialsNonExpired,
                accountNonLocked, REPORTS);
    }

    private Authentication formAuthentication(UserDetails principal) {
        return new UsernamePasswordAuthenticationToken(principal, "SIM-unused-credentials", REPORTS);
    }

    private Authentication samlAuthentication() {
        DefaultSaml2AuthenticatedPrincipal principal = new DefaultSaml2AuthenticatedPrincipal(LOGIN,
                Map.of("SIM-attribute", List.of("SIM-value")));
        return new Saml2Authentication(principal, "SIM-saml-response", REPORTS);
    }

    private Authentication oauthAuthentication() {
        DefaultOAuth2User principal = new DefaultOAuth2User(REPORTS, Map.of("sub", LOGIN), "sub");
        return new OAuth2AuthenticationToken(principal, REPORTS, "SIM-oauth-client");
    }

    private void install(Authentication authentication) {
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private SystemUser systemUser(String id, String login) {
        SystemUser value = new SystemUser();
        value.setId(id);
        value.setLoginName(login);
        value.setIsActive("Y");
        return value;
    }

    private LoginUser loginUser(int userId, String login) {
        LoginUser value = new LoginUser();
        value.setId(61);
        value.setLoginName(login);
        value.setSystemUserId(userId);
        value.setAccountDisabled("N");
        value.setAccountLocked("N");
        value.setPasswordExpiredDayNo(30);
        return value;
    }

    /** A concrete in-memory principal for deterministic in-call state changes, not a mocked authority check. */
    private static final class MutableUserDetails implements UserDetails {
        private static final long serialVersionUID = 1L;
        private String username = LOGIN;
        private boolean enabled = true;
        private boolean accountNonExpired = true;
        private boolean credentialsNonExpired = true;
        private boolean accountNonLocked = true;

        @Override
        public Collection<? extends GrantedAuthority> getAuthorities() {
            return REPORTS;
        }

        @Override
        public String getPassword() {
            return "SIM-unused-password";
        }

        @Override
        public String getUsername() {
            return username;
        }

        @Override
        public boolean isAccountNonExpired() {
            return accountNonExpired;
        }

        @Override
        public boolean isAccountNonLocked() {
            return accountNonLocked;
        }

        @Override
        public boolean isCredentialsNonExpired() {
            return credentialsNonExpired;
        }

        @Override
        public boolean isEnabled() {
            return enabled;
        }
    }

    /** Concrete token fixture lets one lookup revoke authority or replace its principal without a new token. */
    private static final class MutableAuthentication extends AbstractAuthenticationToken {
        private static final long serialVersionUID = 1L;
        private Object principal;
        private Collection<GrantedAuthority> currentAuthorities = REPORTS;

        private MutableAuthentication(Object principal) {
            super(REPORTS);
            this.principal = principal;
            setAuthenticated(true);
        }

        @Override
        public Collection<GrantedAuthority> getAuthorities() {
            return currentAuthorities;
        }

        @Override
        public Object getCredentials() {
            return "SIM-unused-credentials";
        }

        @Override
        public Object getPrincipal() {
            return principal;
        }
    }
}
