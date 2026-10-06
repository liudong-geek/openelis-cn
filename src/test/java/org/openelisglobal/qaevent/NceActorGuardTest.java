package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.service.NceActorGuard;
import org.openelisglobal.security.DaemonAuthenticationToken;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
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

/**
 * Existing authentication source types; this guard never substitutes for
 * current module grants.
 */
public class NceActorGuardTest {
    private static final String LOGIN = "operator7";
    private static final List<SimpleGrantedAuthority> AUTHORITIES = List
            .of(new SimpleGrantedAuthority("ROLE_VALIDATION"));
    private NceActorGuard guard;
    private SystemUserService users;
    private LoginUserService accounts;
    private MockHttpServletRequest request;
    private SystemUser user;
    private LoginUser account;

    @Before
    public void setup() {
        guard = new NceActorGuard();
        users = mock(SystemUserService.class);
        accounts = mock(LoginUserService.class);
        ReflectionTestUtils.setField(guard, "systemUserService", users);
        ReflectionTestUtils.setField(guard, "loginUserService", accounts);
        ReflectionTestUtils.setField(guard, "dao", mock(NceWorkspaceDAO.class));
        user = new SystemUser();
        user.setId("7");
        user.setLoginName(LOGIN);
        user.setIsActive("Y");
        when(users.getMatch("loginName", LOGIN)).thenReturn(Optional.of(user));
        account = new LoginUser();
        account.setLoginName(LOGIN);
        account.setSystemUserId(7);
        account.setAccountDisabled("N");
        account.setAccountLocked("N");
        account.setPasswordExpiredDayNo(1);
        when(accounts.getMatch("loginName", LOGIN)).thenReturn(Optional.of(account));
        request = new MockHttpServletRequest();
        var usd = new UserSessionData();
        usd.setSytemUserId(7);
        usd.setLoginName(LOGIN);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, usd);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        authenticate(local());
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void close() {
        TransactionSynchronizationManager.clear();
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    private Authentication local() {
        return new UsernamePasswordAuthenticationToken(
                User.withUsername(LOGIN).password("unused").roles("VALIDATION").build(), null, AUTHORITIES);
    }

    private void authenticate(Authentication a) {
        var context = new SecurityContextImpl(a);
        SecurityContextHolder.setContext(context);
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", context);
    }

    @Test
    public void samlUsesRealActiveIdentityWithoutInventingLocalPasswordAccount() {
        reset(accounts);
        authenticate(new UsernamePasswordAuthenticationToken(new DefaultSaml2AuthenticatedPrincipal(LOGIN, Map.of()),
                null, AUTHORITIES));
        assertEquals("7", guard.bind(request).userId());
        verifyZeroInteractions(accounts);
    }

    @Test
    public void oauthUsesItsOwnRealPermissionSourceWithoutLocalPasswordLookup() {
        reset(accounts);
        authenticate(new UsernamePasswordAuthenticationToken(
                new DefaultOAuth2User(AUTHORITIES, Map.of("name", LOGIN), "name"), null, AUTHORITIES));
        assertEquals("7", guard.bind(request).userId());
        verifyZeroInteractions(accounts);
    }

    @Test
    public void sameNameAndAuthorityCannotMixSamlWithLocalSessionSource() {
        authenticate(new UsernamePasswordAuthenticationToken(new DefaultSaml2AuthenticatedPrincipal(LOGIN, Map.of()),
                null, AUTHORITIES));
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(local()));
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
    }

    @Test
    public void rememberMeAnonymousAndDaemonCannotBecomeRegistrationActors() {
        var principal = local().getPrincipal();
        authenticate(new RememberMeAuthenticationToken("test", principal, AUTHORITIES));
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
        authenticate(new AnonymousAuthenticationToken("test", principal, AUTHORITIES));
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
        authenticate(new DaemonAuthenticationToken("7"));
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
    }

    @Test
    public void missingAndDifferentRequestSessionNeverUseCachedIdentity() {
        RequestContextHolder.resetRequestAttributes();
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        assertThrows(AccessDeniedException.class, () -> guard.bind(request));
    }

    @Test
    public void equivalentNameWithNewAuthenticationObjectFailsBoundLateRequest() {
        var actor = guard.bind(request);
        authenticate(local());
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, actor));
    }

    @Test
    public void actualLocalAccountOrSystemIdentityDeactivationIsRechecked() {
        var actor = guard.bind(request);
        account.setAccountDisabled("Y");
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, actor));
        account.setAccountDisabled("N");
        user.setIsActive("N");
        assertThrows(AccessDeniedException.class, () -> guard.requireUnchanged(request, actor));
    }
}
