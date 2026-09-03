package org.openelisglobal.systemuser.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.userrole.service.UserRoleService;
import org.openelisglobal.userrole.valueholder.LabUnitRoleMap;
import org.openelisglobal.userrole.valueholder.UserLabUnitRoles;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public class UserServiceImplUnitTest {

    private TestableUserServiceImpl service;
    private UserServiceImpl actualService;
    private UserRoleService userRoleService;
    private RoleService roleService;
    private TestSectionService testSectionService;
    private DisplayListService displayListService;
    private DisplayListService previousDisplayListService;
    private AutowireCapableBeanFactory previousSpringFactory;

    @Before
    public void setUp() {
        service = new TestableUserServiceImpl();
        userRoleService = mock(UserRoleService.class);
        roleService = mock(RoleService.class);
        testSectionService = mock(TestSectionService.class);
        ReflectionTestUtils.setField(service, "userRoleService", userRoleService);
        ReflectionTestUtils.setField(service, "roleService", roleService);
        ReflectionTestUtils.setField(service, "testSectionService", testSectionService);

        actualService = new UserServiceImpl();
        ReflectionTestUtils.setField(actualService, "userRoleService", userRoleService);
        ReflectionTestUtils.setField(actualService, "roleService", roleService);
        ReflectionTestUtils.setField(actualService, "testSectionService", testSectionService);
        ReflectionTestUtils.setField(actualService, "session", mock(HttpSession.class));

        Role reportsRole = new Role();
        reportsRole.setId("77");
        when(roleService.getRoleByName("Reports")).thenReturn(reportsRole);

        Role adminRole = new Role();
        adminRole.setId("1");
        when(roleService.getRoleByName(Constants.ROLE_GLOBAL_ADMIN)).thenReturn(adminRole);
        when(userRoleService.getRoleIdsForUser("7")).thenReturn(List.of());

        previousDisplayListService = (DisplayListService) ReflectionTestUtils.getField(DisplayListService.class,
                "instance");
        displayListService = mock(DisplayListService.class);
        ReflectionTestUtils.setField(DisplayListService.class, "instance", displayListService);

        previousSpringFactory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class,
                "factory");
        AutowireCapableBeanFactory springFactory = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties configurationProperties = mock(DefaultConfigurationProperties.class);
        when(configurationProperties.getPropertyValue(Property.REQUIRE_LAB_UNIT_AT_LOGIN)).thenReturn("false");
        when(springFactory.getBean(DefaultConfigurationProperties.class)).thenReturn(configurationProperties);
        ReflectionTestUtils.setField(SpringContext.class, "factory", springFactory);

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpSession requestSession = mock(HttpSession.class);
        SecurityContext securityContext = mock(SecurityContext.class);
        Authentication authentication = mock(Authentication.class);
        UserDetails principal = mock(UserDetails.class);
        when(request.getSession()).thenReturn(requestSession);
        when(requestSession.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY))
                .thenReturn(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(principal);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        LocaleContextHolder.resetLocaleContext();
        ReflectionTestUtils.setField(DisplayListService.class, "instance", previousDisplayListService);
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousSpringFactory);
    }

    @Test
    public void allLabUnitsUsesChineseLabelsWithoutMutatingCachedAuthorizationList() {
        List<IdValuePair> cachedSections = List.of(new IdValuePair("301", "Biochemistry"),
                new IdValuePair("302", "Hematology"));
        when(displayListService.getList(ListType.TEST_SECTION_ACTIVE)).thenReturn(cachedSections);
        when(userRoleService.getUserLabUnitRoles("7"))
                .thenReturn(labUnitRoles("AllLabUnits", Set.of("77")));
        mockLocalizedSection("301", "Biochemistry", "生物化学");
        mockLocalizedSection("302", "Hematology", "血液学");
        LocaleContextHolder.setLocale(Locale.CHINESE);

        List<IdValuePair> sections = actualService.getUserTestSections("7", "77");

        assertEquals(List.of("301", "302"), sections.stream().map(IdValuePair::getId).toList());
        assertEquals(List.of("生物化学", "血液学"), sections.stream().map(IdValuePair::getValue).toList());
        assertEquals("Biochemistry", cachedSections.get(0).getValue());
        assertNotSame(cachedSections.get(0), sections.get(0));
    }

    @Test
    public void authorizedSectionFilterRunsBeforeSimplifiedChineseDisplayLocalization() {
        when(displayListService.getList(ListType.TEST_SECTION_ACTIVE)).thenReturn(List.of(
                new IdValuePair("301", "Biochemistry"), new IdValuePair("302", "Hematology")));
        when(userRoleService.getUserLabUnitRoles("7")).thenReturn(labUnitRoles("302", Set.of("77")));
        mockLocalizedSection("301", "Biochemistry", "生物化学");
        mockLocalizedSection("302", "Hematology", "血液学");
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);

        List<IdValuePair> sections = actualService.getUserTestSections("7", "77");

        assertEquals(1, sections.size());
        assertEquals("302", sections.get(0).getId());
        assertEquals("血液学", sections.get(0).getValue());
    }

    @Test
    public void englishLocaleKeepsEnglishSectionLabels() {
        when(displayListService.getList(ListType.TEST_SECTION_ACTIVE))
                .thenReturn(List.of(new IdValuePair("301", "Stale cached label")));
        when(userRoleService.getUserLabUnitRoles("7")).thenReturn(labUnitRoles("301", Set.of("77")));
        mockLocalizedSection("301", "Biochemistry", "生物化学");
        LocaleContextHolder.setLocale(Locale.ENGLISH);

        List<IdValuePair> sections = actualService.getUserTestSections("7", "77");

        assertEquals("301", sections.get(0).getId());
        assertEquals("Biochemistry", sections.get(0).getValue());
    }

    @Test
    public void missingLocalizedSectionNameFallsBackToAuthorizedCachedLabel() {
        when(displayListService.getList(ListType.TEST_SECTION_ACTIVE))
                .thenReturn(List.of(new IdValuePair("301", "Biochemistry")));
        when(userRoleService.getUserLabUnitRoles("7")).thenReturn(labUnitRoles("301", Set.of("77")));
        TestSection section = mock(TestSection.class);
        when(section.getId()).thenReturn("301");
        when(section.getLocalizedName()).thenReturn(" ");
        when(testSectionService.getTestSectionById("301")).thenReturn(section);
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);

        List<IdValuePair> sections = actualService.getUserTestSections("7", "77");

        assertEquals("301", sections.get(0).getId());
        assertEquals("Biochemistry", sections.get(0).getValue());
    }

    @Test
    public void loginLabUnitIsRejectedWhenItDoesNotHaveRequestedReportsRole() {
        when(userRoleService.getUserLabUnitRoles("7"))
                .thenReturn(labUnitRoles("302", Set.of("88")));

        assertTrue(service.restrictLoginTestSectionToRequestedRole("7", "77", testSection("302")).isEmpty());
    }

    @Test
    public void loginLabUnitIsReturnedWhenItHasRequestedReportsRole() {
        when(userRoleService.getUserLabUnitRoles("7"))
                .thenReturn(labUnitRoles("302", Set.of("77", "88")));

        assertEquals("302",
                service.restrictLoginTestSectionToRequestedRole("7", "77", testSection("302")).get(0).getId());
    }

    @Test
    public void loginLabUnitFailsClosedWhenRoleMapIsMissing() {
        when(userRoleService.getUserLabUnitRoles("7")).thenReturn(null);

        assertTrue(service.restrictLoginTestSectionToRequestedRole("7", "77", testSection("302")).isEmpty());
    }

    @Test
    public void allLabUnitsReportsRoleAuthorizesTheCurrentLoginSection() {
        when(userRoleService.getUserLabUnitRoles("7"))
                .thenReturn(labUnitRoles("AllLabUnits", Set.of("77")));

        assertEquals("302",
                service.restrictLoginTestSectionToRequestedRole("7", "77", testSection("302")).get(0).getId());
    }

    @Test
    public void requiredLoginScopeFailsClosedWhenSessionDataIsMissing() {
        assertTrue(service.restrictRequiredLoginTestSection("7", "77", null).isEmpty());
    }

    @Test
    public void requiredLoginScopeFailsClosedWhenNoLabUnitWasSelected() {
        UserSessionData userSessionData = new UserSessionData();
        userSessionData.setLoginLabUnit(0);

        assertTrue(service.restrictRequiredLoginTestSection("7", "77", userSessionData).isEmpty());
    }

    @Test
    public void requiredLoginScopeFailsClosedWhenSelectedLabUnitNoLongerExists() {
        UserSessionData userSessionData = new UserSessionData();
        userSessionData.setLoginLabUnit(302);
        when(testSectionService.getTestSectionById("302")).thenReturn(null);

        assertTrue(service.restrictRequiredLoginTestSection("7", "77", userSessionData).isEmpty());
    }

    @Test
    public void analysisFilterRejectsDefaultSectionMatchWhenActualSectionIsUnauthorized() {
        service.setAuthorizedSections("301");
        Analysis analysis = analysisWithDefaultAndActualSection("301", "302");

        assertTrue(service.filterAnalysesByLabUnitRoles("7", List.of(analysis), "Reports").isEmpty());
    }

    @Test
    public void analysisFilterUsesActualSectionEvenWhenTestDefaultSectionDiffers() {
        service.setAuthorizedSections("302");
        Analysis analysis = analysisWithDefaultAndActualSection("301", "302");

        assertEquals(List.of(analysis), service.filterAnalysesByLabUnitRoles("7", List.of(analysis), "Reports"));
    }

    @Test
    public void analysisFilterFailsClosedWhenActualSectionIsMissing() {
        service.setAuthorizedSections("301");
        Analysis analysis = analysisWithDefaultAndActualSection("301", null);

        assertTrue(service.filterAnalysesByLabUnitRoles("7", List.of(analysis), "Reports").isEmpty());
    }

    private UserLabUnitRoles labUnitRoles(String labUnitId, Set<String> roleIds) {
        LabUnitRoleMap map = new LabUnitRoleMap();
        map.setLabUnit(labUnitId);
        map.setRoles(roleIds);
        UserLabUnitRoles roles = new UserLabUnitRoles();
        roles.setLabUnitRoleMap(Set.of(map));
        return roles;
    }

    private TestSection testSection(String id) {
        TestSection section = mock(TestSection.class);
        when(section.getId()).thenReturn(id);
        when(section.getLocalizedName()).thenReturn("Section " + id);
        return section;
    }

    private void mockLocalizedSection(String id, String englishName, String chineseName) {
        TestSection section = mock(TestSection.class);
        when(section.getId()).thenReturn(id);
        when(section.getLocalizedName()).thenAnswer(invocation -> LocaleContextHolder.getLocale().getLanguage()
                .equals(Locale.CHINESE.getLanguage()) ? chineseName : englishName);
        when(testSectionService.getTestSectionById(id)).thenReturn(section);
    }

    private Analysis analysisWithDefaultAndActualSection(String defaultSectionId, String actualSectionId) {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setTestSection(testSection(defaultSectionId));
        Analysis analysis = new Analysis();
        analysis.setTest(test);
        analysis.setTestSection(actualSectionId == null ? null : testSection(actualSectionId));
        return analysis;
    }

    private static class TestableUserServiceImpl extends UserServiceImpl {
        private List<IdValuePair> authorizedSections = List.of();

        void setAuthorizedSections(String... sectionIds) {
            authorizedSections = java.util.Arrays.stream(sectionIds).map(id -> new IdValuePair(id, "Section " + id))
                    .collect(java.util.stream.Collectors.toList());
        }

        @Override
        public List<IdValuePair> getUserTestSections(String systemUserId, String roleId) {
            return authorizedSections;
        }
    }
}
