package org.openelisglobal.barcode.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;
import java.util.Optional;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

public class BarcodeLabelGenerationPermissionServiceTest {
    private final UserModuleService users = mock(UserModuleService.class);
    private final UserRoleService roles = mock(UserRoleService.class);
    private final PermissionModuleService<PermissionModule> modules = mock(PermissionModuleService.class);
    private final DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final BarcodeLabelGenerationPermissionService permission = new BarcodeLabelGenerationPermissionService(users, roles, modules);
    private Object previousFactory;
    private final SystemUserService systemUsers = mock(SystemUserService.class);
    private final LoginUserService loginUsers = mock(LoginUserService.class);
    private final RoleService roleDefinitions = mock(RoleService.class);
    private final SystemUser account = new SystemUser();

    @Before
    public void setup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("3"));
        Role printRole = new Role(); printRole.setId("3"); printRole.setName("printer"); printRole.setActive(true);
        when(roleDefinitions.getMatch("id", "3")).thenReturn(Optional.of(printRole));
        when(modules.getAllPermittedPagesFromAgentId(anyInt())).thenReturn(Set.of());
        UserSessionData identity = new UserSessionData();
        identity.setSytemUserId(7);
        identity.setLoginName("SIM-print-operator");
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, identity);
        var principal = User.withUsername("SIM-print-operator").password("unused").authorities("ROLE_PRINT_ONLY").build();
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authentication);
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        account.setId("7"); account.setLoginName("SIM-print-operator"); account.setIsActive("Y");
        when(systemUsers.getMatch("loginName", "SIM-print-operator")).thenReturn(Optional.of(account));
        LoginUser local = new LoginUser();
        local.setLoginName("SIM-print-operator"); local.setSystemUserId(7);
        local.setAccountDisabled("N"); local.setAccountLocked("N"); local.setPasswordExpiredDayNo(90);
        when(loginUsers.getMatch("loginName", "SIM-print-operator")).thenReturn(Optional.of(local));
        ReflectionTestUtils.setField(permission, "systemUsers", systemUsers);
        ReflectionTestUtils.setField(permission, "loginUsers", loginUsers);
        ReflectionTestUtils.setField(permission, "roleDefinitions", roleDefinitions);
    }

    @After
    public void teardown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void adminKeepsExistingPrintPermission() {
        when(users.isUserAdmin(request)).thenReturn(true);
        assertEquals("7", permission.requirePrintPermission(request).userId());
        verify(roles, never()).getRoleIdsForUser(anyString());
    }

    @Test
    public void authenticatedButUnmappedRestUserIsDenied() {
        rejected(403);
    }

    @Test
    public void checksSpecificPrintBarcodeRoleModule() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
        assertEquals("7", permission.requirePrintPermission(request).userId());
    }

    @Test
    public void orderEntryModuleDoesNotGrantPrintPermission() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("SamplePatientEntry"));
        rejected(403);
    }

    @Test
    public void userPermissionModeUsesUserIdNotRoleId() {
        when(config.getPropertyValue("permissions.agent")).thenReturn("USER");
        when(modules.getAllPermittedPagesFromAgentId(7)).thenReturn(Set.of("PrintBarcode"));
        assertEquals("7", permission.requirePrintPermission(request).userId());
        verify(roles, never()).getRoleIdsForUser(anyString());
    }

    @Test
    public void expiredSessionIsRejectedEvenForAdmin() {
        when(users.isSessionExpired(request)).thenReturn(true);
        when(users.isUserAdmin(request)).thenReturn(true);
        rejected(401);
        verify(users, never()).isUserAdmin(request);
    }

    @Test
    public void noIdentityDoesNotQueryPermissions() {
        request.getSession().removeAttribute(IActionConstants.USER_SESSION_DATA);
        rejected(401);
        verify(modules, never()).getAllPermittedPagesFromAgentId(anyInt());
    }

    @Test
    public void unknownPermissionModeFailsClosed() {
        when(config.getPropertyValue("permissions.agent")).thenReturn(null);
        rejected(403);
    }

    @Test public void legacyIdentityWithoutAuthenticationIsDeniedBeforeModuleLookup() {
        SecurityContextHolder.clearContext();
        rejected(401);
        verify(users, never()).isUserAdmin(request);
    }

    @Test public void inactiveAccountDoesNotInheritOldAdminPermission() {
        account.setIsActive("N");
        when(users.isUserAdmin(request)).thenReturn(true);
        rejected(401);
        verify(users, never()).isUserAdmin(request);
    }

    @Test public void mismatchedRequestIdentityIsDenied() {
        UserSessionData other = new UserSessionData(); other.setSytemUserId(8);
        request.setAttribute(IActionConstants.USER_SESSION_DATA, other);
        rejected(401);
        verify(users, never()).isUserAdmin(request);
    }

    @Test public void printOnlyRoleDoesNotNeedReception() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
        assertEquals("7", permission.requirePrintPermission(request).userId());
        verify(roles, never()).userInRole(anyString(), anyString());
    }

    @Test public void requestIdentityChangedDuringPermissionLookupFailsClosed() {
        when(users.isUserAdmin(request)).thenAnswer(call -> {
            UserSessionData other = new UserSessionData(); other.setSytemUserId(8);
            request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, other);
            return true;
        });
        rejected(401);
    }

    private void sso(boolean saml) {
        var grants = List.of(new SimpleGrantedAuthority("SIM-printer"));
        Authentication authentication = saml
                ? new Saml2Authentication(new DefaultSaml2AuthenticatedPrincipal("SIM-print-operator", Map.of()), "SIM-response", grants)
                : new OAuth2AuthenticationToken(new DefaultOAuth2User(grants, Map.of("name", "SIM-print-operator"), "name"), grants, "SIM-provider");
        SecurityContextHolder.getContext().setAuthentication(authentication);
        when(loginUsers.getMatch(anyString(), any())).thenReturn(Optional.empty());
        when(roles.getRoleIdsForUser(anyString())).thenReturn(List.of());
        Role role = new Role(); role.setId("3"); role.setName("printer"); role.setActive(true);
        when(roleDefinitions.getMatch("name", "printer")).thenReturn(Optional.of(role));
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
    }

    @Test public void samlPrintRoleWorksWithoutLocalPasswordAccountOrRoles() {
        sso(true);
        assertEquals("7", permission.requirePrintPermission(request).userId());
        verify(loginUsers, never()).getMatch(anyString(), any()); verify(users, never()).isUserAdmin(any());
        verify(roles, never()).getRoleIdsForUser(anyString());
    }

    @Test public void oauthPrintRoleWorksWithoutLocalPasswordAccountOrRoles() {
        sso(false);
        assertEquals("7", permission.requirePrintPermission(request).userId());
        verify(loginUsers, never()).getMatch(anyString(), any()); verify(users, never()).isUserAdmin(any());
    }

    @Test public void ssoOldCachedPagesCannotOverrideRevokedModule() {
        sso(true);
        request.getSession().setAttribute(IActionConstants.PERMITTED_ACTIONS_MAP, Set.of("PrintBarcode"));
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of());
        rejected(403);
    }

    @Test public void inactiveSsoRoleCannotAuthorizePrinting() {
        sso(false);
        roleDefinitions.getMatch("name", "printer").orElseThrow().setActive(false);
        rejected(403);
    }

    @Test public void missingSsoRoleCannotBorrowLocalAdminFlag() {
        sso(true);
        when(users.isUserAdmin(request)).thenReturn(true);
        when(roleDefinitions.getMatch("name", "printer")).thenReturn(Optional.empty());
        rejected(403); verify(users, never()).isUserAdmin(any());
    }

    @Test public void lockedLocalAccountCannotBorrowPrintModule() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
        loginUsers.getMatch("loginName", "SIM-print-operator").orElseThrow().setAccountLocked("Y");
        rejected(401); verify(users, never()).isUserAdmin(any());
    }

    @Test public void inactiveLocalRoleCannotKeepItsOldPrintModule() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
        roleDefinitions.getMatch("id", "3").orElseThrow().setActive(false);
        rejected(403); verify(modules, never()).getAllPermittedPagesFromAgentId(anyInt());
    }

    @Test public void missingLocalRoleCannotKeepItsOldPrintModule() {
        when(modules.getAllPermittedPagesFromAgentId(3)).thenReturn(Set.of("PrintBarcode"));
        when(roleDefinitions.getMatch("id", "3")).thenReturn(Optional.empty());
        rejected(403); verify(modules, never()).getAllPermittedPagesFromAgentId(anyInt());
    }

    @Test public void rememberMeAndAnonymousAreNotInteractiveOperators() {
        var current = SecurityContextHolder.getContext().getAuthentication();
        SecurityContextHolder.getContext().setAuthentication(new org.springframework.security.authentication.RememberMeAuthenticationToken("SIM", current.getPrincipal(), current.getAuthorities()));
        rejected(401);
        SecurityContextHolder.getContext().setAuthentication(new org.springframework.security.authentication.AnonymousAuthenticationToken("SIM", current.getPrincipal(), current.getAuthorities()));
        rejected(401); verify(users, never()).isUserAdmin(any());
    }

    @Test public void credentialsExpiredAccountAndDaemonAreRejected() {
        loginUsers.getMatch("loginName", "SIM-print-operator").orElseThrow().setPasswordExpiredDayNo(0);
        rejected(401);
        SecurityContextHolder.getContext().setAuthentication(new org.openelisglobal.security.DaemonAuthenticationToken("7"));
        rejected(401); verify(users, never()).isUserAdmin(any());
    }

    private void rejected(int status) {
        try {
            permission.requirePrintPermission(request);
            fail("Expected denial");
        } catch (BarcodeLabelGenerationException error) {
            assertEquals(status, error.getStatus());
        }
    }
}
