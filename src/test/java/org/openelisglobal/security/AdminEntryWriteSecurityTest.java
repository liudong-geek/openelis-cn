package org.openelisglobal.security;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.hl7.fhir.r4.model.Questionnaire;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.fhir.service.FhirPersistanceService;
import org.openelisglobal.menu.controller.MenuController;
import org.openelisglobal.menu.service.MenuService;
import org.openelisglobal.menu.util.MenuItem;
import org.openelisglobal.menu.util.MenuUtil;
import org.openelisglobal.menu.valueholder.Menu;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.dao.NotificationSubscriptionDAO;
import org.openelisglobal.notifications.entity.Notification;
import org.openelisglobal.notifications.entity.NotificationSubscriptions;
import org.openelisglobal.notifications.rest.NotificationRestController;
import org.openelisglobal.program.controller.ProgramController;
import org.openelisglobal.program.service.ProgramService;
import org.openelisglobal.program.valueholder.Program;
import org.openelisglobal.security.login.CustomUserDetailsService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.UserRequestPostProcessor;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Real Spring MVC/method-security slice; services, persistence and transport
 * are explicitly mocked.
 */
@WebAppConfiguration
@ContextConfiguration(classes = AdminEntryWriteSecurityTest.TestConfig.class)
@TestPropertySource(properties = { "org.openelisglobal.menu.configuration.autocreate=false",
        "vapid.public.key=not-valid-base64!", "vapid.private.key=not-valid-base64!" })
public class AdminEntryWriteSecurityTest extends SecuritySliceMockMvcTest {
    @Autowired
    private MenuService menus;
    @Autowired
    private ProgramService programs;
    @Autowired
    private FhirPersistanceService fhirWrites;
    @Autowired
    private FhirUtil fhirReads;
    @Autowired
    private TestSectionService sections;
    @Autowired
    private NotificationDAO notifications;
    @Autowired
    private NotificationSubscriptionDAO subscriptions;
    @Autowired
    private SystemUserService users;
    private final DisplayListService display = mock(DisplayListService.class);
    private Object previousDisplay, previousMenuRoot;
    private MenuItem item;
    private SystemUser targetUser;

