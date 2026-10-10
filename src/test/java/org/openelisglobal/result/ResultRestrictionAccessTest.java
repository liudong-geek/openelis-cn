package org.openelisglobal.result;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.*;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.openelisglobal.result.service.*;
import org.openelisglobal.result.service.ResultRestrictionAccess.*;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.*;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.*;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class ResultRestrictionAccessTest {
    private Object factoryBefore;
    private DefaultConfigurationProperties properties;
    private ResultRestrictionActorGuard actors;
    private RoleService definitions;
    private UserRoleService bindings;
    private SystemModuleUrlService urls;
    private PermissionModuleService<PermissionModule> grants;
    private UserService users;
    private TestSectionService sections;
    private ResultRestrictionDAO dao;
    private ResultRestrictionAccess access;
    private MockHttpServletRequest request;
    private Role role;
    private SystemModule module;
    private SystemModuleUrl mapping;
    private RoleModule grant;
    private TestSection section;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() throws Exception {
        factoryBefore = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        properties = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        when(properties.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        actors = mock(ResultRestrictionActorGuard.class);
        definitions = mock(RoleService.class);
        bindings = mock(UserRoleService.class);
        urls = mock(SystemModuleUrlService.class);
        grants = mock(PermissionModuleService.class);
        users = mock(UserService.class);
        sections = mock(TestSectionService.class);
        dao = mock(ResultRestrictionDAO.class);
        access = new ResultRestrictionAccess(new ResultRestrictionPermissionReader(actors, definitions, bindings, urls,
                grants, users, sections, dao), dao);
        request = new MockHttpServletRequest();
        var auth = new UsernamePasswordAuthenticationToken(
                User.withUsername("operator7").password("unused").roles("RESULTS", "VALIDATION", "REPORTS", "RECEPTION")
                        .build(),
                null, List.of(new SimpleGrantedAuthority("ROLE_RESULTS"), new SimpleGrantedAuthority("ROLE_VALIDATION"),
                        new SimpleGrantedAuthority("ROLE_REPORTS"), new SimpleGrantedAuthority("ROLE_RECEPTION")));
        SecurityContextHolder.getContext().setAuthentication(auth);
        var ctor = ResultRestrictionActorGuard.BoundActor.class.getDeclaredConstructors()[0];
        ctor.setAccessible(true);
        var actor = (ResultRestrictionActorGuard.BoundActor) ctor.newInstance(auth, auth.getPrincipal(), "operator7",
                "7", request.getSession(), 0, Set.of("ROLE_RESULTS"));
        when(actors.readBinding(request)).thenReturn(actor);
        role = new Role();
        role.setId("5");
        role.setName("Results");
        role.setActive(true);
        when(definitions.getRoleByName("Results")).thenReturn(role);
        when(definitions.get("5")).thenReturn(role);
        when(bindings.getRoleIdsForUser("7")).thenReturn(List.of("5"));
        module = new SystemModule();
        module.setId("45");
        module.setSystemModuleName("LogbookResults");
        module.setHasSelectFlag("Y");
        module.setHasUpdateFlag("Y");
        mapping = new SystemModuleUrl();
        mapping.setId("13");
        mapping.setUrlPath("/LogbookResults");
        mapping.setSystemModule(module);
        when(urls.getByUrlPath("/LogbookResults")).thenReturn(List.of(mapping));
        grant = new RoleModule();
        grant.setRoleId("5");
        grant.setRole(role);
        grant.setSystemModule(module);
        grant.setHasSelect("Y");
        grant.setHasUpdate("Y");
        when(grants.getAllPermissionModulesByAgentId(5)).thenReturn(List.of(grant));
        section = new TestSection();
        section.setId("8");
        section.setIsActive("Y");
        when(sections.get("8")).thenReturn(section);
        when(users.getUserTestSections("7", "5")).thenReturn(List.of(new IdValuePair("8", "Real section")));
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @After
    public void restore() {
        TransactionSynchronizationManager.clear();
        SecurityContextHolder.clearContext();
        ReflectionTestUtils.setField(SpringContext.class, "factory", factoryBefore);
    }

    @Test
    public void actualMappedGrantAndCurrentScopePermitRead() {
        var scope = access.bind(request, Phase.RESULTS, Action.SELECT);
        assertEquals(Set.of("8"), scope.sectionIds());
        verify(dao).refresh(mapping);
        verify(dao, atLeastOnce()).refresh(module);
        verify(actors).readBinding(request);
    }

    @Test
    public void sessionRoleTextCannotReplaceRevokedGrant() {
        var before = access.bind(request, Phase.RESULTS, Action.SELECT);
        grant.setHasSelect("N");
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, before));
    }

    @Test
    public void inactiveRoleAndRemovedBindingAreDenied() {
        role.setActive(false);
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
        role.setActive(true);
        when(bindings.getRoleIdsForUser("7")).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
    }

    @Test
    public void moduleFlagDoesNotGrantConfiguredUpdate() {
        grant.setHasUpdate("N");
        assertNotNull(access.bind(request, Phase.RESULTS, Action.SELECT));
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.UPDATE));
    }

    @Test
    public void legacyNoFlagValidationUsesActualMembership() {
        role.setName("Validation");
        when(definitions.getRoleByName("Validation")).thenReturn(role);
        module.setSystemModuleName("ResultsValidationGeneral");
        module.setHasSelectFlag(null);
        module.setHasUpdateFlag(null);
        mapping.setUrlPath("/AccessionValidation");
        when(urls.getByUrlPath("/AccessionValidation")).thenReturn(List.of(mapping));
        grant.setHasSelect(null);
        grant.setHasUpdate(null);
        assertNotNull(access.bind(request, Phase.VALIDATION, Action.UPDATE));
        when(grants.getAllPermissionModulesByAgentId(5)).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.VALIDATION, Action.UPDATE));
    }

 @Test public void userModeUsesActualCurrentUserGrant(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");var userGrant=new SystemUserModule();userGrant.setSystemUserId("7");var actualUser=new org.openelisglobal.systemuser.valueholder.SystemUser();actualUser.setId("7");userGrant.setSystemUser(actualUser);userGrant.setSystemModule(module);userGrant.setHasSelect("Y");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(userGrant));assertNotNull(access.bind(request,Phase.RESULTS,Action.SELECT));userGrant.setHasSelect("N");assertThrows(AccessDeniedException.class,()->access.bind(request,Phase.RESULTS,Action.SELECT));}

    @Test
    public void scopeLossAndInactiveUnitInvalidateSameActor() {
        var before = access.bind(request, Phase.RESULTS, Action.SELECT);
        when(users.getUserTestSections("7", "5")).thenReturn(List.of());
        assertThrows(AccessDeniedException.class, () -> access.requireUnchanged(request, before));
        when(users.getUserTestSections("7", "5")).thenReturn(List.of(new IdValuePair("8", "Real section")));
        section.setIsActive("N");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
    }

    @Test
    public void remappedUrlOrModuleAndConditionalMappingCannotAutoAllow() {
        mapping.setUrlPath("/Results");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
        mapping.setUrlPath("/LogbookResults");
        module.setSystemModuleName("Other");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
        module.setSystemModuleName("LogbookResults");
        var param = new SystemModuleParam();
        param.setName("testSection");
        param.setValue("8");
        mapping.setParam(param);
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
    }

    @Test
    public void reportAuthorizationUsesRealPatientTypeMapping() {
        role.setName("Reports");
        when(definitions.getRoleByName("Reports")).thenReturn(role);
        module.setSystemModuleName("Report:patient");
        mapping.setUrlPath("/ReportPrint");
        var p = new SystemModuleParam();
        p.setId("29");
        p.setName("type");
        p.setValue("patient");
        mapping.setParam(p);
        when(urls.getByUrlPath("/ReportPrint")).thenReturn(List.of(mapping));
        assertNotNull(access.bind(request, Phase.REPORTS, Action.UPDATE));
        p.setValue("other");
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.REPORTS, Action.UPDATE));
    }

 @Test public void userModeNFlagNeverInheritsRoleMembership(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");var userGrant=new SystemUserModule();userGrant.setSystemUserId("7");var actualUser=new org.openelisglobal.systemuser.valueholder.SystemUser();actualUser.setId("7");userGrant.setSystemUser(actualUser);userGrant.setSystemModule(module);userGrant.setHasSelect("Y");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(userGrant));module.setHasSelectFlag("N");assertThrows(AccessDeniedException.class,()->access.bind(request,Phase.RESULTS,Action.SELECT));module.setHasSelectFlag(null);assertThrows(AccessDeniedException.class,()->access.bind(request,Phase.RESULTS,Action.SELECT));}

 @Test public void labOnlyMappingNeverBecomesGlobalPhaseRole(){when(bindings.getRoleIdsForUser("7")).thenReturn(List.of());assertThrows(AccessDeniedException.class,()->access.bind(request,Phase.RESULTS,Action.SELECT));verify(users,never()).getUserTestSections(anyString(),anyString());}

    @Test
    public void typedWriteActorAndCurrentAnalysisScopeCannotBeSpoofed() {
        assertThrows(AccessDeniedException.class,
                () -> access.bindForActor(request, Phase.RESULTS, Action.UPDATE, "99"));
        var scope = access.bindForActor(request, Phase.RESULTS, Action.UPDATE, "7");
        var ts = java.sql.Timestamp.valueOf("2026-10-06 10:00:00");
        var own = new ResultRestrictionDAO.AnalysisFacts("1", "3", "8", "2", "4", "RAW-4", ts, ts, ts, "10", "12",
                false, false, null, null, "9");
        when(dao.findAnalysis("1")).thenReturn(java.util.Optional.of(own));
        access.requireAnalysisIds(scope, List.of("1"));
        var outside = new ResultRestrictionDAO.AnalysisFacts("1", "3", "99", "2", "4", "RAW-4", ts, ts, ts, "10", "12",
                false, false, null, null, "9");
        when(dao.findAnalysis("1")).thenReturn(java.util.Optional.of(outside));
        assertThrows(AccessDeniedException.class, () -> access.requireAnalysisIds(scope, List.of("1")));
    }

 @Test public void userSelectOnlyReceptionCannotAcquireTypedUpdate(){when(properties.getPropertyValue("permissions.agent")).thenReturn("USER");role.setName("Reception");when(definitions.getRoleByName("Reception")).thenReturn(role);module.setSystemModuleName("SamplePatientEntry");mapping.setUrlPath("/SamplePatientEntry");when(urls.getByUrlPath("/SamplePatientEntry")).thenReturn(List.of(mapping));var userGrant=new SystemUserModule();var actual=new org.openelisglobal.systemuser.valueholder.SystemUser();actual.setId("7");userGrant.setSystemUser(actual);userGrant.setSystemModule(module);userGrant.setHasSelect("Y");userGrant.setHasUpdate("N");when(grants.getAllMatching("systemUser.id","7")).thenReturn(List.of(userGrant));assertNotNull(access.bindForActor(request,Phase.RECEPTION,Action.SELECT,"7"));assertThrows(AccessDeniedException.class,()->access.bindForActor(request,Phase.RECEPTION,Action.UPDATE,"7"));}

    @Test
    public void movedGrantCannotAuthorizeItsOldAgent() {
        var otherRole = new Role();
        otherRole.setId("99");
        grant.setRole(otherRole);
        assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
    }
}
