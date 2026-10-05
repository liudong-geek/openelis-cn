package org.openelisglobal.dataexchange.service.order;

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
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemmodule.valueholder.SystemModuleParam;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;

public class ElectronicOrderQueryAuthorizationServiceTest {
    private Object factoryBefore;
    private SecurityContext contextBefore;
    private DefaultConfigurationProperties properties;
    private UserModuleService admins;
    private UserRoleService roles;
    private PermissionModuleService<PermissionModule> grants;
    private SystemUserService users;
    private SystemModuleUrlService urls;
    private ElectronicOrderQueryAuthorizationService auth;
    private MockHttpServletRequest request;
    private SystemUser current;
    private SystemModule module;
    private SystemModuleUrl mapping;
    private PermissionModule grant;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() {
        factoryBefore = ReflectionTestUtils.getField(SpringContext.class, "factory");
        contextBefore = SecurityContextHolder.getContext();
        var factory = mock(AutowireCapableBeanFactory.class);
        properties = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        when(properties.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        admins = mock(UserModuleService.class);
        roles = mock(UserRoleService.class);
        grants = mock(PermissionModuleService.class);
        users = mock(SystemUserService.class);
        urls = mock(SystemModuleUrlService.class);
        auth = new ElectronicOrderQueryAuthorizationService(admins, roles, grants, users, urls);
        request = new MockHttpServletRequest();
        var actor = new UserSessionData();
        actor.setSytemUserId(7);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken("reader", null, List.of()));
        SecurityContextHolder.setContext(context);
        request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        current = new SystemUser();
        current.setId("7");
        current.setLoginName("reader");
        current.setIsActive("Y");
        when(users.getMatch("id", "7")).thenReturn(Optional.of(current));
        module = new SystemModule();
        module.setId("1522");
        module.setSystemModuleName("ElectronicOrderView");
        module.setHasSelectFlag("Y");
        mapping = new SystemModuleUrl();
        mapping.setUrlPath("/ElectronicOrders");
        mapping.setSystemModule(module);
        when(urls.getByUrlPath("/ElectronicOrders")).thenReturn(List.of(mapping));
        grant = new org.openelisglobal.systemusermodule.valueholder.RoleModule();
        grant.setSystemModule(module);
        grant.setHasSelect("Y");
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("3"));
        when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of(grant));
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", factoryBefore);
        SecurityContextHolder.setContext(contextBefore);
    }

    @Test
    public void liveMappedSelectAllowsCurrentActor() {
        assertEquals("7", auth.requireRead(request));
        verify(grants).getAllPermissionModulesByAgentId(3);
    }

    @Test public void unmappedUrlFailsEvenForAdministrator(){when(admins.isUserAdmin(request)).thenReturn(true);when(urls.getByUrlPath("/ElectronicOrders")).thenReturn(List.of());assertThrows(AccessDeniedException.class,()->auth.requireRead(request));}

    @Test
    public void cachedPermittedPagesCannotReplaceCurrentGrant() {
        request.getSession().setAttribute(IActionConstants.PERMITTED_ACTIONS_MAP,
                new HashSet<>(List.of("ElectronicOrderView")));
        grant.setHasSelect("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
    }

    @Test
    public void disabledMappingSelectFlagFails() {
        module.setHasSelectFlag("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
    }

    @Test
    public void grantForDifferentModuleNeverMatches() {
        var unrelated = new SystemModule();
        unrelated.setId("46");
        unrelated.setSystemModuleName("SamplePatientEntry");
        grant.setSystemModule(unrelated);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
    }

    @Test
    public void mappingParameterMustMatchCurrentRequest() {
        var param = new SystemModuleParam();
        param.setName("scope");
        param.setValue("read");
        mapping.setParam(param);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
        request.addParameter("scope", "read");
        assertEquals("7", auth.requireRead(request));
    }

    @Test public void userModeUsesUserGrantAssociation(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(grant));assertEquals("7",auth.requireRead(request));verifyZeroInteractions(roles);}

    @Test
    public void inactiveAndMismatchedPrincipalFailBeforePermissions() {
        current.setIsActive("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
        verifyZeroInteractions(urls, roles, grants);
    }

    @Test
    public void missingAndMismatchedSessionContextFail() {
        request.getSession().removeAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
        verifyZeroInteractions(users, urls, grants);
    }

    @Test
    public void currentGrantRevocationAppliesWithoutNewSession() {
        assertEquals("7", auth.requireRead(request));
        when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request));
    }
}
