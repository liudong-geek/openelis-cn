package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.security.DaemonAuthenticationToken;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Identity decisions only. The entry suite exercises real transaction rollback. */
public class OrderEntryActorGuardTest {
    private static final String LOGIN = "SIM-operator";
    private static final List<SimpleGrantedAuthority> RECEPTION = List.of(new SimpleGrantedAuthority("ROLE_RECEPTION"));
    private OrderEntryActorGuard guard;
    private SystemUserService users;
    private LoginUserService logins;
    private UserRoleService roles;
    private SystemUser user;
    private LoginUser account;
    private UserSessionData sessionUser;
    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        guard = new OrderEntryActorGuard();
        users = mock(SystemUserService.class);
        logins = mock(LoginUserService.class);
        roles = mock(UserRoleService.class);
        ReflectionTestUtils.setField(guard, "systemUserService", users);
        ReflectionTestUtils.setField(guard, "loginUserService", logins);
        ReflectionTestUtils.setField(guard, "userRoleService", roles);
        user = new SystemUser();
        user.setId("7");
        user.setLoginName(LOGIN);
        user.setIsActive("Y");
        account = new LoginUser();
        account.setLoginName(LOGIN);
        account.setSystemUserId(7);
        account.setAccountDisabled("N");
        account.setAccountLocked("N");
        account.setPasswordExpiredDayNo(1);
        when(users.getMatch("loginName", LOGIN)).thenReturn(Optional.of(user));
        when(logins.getMatch("loginName", LOGIN)).thenReturn(Optional.of(account));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        sessionUser = new UserSessionData();
        sessionUser.setSytemUserId(7);
        sessionUser.setLoginName(LOGIN);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        authenticate(localAuthentication());
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void tearDown() {
        TransactionSynchronizationManager.clear();
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void bindsUniqueActiveLocalUserAndRegistersCommitCheck() {
        var bound = guard.bind(request);
        assertEquals("7", bound.userId());
        assertEquals(1, TransactionSynchronizationManager.getSynchronizations().size());
        guard.requireUnchanged(request, bound);
        verify(users, times(2)).getMatch("loginName", LOGIN);
        verify(logins, times(2)).getMatch("loginName", LOGIN);
    }

    @Test
    public void equivalentSessionAuthenticationForSameUserAndAuthoritiesIsAccepted() {
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(localAuthentication()));
        assertEquals("7", guard.bind(request).userId());
        verify(roles).userInRole("7", Constants.ROLE_RECEPTION);
    }

    @Test
    public void samlUsesActiveSystemIdentityWithoutLocalPasswordAccount() {
        reset(roles, logins);
        authenticate(new UsernamePasswordAuthenticationToken(
                new DefaultSaml2AuthenticatedPrincipal(LOGIN, Map.of()), null, RECEPTION));
        assertEquals("7", guard.bind(request).userId());
        verifyZeroInteractions(logins, roles);
    }

    @Test
    public void oauthUsesActiveSystemIdentityWithoutLocalPasswordAccount() {
        reset(roles, logins);
        authenticate(new UsernamePasswordAuthenticationToken(
                new DefaultOAuth2User(RECEPTION, Map.of("name", LOGIN), "name"), null, RECEPTION));
        assertEquals("7", guard.bind(request).userId());
        verifyZeroInteractions(logins, roles);
    }