    @Before
    public void fixtures() {
        // Populate real controller read paths without building plugin menus or touching
        // config files.
        assertNotNull(webApplicationContext.getBean(SpringContext.class));
        previousDisplay = ReflectionTestUtils.getField(DisplayListService.class, "instance");
        previousMenuRoot = ReflectionTestUtils.getField(MenuUtil.class, "root");
        ReflectionTestUtils.setField(DisplayListService.class, "instance", display);
        Menu menu = new Menu();
        menu.setId("11");
        menu.setElementId("fixture_menu");
        item = new MenuItem();
        item.setMenu(menu);
        ReflectionTestUtils.setField(MenuUtil.class, "root", new ArrayList<>(List.of(item)));
        reset(menus, programs, fhirWrites, fhirReads, sections, notifications, subscriptions, users, display);
        when(menus.save(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(menus.save(any(MenuItem.class))).thenAnswer(inv -> inv.getArgument(0));
        Program read = new Program();
        read.setId("17");
        read.setProgramName("Fixture Program");
        when(programs.get("17")).thenReturn(read);
        when(programs.save(any(Program.class))).thenAnswer(inv -> inv.getArgument(0));
        targetUser = new SystemUser();
        targetUser.setId("17");
        when(users.getUserById("17")).thenReturn(targetUser);
        assertTrue(AopUtils.isAopProxy(webApplicationContext.getBean(MenuController.class)));
        assertTrue(AopUtils.isAopProxy(webApplicationContext.getBean(ProgramController.class)));
        assertTrue(AopUtils.isAopProxy(webApplicationContext.getBean(NotificationRestController.class)));
        clearInvocations(menus, programs, fhirWrites, fhirReads, sections, notifications, subscriptions, users,
                display);
    }

    @After
    public void restoreOnlyFixtureStatics() {
        ReflectionTestUtils.setField(DisplayListService.class, "instance", previousDisplay);
        ReflectionTestUtils.setField(MenuUtil.class, "root", previousMenuRoot);
    }

    private UserRequestPostProcessor actor(String actualRoleName) {
        Set<String> names = new LinkedHashSet<>();
        CustomUserDetailsService.addAuthoritiesForRole(actualRoleName, names);
        return user("security-fixture").authorities(names.stream().map(SimpleGrantedAuthority::new).toList());
    }

    private UserRequestPostProcessor globalAdmin() {
        return actor(Constants.ROLE_GLOBAL_ADMIN);
    }

    private static final String MENU = "{\"menu\":{\"id\":\"11\",\"elementId\":\"fixture_menu\"},\"childMenus\":[]}";
    private static final String PROGRAM = "{\"program\":{\"id\":\"\",\"programName\":\"Fixture Program\"}}";
    private static final String NOTICE = "{\"message\":\"public test notification fixture\"}";

    private void noBusinessCalls() {
        verifyZeroInteractions(menus, programs, fhirWrites, fhirReads, sections, notifications, subscriptions, users,
                display);
    }

    private void deniedWrites(UserRequestPostProcessor actor, int expectedStatus) throws Exception {
        for (String path : List.of("/rest/menu", "/rest/menu/fixture_menu", "/rest/program", "/rest/notification/17")) {
            String body = path.equals("/rest/menu") ? "[" + MENU + "]"
                    : path.startsWith("/rest/menu/") ? MENU : path.equals("/rest/program") ? PROGRAM : NOTICE;
            mockMvc.perform(post(path).with(actor).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().is(expectedStatus));
        }
    }

    @Test
    public void anonymousWritesAndAdminMenuGetAreDeniedWithValidCsrf() throws Exception {
        for (String path : List.of("/rest/menu", "/rest/menu/fixture_menu", "/rest/program", "/rest/notification/17")) {
            String body = path.equals("/rest/menu") ? "[" + MENU + "]"
                    : path.startsWith("/rest/menu/") ? MENU : path.equals("/rest/program") ? PROGRAM : NOTICE;
            mockMvc.perform(
                    post(path).with(anonymous()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(get("/rest/admin/menu/fixture_menu").with(anonymous())).andExpect(status().isUnauthorized());
        noBusinessCalls();
    }

    @Test
    public void ordinaryClinicalRolesCannotEnterAnyAdminWriteOrUnfilteredMenu() throws Exception {
        for (String name : List.of("Reception", "Results", "Validation")) {
            deniedWrites(actor(name), 403);
            mockMvc.perform(get("/rest/admin/menu/fixture_menu").with(actor(name))).andExpect(status().isForbidden());
        }
        noBusinessCalls();
    }

    @Test
    public void accountAdministratorHasNoGlobalAdminAliasAndCannotWrite() throws Exception {
        Set<String> aliases = new LinkedHashSet<>();
        CustomUserDetailsService.addAuthoritiesForRole(Constants.ROLE_USER_ACCOUNT_ADMIN, aliases);
        assertTrue(aliases.contains("ROLE_USER_ACCOUNT_ADMIN"));
        assertFalse(aliases.contains("ROLE_ADMIN"));
        deniedWrites(actor(Constants.ROLE_USER_ACCOUNT_ADMIN), 403);
        mockMvc.perform(get("/rest/admin/menu/fixture_menu").with(actor(Constants.ROLE_USER_ACCOUNT_ADMIN)))
                .andExpect(status().isForbidden());
        noBusinessCalls();
    }

    @Test
    public void globalAdministratorWithoutCsrfIsStillDeniedBeforeWrites() throws Exception {
        for (String path : List.of("/rest/menu", "/rest/menu/fixture_menu", "/rest/program", "/rest/notification/17")) {
            String body = path.equals("/rest/menu") ? "[" + MENU + "]"
                    : path.startsWith("/rest/menu/") ? MENU : path.equals("/rest/program") ? PROGRAM : NOTICE;
            mockMvc.perform(post(path).with(globalAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isForbidden());
        }
        noBusinessCalls();
    }

    @Test
    public void globalAdministratorBatchMenuStillCallsOriginalSave() throws Exception {
        mockMvc.perform(post("/rest/menu").with(globalAdmin()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("[" + MENU + "]")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].menu.elementId").value("fixture_menu"));
        verify(menus).save(anyList());
        verifyZeroInteractions(programs, fhirWrites, notifications, subscriptions, users);
    }

    @Test
    public void globalAdministratorSingleMenuStillCallsOriginalSave() throws Exception {
        mockMvc.perform(post("/rest/menu/fixture_menu").with(globalAdmin()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(MENU)).andExpect(status().isOk())
                .andExpect(jsonPath("$.menu.elementId").value("fixture_menu"));
        verify(menus).save(any(MenuItem.class));
        verifyZeroInteractions(programs, fhirWrites, notifications, subscriptions, users);
    }

    @Test
    public void globalAdministratorCanReadExistingUnfilteredMenu() throws Exception {
        mockMvc.perform(get("/rest/admin/menu/fixture_menu").with(globalAdmin())).andExpect(status().isOk())
                .andExpect(jsonPath("$.menu.elementId").value("fixture_menu"));
        noBusinessCalls();
    }

    @Test
    public void ordinaryMenuAndProgramGetsRemainAvailableToClinicalRole() throws Exception {
        mockMvc.perform(get("/rest/menu").with(actor("Results"))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].menu.elementId").value("fixture_menu"));
        mockMvc.perform(get("/rest/menu/fixture_menu").with(actor("Results"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.menu.elementId").value("fixture_menu"));
        mockMvc.perform(get("/rest/program/17").with(actor("Results"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.program.id").value("17"));
        verify(programs).get("17");
        verify(programs, never()).save(any(Program.class));
        verifyZeroInteractions(menus, fhirWrites, notifications, subscriptions, users);
    }

    @Test
    public void globalAdministratorProgramStillRunsSaveQuestionnaireAndRefresh() throws Exception {
        mockMvc.perform(post("/rest/program").with(globalAdmin()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(PROGRAM)).andExpect(status().isOk());
        ArgumentCaptor<Program> saved = ArgumentCaptor.forClass(Program.class);
        verify(programs).save(saved.capture());
        assertEquals(Boolean.TRUE, saved.getValue().getManuallyChanged());
        assertNotNull(saved.getValue().getQuestionnaireUUID());
        verify(fhirWrites).updateFhirResourceInFhirStore(any(Questionnaire.class));
        verify(display).refreshList(DisplayListService.ListType.PROGRAM);
        verifyZeroInteractions(menus, notifications, subscriptions, users);
    }

    @Test
    public void globalAdministratorNotificationKeepsSaveThenNoSubscriptionSavedReceipt() throws Exception {
        doAnswer(invocation -> {
            ((Notification) invocation.getArgument(0)).setId(301L);
            return null;
        }).when(notifications).save(any(Notification.class));
        mockMvc.perform(post("/rest/notification/17").with(globalAdmin()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NOTICE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(true)).andExpect(jsonPath("$.id").value(301))
                .andExpect(jsonPath("$.pushStatus").value("NOT_SUBSCRIBED"));
        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        var order = inOrder(users, notifications, subscriptions);
        order.verify(users).getUserById("17");
        order.verify(notifications).save(saved.capture());
        order.verify(subscriptions).getNotificationSubscriptionByUserId(17L);
        assertSame(targetUser, saved.getValue().getUser());
        assertNotNull(saved.getValue().getCreatedDate());
        assertNull(saved.getValue().getReadAt());
        verifyZeroInteractions(menus, programs, fhirWrites);
    }

    @Test
    public void globalAdministratorNotificationKeepsSavedThenPreTransportFailureSavedReceipt() throws Exception {
        doAnswer(invocation -> {
            ((Notification) invocation.getArgument(0)).setId(301L);
            return null;
        }).when(notifications).save(any(Notification.class));
        NotificationSubscriptions abortBeforeNetwork = mock(NotificationSubscriptions.class);
        when(abortBeforeNetwork.getPfEndpoint())
                .thenThrow(new UnsupportedOperationException("fixture forbids outbound HTTP"));
        when(subscriptions.getNotificationSubscriptionByUserId(17L)).thenReturn(abortBeforeNetwork);
        mockMvc.perform(post("/rest/notification/17").with(globalAdmin()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NOTICE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(true)).andExpect(jsonPath("$.id").value(301))
                .andExpect(jsonPath("$.pushStatus").value("FAILED"));
        var order = inOrder(users, notifications, subscriptions);
        order.verify(users).getUserById("17");
        order.verify(notifications).save(any(Notification.class));
        order.verify(subscriptions).getNotificationSubscriptionByUserId(17L);
        // Invalid VAPID constructor fails first; if it did not, endpoint getter throws
        // before .send.
        // Both paths are pre-transport, so this test must not be labelled an actual
        // WebPush delivery failure.
        verifyZeroInteractions(menus, programs, fhirWrites);
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    public static class TestConfig implements WebMvcConfigurer {
        @Override
        public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
            // Reuse the production DTO/FHIR Jackson factory without importing its
            // application configuration.
            converters.add(0, new AppConfig().jacksonMessageConverter());
        }

        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults())
                    .csrf(Customizer.withDefaults());
            return http.build();
        }

        @Bean
        MenuController menuController() {
            return new MenuController();
        }

        @Bean
        ProgramController programController() {
            return new ProgramController();
        }

        @Bean
        NotificationRestController notificationRestController(NotificationDAO n, SystemUserService u,
                NotificationSubscriptionDAO s) {
            return new NotificationRestController(n, u, s);
        }

        @Bean
        SpringContext springContext() {
            return new SpringContext();
        }

        @Bean
        MenuService menuService() {
            return mock(MenuService.class);
        }

        @Bean
        ProgramService programService() {
            return mock(ProgramService.class);
        }

        @Bean
        FhirPersistanceService fhirPersistanceService() {
            return mock(FhirPersistanceService.class);
        }

        @Bean
        static BeanFactoryPostProcessor registerReadOnlyFhirUtilityMock() {
            // Register the already constructed mock; do not autowire production FhirUtil's
            // HTTP/client fields.
            return factory -> factory.registerSingleton("fhirUtil", mock(FhirUtil.class));
        }

        @Bean
        TestSectionService testSectionService() {
            return mock(TestSectionService.class);
        }

        @Bean
        NotificationDAO notificationDAO() {
            return mock(NotificationDAO.class);
        }

        @Bean
        NotificationSubscriptionDAO notificationSubscriptionDAO() {
            return mock(NotificationSubscriptionDAO.class);
        }

        @Bean
        SystemUserService systemUserService() {
            return mock(SystemUserService.class);
        }
    }
}
