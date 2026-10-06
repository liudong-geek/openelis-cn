package org.openelisglobal.sample;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.http.HttpSession;
import java.util.List;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.sample.service.OrderDashboardAccess;
import org.openelisglobal.sample.service.OrderEntryActorGuard;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sample.service.SavedOrderReadAccess;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemmodule.valueholder.SystemModuleParam;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.systemusermodule.valueholder.RoleModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;

public class SavedOrderReadAccessTest {
    private Object factoryBefore;
    private DefaultConfigurationProperties properties;
    private OrderDashboardAccess dashboard;
    private RoleService definitions;
    private UserRoleService roles;
    private SystemModuleUrlService urls;
    private PermissionModuleService<PermissionModule> grants;
    private UserModuleService administrators;
    private SampleEditAuthorizationService editing;
    private SavedOrderReadAccess access;
    private MockHttpServletRequest request;
    private OrderDashboardAccess.Scope scope;
    private Role reception;
    private Role granting;
    private SystemModule module;
    private SystemModuleUrl mapping;
    private PermissionModule grant;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() throws ReflectiveOperationException {
        factoryBefore = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        properties = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        when(properties.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        dashboard = mock(OrderDashboardAccess.class);
        definitions = mock(RoleService.class);
        roles = mock(UserRoleService.class);
        urls = mock(SystemModuleUrlService.class);
        grants = mock(PermissionModuleService.class);
        administrators = mock(UserModuleService.class);
        editing = mock(SampleEditAuthorizationService.class);
        access = new SavedOrderReadAccess(dashboard, definitions, roles, urls, grants, administrators, editing);
        request = new MockHttpServletRequest();
        // Real immutable test binding; actual actor authentication is covered by
        // OrderEntryActorGuardTest.
        var constructor = OrderEntryActorGuard.BoundActor.class.getDeclaredConstructor(Authentication.class,
                Object.class, String.class, String.class, HttpSession.class, int.class, Set.class);
        constructor.setAccessible(true);
        var authentication = new UsernamePasswordAuthenticationToken("reception7", null,
                List.of(new SimpleGrantedAuthority("Reception")));
        var actor = constructor.newInstance(authentication, authentication.getPrincipal(), "reception7", "7",
                new MockHttpSession(), 1, Set.of("Reception"));
        scope = new OrderDashboardAccess.Scope(actor, List.of("1"), List.of("1"), false);
        when(dashboard.bind(request)).thenReturn(scope);
        reception = role("2");
        granting = role("3");
        when(definitions.getRoleByName("Reception")).thenReturn(reception);
        when(definitions.get("2")).thenReturn(reception);
        when(definitions.get("3")).thenReturn(granting);
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("2", "3"));
        module = new SystemModule();
        module.setId("46");
        module.setSystemModuleName("SamplePatientEntry");
        module.setHasSelectFlag("Y");
        mapping = new SystemModuleUrl();
        mapping.setSystemModule(module);
        mapping.setUrlPath("/SamplePatientEntry");
        when(urls.getByUrlPath("/SamplePatientEntry")).thenReturn(List.of(mapping));
        grant = new RoleModule();
        grant.setSystemModule(module);
        grant.setHasSelect("Y");
        when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of(grant));
    }

    private Role role(String id) {
        var role = new Role();
        role.setId(id);
        role.setActive(true);
        return role;
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", factoryBefore);
    }

    @Test
    public void currentAuthenticatedReceptionScopeAndRealMappedSelectAreRequired() {
        assertSame(scope, access.bind(request));
        verify(dashboard).bind(request);
        verify(urls).getByUrlPath("/SamplePatientEntry");
        doThrow(new AccessDeniedException("actor changed")).when(dashboard).bind(request);
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
    }

    @Test
    public void sameActorAndRoleTextCannotUseARevokedCurrentSelect() {
        assertSame(scope, access.bind(request));
        grant.setHasSelect("N");
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
        grant.setHasSelect("Y");
        module.setHasSelectFlag("N");
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
    }

    @Test
    public void inactiveReceptionOrGrantingRoleIsDeniedWithoutSessionChange() {
        granting.setActive(false);
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
        granting.setActive(true);
        reception.setActive(false);
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
    }

    @Test public void unmappedAndConditionalMappingsNeverAutoAuthorizeEvenAdministrator(){
        when(administrators.isUserAdmin(request)).thenReturn(true);when(urls.getByUrlPath("/SamplePatientEntry")).thenReturn(List.of());assertThrows(AccessDeniedException.class,()->access.bind(request));
        when(urls.getByUrlPath("/SamplePatientEntry")).thenReturn(List.of(mapping));var param=new SystemModuleParam();param.setName("mode");param.setValue("edit");mapping.setParam(param);assertThrows(AccessDeniedException.class,()->access.bind(request));
    }

    @Test
    public void currentBuiltInAdministratorMustBeActiveAndActuallyAssigned() {
        var admin = role("3");
        when(definitions.getRoleByName("Global Administrator")).thenReturn(admin);
        when(administrators.isUserAdmin(request)).thenReturn(true);
        assertSame(scope, access.bind(request));
        when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of());
        admin.setActive(false);
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
        admin.setActive(true);
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("2"));
        assertThrows(AccessDeniedException.class, () -> access.bind(request));
    }

    @Test public void userGrantModeUsesActualUserAssociationAndStillCurrentReception(){
        when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(grant));assertSame(scope,access.bind(request));
        verify(grants).getAllMatching("systemUser.id","7");when(roles.getRoleIdsForUser("7")).thenReturn(List.of("3"));assertThrows(AccessDeniedException.class,()->access.bind(request));
    }

    @Test
    public void changedScopeOrMaskIsRecheckedBeforeReturn() {
        assertSame(scope, access.bind(request));
        doThrow(new AccessDeniedException("scope changed")).when(dashboard).requireUnchanged(request, scope);
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
    }

    @Test public void modifyNeedsExistingReadAndWritePlusCurrentActiveGrant(){
        when(editing.canWrite(request,"7")).thenReturn(true);var edit=new SystemModule();edit.setId("5");edit.setSystemModuleName("SampleEdit:readwrite");var editGrant=new RoleModule();editGrant.setSystemModule(edit);when(grants.getAllPermissionModulesByAgentId(3)).thenReturn(List.of(editGrant));
        assertTrue(access.canModify(request,"7"));verify(editing).requireRead(request,"7");granting.setActive(false);assertFalse(access.canModify(request,"7"));
        granting.setActive(true);doThrow(new AccessDeniedException("not allowed")).when(editing).requireRead(request,"7");assertFalse(access.canModify(request,"7"));
    }
}
