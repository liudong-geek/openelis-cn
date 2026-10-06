package org.openelisglobal.workplan;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemmodule.valueholder.SystemModuleParam;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.openelisglobal.workplan.service.*;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;

public class WorkplanQueryAuthorizationServiceTest {
    private Object factoryBefore;
    private SecurityContext contextBefore;
    private DefaultConfigurationProperties properties;
    private UserService scope;
    private RoleService roleDefinitions;
    private TestService testDefinitions;
    private TestSectionService sections;
    private Role moduleRole;
    private Role resultsRole;
    private TestSection liveUnit;
    private UserModuleService admins;
    private UserRoleService roles;
    private PermissionModuleService<PermissionModule> grants;
    private SystemUserService users;
    private SystemModuleUrlService urls;
    private WorkplanQueryAuthorizationServiceImpl auth;
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
        scope = mock(UserService.class);
        roleDefinitions = mock(RoleService.class);
        testDefinitions = mock(TestService.class);
        sections = mock(TestSectionService.class);
        moduleRole = new Role();
        moduleRole.setId("3");
        moduleRole.setActive(true);
        when(roleDefinitions.get("3")).thenReturn(moduleRole);
        resultsRole = new Role();
        resultsRole.setId("4");
        resultsRole.setActive(true);
        when(roleDefinitions.getRoleByName("Results")).thenReturn(resultsRole);
        liveUnit = new TestSection();
        liveUnit.setId("61");
        liveUnit.setIsActive("Y");
        when(sections.get("61")).thenReturn(liveUnit);
        for (String id : List.of("1", "2")) {
            var test = new org.openelisglobal.test.valueholder.Test();
            test.setId(id);
            test.setIsActive("Y");
            test.setTestSection(liveUnit);
            when(testDefinitions.get(id)).thenReturn(test);
        }
        auth = new WorkplanQueryAuthorizationServiceImpl(admins, roles, grants, users, urls, scope, roleDefinitions,
                testDefinitions, sections);
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
        module.setSystemModuleName("Workplan:test");
        module.setHasSelectFlag("Y");
        mapping = new SystemModuleUrl();
        mapping.setUrlPath("/WorkPlanByTest");
        mapping.setSystemModule(module);
        when(urls.getByUrlPath("/WorkPlanByTest")).thenReturn(List.of(mapping));
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
        assertEquals("7", auth.requireRead(request, "test"));
        verify(grants).getAllPermissionModulesByAgentId(3);
    }

    @Test public void unmappedUrlFailsEvenForAdministrator(){when(admins.isUserAdmin(request)).thenReturn(true);when(urls.getByUrlPath("/WorkPlanByTest")).thenReturn(List.of());assertThrows(AccessDeniedException.class,()->auth.requireRead(request,"test"));}

    @Test
    public void cachedPermittedPagesCannotReplaceCurrentGrant() {
        request.getSession().setAttribute(IActionConstants.PERMITTED_ACTIONS_MAP,
                new HashSet<>(List.of("Workplan:test")));
        grant.setHasSelect("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }

    @Test
    public void disabledMappingSelectFlagFails() {
        module.setHasSelectFlag("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }

    @Test
    public void grantForDifferentModuleNeverMatches() {
        var unrelated = new SystemModule();
        unrelated.setId("46");
        unrelated.setSystemModuleName("SamplePatientEntry");
        grant.setSystemModule(unrelated);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }

    @Test
    public void mappingParameterUsesValidatedModeIncludingPrintBody() {
        var param = new SystemModuleParam();
        param.setName("type");
        param.setValue("panel");
        mapping.setParam(param);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
        param.setValue("test");
        assertEquals("7", auth.requireRead(request, "test"));
        when(urls.getByUrlPath("/PrintWorkplanReport")).thenReturn(List.of(mapping));
        assertTrue(auth.canPrint(request, "7", "test"));
        param.setValue("panel");
        assertFalse(auth.canPrint(request, "7", "test"));
    }

    @Test
    public void printingNeedsItsOwnCurrentMapping() {
        assertFalse(auth.canPrint(request, "7", "test"));
        when(urls.getByUrlPath("/PrintWorkplanReport")).thenReturn(List.of(mapping));
        assertTrue(auth.canPrint(request, "7", "test"));
        grant.setHasSelect("N");
        assertFalse(auth.canPrint(request, "7", "test"));
    }

    @Test public void professionalScopeReadsCurrentResultsAssignment(){when(scope.getTestIdsForLabUnitRole("7","Results")).thenReturn(Set.of("1","2"));assertEquals(Set.of("1","2"),auth.allowedTestIds("7"));when(scope.getTestIdsForLabUnitRole("7","Results")).thenReturn(Set.of());assertTrue(auth.allowedTestIds("7").isEmpty());verify(scope,times(2)).getTestIdsForLabUnitRole("7","Results");}

    @Test public void userModeUsesUserGrantAssociation(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(grant));assertEquals("7",auth.requireRead(request,"test"));verifyZeroInteractions(roles);}

    @Test
    public void inactiveAndMismatchedPrincipalFailBeforePermissions() {
        current.setIsActive("N");
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
        verifyZeroInteractions(urls, roles, grants);
    }

    @Test
    public void missingAndMismatchedSessionContextFail() {
        request.getSession().removeAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
        verifyZeroInteractions(users, urls, grants);
    }

    @Test
    public void currentGrantRevocationAppliesWithoutNewSession() {
        assertEquals("7", auth.requireRead(request, "test"));
        when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }

    @Test
    public void inactiveGrantingRoleCannotUseCachedModulePermission() {
        assertEquals("7", auth.requireRead(request, "test"));
        moduleRole.setActive(false);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }

 @Test public void inactiveResultsRoleIsForbiddenAndInactiveUnitLeavesNoScope(){when(scope.getTestIdsForLabUnitRole("7","Results")).thenReturn(Set.of("1"));assertEquals(Set.of("1"),auth.allowedTestIds("7"));liveUnit.setIsActive("N");assertTrue(auth.allowedTestIds("7").isEmpty());resultsRole.setActive(false);assertThrows(AccessDeniedException.class,()->auth.allowedTestIds("7"));}

    @Test
    public void administratorBypassAlsoNeedsCurrentActiveAssignedBuiltInRole() {
        var admin = new Role();
        admin.setId("3");
        admin.setActive(true);
        when(roleDefinitions.getRoleByName("Global Administrator")).thenReturn(admin);
        when(admins.isUserAdmin(request)).thenReturn(true);
        assertEquals("7", auth.requireRead(request, "test"));
        admin.setActive(false);
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
        admin.setActive(true);
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> auth.requireRead(request, "test"));
    }
}
