package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;

public class SampleEditAuthorizationServiceTest {
    private Object previousFactory;
    private SecurityContext previousContext;
    private DefaultConfigurationProperties properties;
    private UserModuleService userModules;
    private UserRoleService roles;
    private PermissionModuleService<PermissionModule> permissions;
    private SystemUserService users;
    private SampleEditAuthorizationService authorization;
    private MockHttpServletRequest request;
    private SystemUser currentUser;

    @Before
    @SuppressWarnings("unchecked")
    public void setUp() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        previousContext = SecurityContextHolder.getContext();
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        properties = mock(DefaultConfigurationProperties.class);
        when(properties.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        userModules = mock(UserModuleService.class);
        roles = mock(UserRoleService.class);
        permissions = mock(PermissionModuleService.class);
        users = mock(SystemUserService.class);
        authorization = new SampleEditAuthorizationService(userModules, roles, permissions, users);
        currentUser = new SystemUser();
        currentUser.setId("7");
        currentUser.setLoginName("technician");
        currentUser.setIsActive("Y");
        when(users.getMatch("id", "7")).thenReturn(Optional.of(currentUser));
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("3"));
        when(permissions.getAllPermissionModulesByAgentId(3)).thenReturn(List.of());
        request = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(7);
        actor.setLoginName("technician");
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(
                User.withUsername("technician").password("unused").roles("RESULTS").build(), null,
                List.of(new SimpleGrantedAuthority("ROLE_RESULTS"))));
        SecurityContextHolder.setContext(context);
        request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
    }

    @After
    public void restoreStatics() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        SecurityContextHolder.setContext(previousContext);
    }

    @Test
    public void mappedWriteModuleAllowsReadAndWrite() {
        grant("SampleEdit:readwrite", "Y", "Y");
        assertTrue(authorization.canWrite(request, "7"));
        authorization.requireWrite(request, "7");
        authorization.requireRead(request, "7");
    }

    @Test
    public void genericEditModuleRequiresActualUpdateGrant() {
        grant("SampleEdit", "Y", "N");
        authorization.requireRead(request, "7");
        assertFalse(authorization.canWrite(request, "7"));
        assertThrows(AccessDeniedException.class, () -> authorization.requireWrite(request, "7"));
        grant("SampleEdit", "Y", "Y");
        authorization.requireWrite(request, "7");
    }

    @Test
    public void readonlyModuleNeverAllowsWritesEvenWhenOldFlagsSayYes() {
        grant("SampleEdit:readonly", "Y", "Y");
        authorization.requireRead(request, "7");
        assertFalse(authorization.canWrite(request, "7"));
        assertThrows(AccessDeniedException.class, () -> authorization.requireWrite(request, "7"));
    }

    @Test
    public void cachedPagesAndWritableTypeDoNotCreatePermission() {
        request.getSession().setAttribute(IActionConstants.PERMITTED_ACTIONS_MAP,
                new HashSet<>(List.of("SampleEdit:readwrite")));
        request.getSession().setAttribute("SampleEditWritable", "readwrite");
        request.addParameter("type", "readwrite");
        assertFalse(authorization.canWrite(request, "7"));
        assertThrows(AccessDeniedException.class, () -> authorization.requireRead(request, "7"));
    }

    @Test
    public void administratorKeepsExistingAccessWithoutModuleRows() {
        when(userModules.isUserAdmin(request)).thenReturn(true);
        authorization.requireWrite(request, "7");
        authorization.requireRead(request, "7");
        verifyZeroInteractions(roles, permissions);
    }

    @Test
    public void userPermissionModeQueriesUserNotRole() {
        when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");
        PermissionModule grant = module("SampleEdit:readwrite", "Y", "Y");
        when(permissions.getAllMatching("systemUser.id", "7")).thenReturn(List.of(grant));
        authorization.requireWrite(request, "7");
        verifyZeroInteractions(roles);
        verify(permissions).getAllMatching("systemUser.id", "7");
        verify(permissions, never()).getAllPermissionModulesByAgentId(anyInt());
    }

    @Test
    public void currentRoleGrantRevocationTakesEffectWithoutSessionReset() {
        grant("SampleEdit:readwrite", "Y", "Y");
        assertTrue(authorization.canWrite(request, "7"));
        when(permissions.getAllPermissionModulesByAgentId(3)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> authorization.requireWrite(request, "7"));
    }

    @Test
    public void anotherActorCannotUseCurrentSessionGrants() {
        grant("SampleEdit:readwrite", "Y", "Y");
        assertFalse(authorization.canWrite(request, "8"));
        verifyZeroInteractions(users, userModules);
    }

    @Test
    public void nonexistentOrInactiveAccountIsDeniedBeforeModuleLookup() {
        when(users.getMatch("id", "7")).thenReturn(Optional.empty());
        assertFalse(authorization.canWrite(request, "7"));
        when(users.getMatch("id", "7")).thenReturn(Optional.of(currentUser));
        currentUser.setIsActive("N");
        assertFalse(authorization.canWrite(request, "7"));
        verifyZeroInteractions(userModules, roles, permissions);
    }

    @Test
    public void principalMismatchCannotBorrowPersistedActorPermissions() {
        currentUser.setLoginName("another-user");
        assertFalse(authorization.canWrite(request, "7"));
        verifyZeroInteractions(userModules, roles, permissions);
    }

    @Test
    public void missingAuthenticationIsDeniedBeforeDataLookup() {
        SecurityContextHolder.clearContext();
        assertFalse(authorization.canWrite(request, "7"));
        verifyZeroInteractions(users, userModules, roles, permissions);
    }

    @Test
    public void anonymousAuthenticationIsNotAnInteractiveOperator() {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new AnonymousAuthenticationToken("key", "anonymous",
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        SecurityContextHolder.setContext(context);
        assertFalse(authorization.canWrite(request, "7"));
        verifyZeroInteractions(users, userModules, roles, permissions);
    }

    @Test
    public void unknownPermissionModeFailsClosed() {
        when(properties.getPropertyValue("permissions.agent")).thenReturn("unknown");
        assertFalse(authorization.canWrite(request, "7"));
    }

    @Test
    public void malformedActorIdFailsClosedWithoutDatabaseQuery() {
        for (String actor : new String[] { null, "", "0", "bad", "-1" }) {
            assertFalse(authorization.canWrite(request, actor));
        }
        verifyZeroInteractions(users, userModules, roles, permissions);
    }

    private void grant(String name, String select, String update) {
        PermissionModule grant = module(name, select, update);
        when(permissions.getAllPermissionModulesByAgentId(3)).thenReturn(List.of(grant));
    }

    private PermissionModule module(String name, String select, String update) {
        PermissionModule module = mock(PermissionModule.class);
        SystemModule definition = new SystemModule();
        definition.setSystemModuleName(name);
        when(module.getSystemModule()).thenReturn(definition);
        when(module.getHasSelect()).thenReturn(select);
        when(module.getHasUpdate()).thenReturn(update);
        return module;
    }
}