    @Test
    public void rejectsDifferentPermissionSourceWithSameNameAndAuthorities() {
        var saml = new DefaultSaml2AuthenticatedPrincipal(LOGIN, Map.of());
        var oauth = new DefaultOAuth2User(RECEPTION, Map.of("name", LOGIN), "name");
        for (Object principal : List.of(saml, oauth)) {
            authenticate(new UsernamePasswordAuthenticationToken(principal, null, RECEPTION));
            request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(localAuthentication()));
            denied();
        }
    }

    @Test
    public void rejectsMissingOrDifferentRequestContextBeforeAccountLookup() {
        RequestContextHolder.resetRequestAttributes();
        denied();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        denied();
        RequestContextHolder.setRequestAttributes(mock(org.springframework.web.context.request.RequestAttributes.class));
        denied();
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsOtherSessionEvenWhenAllIdentityValuesMatch() {
        var other = new MockHttpServletRequest();
        other.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        other.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(localAuthentication()));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
        denied();
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void acceptsRequestWrapperUsingSameSession() {
        var wrapped = new jakarta.servlet.http.HttpServletRequestWrapper(request);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(wrapped));
        assertEquals("7", guard.bind(request).userId());
    }

    @Test
    public void rejectsContextRequestWithConflictingRequestIdentity() {
        var other = new MockHttpServletRequest();
        other.setSession(request.getSession());
        var otherUser = new UserSessionData();
        otherUser.setSytemUserId(8);
        other.setAttribute(IActionConstants.USER_SESSION_DATA, otherUser);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
        denied();
    }

    @Test
    public void rejectsChangedContextSessionAtCommit() {
        guard.bind(request);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        assertThrows(AccessDeniedException.class,
                () -> TransactionSynchronizationManager.getSynchronizations().get(0).beforeCommit(false));
    }

    @Test
    public void globalAdminStillRequiresCurrentDatabaseRole() {
        var admin = List.of(new SimpleGrantedAuthority("ROLE_GLOBAL_ADMIN"));
        authenticate(new UsernamePasswordAuthenticationToken(localAuthentication().getPrincipal(), null, admin));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(false);
        denied();
        when(roles.userInRole("7", Constants.ROLE_GLOBAL_ADMIN)).thenReturn(true);
        assertEquals("7", guard.bind(request).userId());
    }

    @Test
    public void rejectsMissingAuthenticationBeforeAccountLookup() {
        SecurityContextHolder.clearContext();
        denied();
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsAnonymousRememberMeDaemonAndUnauthenticatedTokens() {
        var principal = localAuthentication().getPrincipal();
        for (Authentication auth : List.of(new AnonymousAuthenticationToken("SIM-key", principal, RECEPTION),
                new RememberMeAuthenticationToken("SIM-key", principal, RECEPTION), new DaemonAuthenticationToken("99"),
                new UsernamePasswordAuthenticationToken(principal, null))) {
            authenticate(auth);
            denied();
        }
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsUnknownPrincipalOrMissingReceptionAuthority() {
        authenticate(new UsernamePasswordAuthenticationToken(LOGIN, null, RECEPTION));
        denied();
        authenticate(new UsernamePasswordAuthenticationToken(localAuthentication().getPrincipal(), null,
                List.of(new SimpleGrantedAuthority("ROLE_RESULTS"))));
        denied();
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsDisabledOrExpiredPrincipalEvenWithAnActiveDatabaseUser() {
        authenticate(new UsernamePasswordAuthenticationToken(new User(LOGIN, "SIM-unused", false, true, true, true,
                RECEPTION), null, RECEPTION));
        denied();
        authenticate(new UsernamePasswordAuthenticationToken(new User(LOGIN, "SIM-unused", true, true, false, true,
                RECEPTION), null, RECEPTION));
        denied();
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsAbsentOrNonUniqueSystemUser() {
        when(users.getMatch("loginName", LOGIN)).thenReturn(Optional.empty());
        denied();
        when(users.getMatch("loginName", LOGIN)).thenThrow(new IllegalStateException("SIM duplicate identity"));
        denied();
        verifyZeroInteractions(logins, roles);
    }

    @Test
    public void rejectsInactiveUserAndInvalidUserId() {
        user.setIsActive("N");
        denied();
        user.setIsActive("Y");
        for (String id : List.of("0", "-1", "07", "unknown", "")) {
            user.setId(id);
            denied();
        }
        user.setId(null);
        denied();
        verifyZeroInteractions(logins, roles);
    }

    @Test
    public void rejectsAccountIdentityMismatchAndMissingLogin() {
        account.setSystemUserId(8);
        denied();
        when(logins.getMatch("loginName", LOGIN)).thenReturn(Optional.empty());
        denied();
        verifyZeroInteractions(roles);
    }

    @Test
    public void rejectsDisabledLockedExpiredOrUnknownLocalAccountState() {
        account.setAccountDisabled("Y");
        denied();
        account.setAccountDisabled("N");
        account.setAccountLocked("Y");
        denied();
        account.setAccountLocked("N");
        account.setPasswordExpiredDayNo(0);
        denied();
        account.setPasswordExpiredDayNo(1);
        account.setAccountDisabled(null);
        denied();
        verifyZeroInteractions(roles);
    }

    @Test
    public void rejectsDifferentUserInOeSessionOrRequest() {
        sessionUser.setSytemUserId(8);
        denied();
        sessionUser.setSytemUserId(7);
        var other = new UserSessionData();
        other.setSytemUserId(8);
        request.setAttribute(IActionConstants.USER_SESSION_DATA, other);
        denied();
    }

    @Test
    public void rejectsInvalidOeTypeOrConflictingLoginName() {
        request.setAttribute(IActionConstants.USER_SESSION_DATA, "SIM-invalid");
        denied();
        request.removeAttribute(IActionConstants.USER_SESSION_DATA);
        sessionUser.setLoginName("SIM-other");
        denied();
    }

    @Test
    public void requiresInitializedOeAndSecuritySessionWithoutCreatingOne() {
        request.getSession().removeAttribute(IActionConstants.USER_SESSION_DATA);
        denied();
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        request.getSession().removeAttribute("SPRING_SECURITY_CONTEXT");
        denied();
        request = new MockHttpServletRequest();
        denied();
        assertNull(request.getSession(false));
    }

    @Test
    public void rejectsOtherPrincipalOrBroaderPermissionsInSecuritySession() {
        var other = User.withUsername("SIM-other").password("SIM-unused").roles("RECEPTION").build();
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(
                new UsernamePasswordAuthenticationToken(other, null, RECEPTION)));
        denied();
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(
                new UsernamePasswordAuthenticationToken(localAuthentication().getPrincipal(), null,
                        List.of(new SimpleGrantedAuthority("ROLE_RECEPTION"),
                                new SimpleGrantedAuthority("oeg-Reception-AllLabUnits")))));
        denied();
    }

    @Test
    public void rejectsInvalidSessionSecurityContext() {
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", "SIM-invalid");
        denied();
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl());
        denied();
    }

    @Test
    public void rejectsRevokedRegistrationRole() {
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(false);
        denied();
    }

    @Test
    public void requiresTransactionAndSynchronization() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        assertThrows(IllegalStateException.class, () -> guard.bind(request));
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.clearSynchronization();
        assertThrows(IllegalStateException.class, () -> guard.bind(request));
        verifyZeroInteractions(users, logins, roles);
    }

    @Test
    public void rejectsReplacedAuthenticationEvenForSameLogin() {
        var bound = guard.bind(request);
        authenticate(localAuthentication());
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, bound));
    }

    @Test
    public void capturedIdentityDoesNotFollowMutableDatabaseOrSessionObject() {
        var bound = guard.bind(request);
        user.setId("8");
        account.setSystemUserId(8);
        sessionUser.setSytemUserId(8);
        when(roles.userInRole("8", Constants.ROLE_RECEPTION)).thenReturn(true);
        assertEquals("7", bound.userId());
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, bound));
    }

    @Test
    public void beforeCommitRechecksRoleAndLabUnit() {
        guard.bind(request);
        var sync = TransactionSynchronizationManager.getSynchronizations().get(0);
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(false);
        assertThrows(AccessDeniedException.class, () -> sync.beforeCommit(false));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        sessionUser.setLoginLabUnit(9);
        assertThrows(AccessDeniedException.class, () -> sync.beforeCommit(false));
    }

    @Test
    public void detectsSessionInvalidationAndReplacementBeforeCommit() {
        var bound = guard.bind(request);
        request.getSession().invalidate();
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, bound));
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, bound));
    }

    @Test
    public void detectsContextOrSessionChangesDuringAccountAndRoleLookups() {
        var changed = new AtomicBoolean();
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenAnswer(call -> {
            changed.set(true);
            sessionUser.setSytemUserId(8);
            return true;
        });
        denied();
        assertTrue(changed.get());
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
    }

    private void denied() {
        var failure = assertThrows(AccessDeniedException.class, () -> guard.bind(request));
        assertEquals("登录身份或登记权限已变化，请重新登录后再保存。", failure.getMessage());
    }

    private Authentication localAuthentication() {
        return new UsernamePasswordAuthenticationToken(
                User.withUsername(LOGIN).password("SIM-unused").roles("RECEPTION").build(), null, RECEPTION);
    }

    private void authenticate(Authentication authentication) {
        var context = new SecurityContextImpl(authentication);
        SecurityContextHolder.setContext(context);
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", context);
    }
}
