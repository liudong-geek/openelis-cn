package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.service.NceActorGuard;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Action;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.systemusermodule.valueholder.RoleModule;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public class NceWorkspaceAccessTest {
    private Object beforeFactory;
    private DefaultConfigurationProperties properties;
    private NceWorkspaceDAO dao;
    private NceWorkspaceAccess access;
    private MockHttpServletRequest request;
    private Role role;
    private RoleModule grant;
    private SystemModule module;
    private SystemModuleUrl mapping;
    private UserRoleService roles;
    private PermissionModuleService<PermissionModule> grants;
    private UserService units;
    private SystemUser user;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() {
        beforeFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        properties = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        when(properties.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        dao = mock(NceWorkspaceDAO.class);
        var actorGuard = new NceActorGuard();
        var users = mock(SystemUserService.class);
        var accounts = mock(LoginUserService.class);
        ReflectionTestUtils.setField(actorGuard, "systemUserService", users);
        ReflectionTestUtils.setField(actorGuard, "loginUserService", accounts);
        ReflectionTestUtils.setField(actorGuard, "dao", dao);
        user = new SystemUser();
        user.setId("7");
        user.setLoginName("operator7");
        user.setIsActive("Y");
        when(users.getMatch("loginName", "operator7")).thenReturn(Optional.of(user));
        var account = new LoginUser();
        account.setLoginName("operator7");
        account.setSystemUserId(7);
        account.setAccountDisabled("N");
        account.setAccountLocked("N");
        account.setPasswordExpiredDayNo(1);
        when(accounts.getMatch("loginName", "operator7")).thenReturn(Optional.of(account));
        request = new MockHttpServletRequest();
        var usd = new UserSessionData();
        usd.setSytemUserId(7);
        usd.setLoginName("operator7");
        usd.setLoginLabUnit(1);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, usd);
        var principal = User.withUsername("operator7").password("unused").roles("RESULTS").build();
        var auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        var context = new SecurityContextImpl(auth);
        SecurityContextHolder.setContext(context);
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", context);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        roles = mock(UserRoleService.class);
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("5"));
        var definitions = mock(RoleService.class);
        role = new Role();
        role.setId("5");
        role.setName("Results");
        role.setActive(true);
        when(definitions.get("5")).thenReturn(role);
        module = new SystemModule();
        module.setId("107");
        module.setSystemModuleName("NonConformity");
        module.setHasSelectFlag("Y");
        module.setHasAddFlag("Y");
        module.setHasUpdateFlag("Y");
        mapping = new SystemModuleUrl();
        mapping.setSystemModule(module);
        mapping.setUrlPath("/NonConformity");
        var urls = mock(SystemModuleUrlService.class);
        when(urls.getByUrlPath("/NonConformity")).thenReturn(List.of(mapping));
        grant = new RoleModule();
        grant.setSystemModule(module);
        grant.setHasSelect("Y");
        grant.setHasAdd("Y");
        grant.setHasUpdate("Y");
        grants = mock(PermissionModuleService.class);
        when(grants.getAllPermissionModulesByAgentId(5)).thenReturn(List.of(grant));
        units = mock(UserService.class);
        when(units.getUserTestSections("7", "5")).thenReturn(List.of(new IdValuePair("1", "Section")));
        var sections = mock(TestSectionService.class);
        var section = new TestSection();
        section.setId("1");
        section.setIsActive("Y");
        when(sections.get("1")).thenReturn(section);
        access = new NceWorkspaceAccess(actorGuard, roles, definitions, urls, grants, mock(UserModuleService.class),
                units, sections, dao);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void restore() {
        TransactionSynchronizationManager.clear();
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
        ReflectionTestUtils.setField(SpringContext.class, "factory", beforeFactory);
    }

    @Test
    public void actualResultsActorAndCurrentMappedGrantAreAcceptedWithoutReception() {
        var scope = access.bind(request, Action.ADD);
        assertEquals("7", scope.actor().userId());
        assertEquals(List.of("5"), scope.roleIds());
        assertEquals(java.util.Set.of("1"), scope.sectionIds());
        verify(dao, atLeastOnce()).refresh(mapping);
        verify(dao, atLeastOnce()).refresh(module);
    }

    @Test
    public void revokedSelectBlocksBothCreateAndUpdateEvenSameActorRoleText() {
        var scope = access.bind(request, Action.ADD);
        grant.setHasSelect("N");
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Action.UPDATE));
    }

    @Test
    public void inactiveGrantingRoleAndChangedActualUnitAreDenied() {
        var scope = access.bind(request, Action.SELECT);
        role.setActive(false);
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
        role.setActive(true);
        when(units.getUserTestSections("7", "5")).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
    }

    @Test
    public void liveUrlRemapAndModuleRenameCannotReuseOldGrant() {
        var scope = access.bind(request, Action.SELECT);
        var other = new SystemModule();
        other.setId("108");
        other.setSystemModuleName("NonConformity");
        other.setHasSelectFlag("Y");
        mapping.setSystemModule(other);
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
        mapping.setSystemModule(module);
        module.setSystemModuleName("Other");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Action.SELECT));
    }

    @Test public void userModeRequiresActualCurrentUserGrantAndActiveRole(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(grant));assertEquals("7",access.bind(request,Action.UPDATE).actor().userId());when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of());assertThrows(AccessDeniedException.class,()->access.bind(request,Action.UPDATE));}

    @Test
    public void accountOrSessionChangeIsRejectedBeforeCommit() {
        var scope = access.bind(request, Action.ADD);
        user.setIsActive("N");
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
        user.setIsActive("Y");
        var changed = new UserSessionData();
        changed.setSytemUserId(8);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, changed);
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, scope));
    }

    @Test
    public void updateAndAddNeedTheirOwnFlagAndBeforeCommitRechecks() {
        grant.setHasUpdate("N");
        assertFalse(access.allowed(request, access.bind(request, Action.SELECT), Action.UPDATE));
        grant.setHasAdd("N");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Action.ADD));
        grant.setHasAdd("Y");
        access.bind(request, Action.ADD);
        grant.setHasAdd("N");
        assertThrows(AccessDeniedException.class,
                () -> TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.beforeCommit(false)));
    }
}
