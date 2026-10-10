package org.openelisglobal.resultreporting.controller.rest;

import static org.junit.Assert.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.aopalliance.intercept.MethodInterceptor;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import org.jasypt.util.text.AES256TextEncryptor;
import org.jasypt.util.text.TextEncryptor;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.dataexchange.resultreporting.beans.ReportingConfiguration;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.resultreporting.form.ResultReportingConfigurationForm;
import org.openelisglobal.resultreporting.service.ResultReportingConfigurationService;
import org.openelisglobal.scheduler.SchedulerConfig;
import org.openelisglobal.security.SecurityConfig;
import org.openelisglobal.security.login.CustomUserDetailsService;
import org.quartz.Scheduler;
import org.quartz.impl.SchedulerRepository;
import org.quartz.impl.StdSchedulerFactory;
import org.quartz.impl.matchers.GroupMatcher;
import org.springframework.aop.framework.Advised;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.AbstractBeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.util.ClassUtils;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Actual production MVC/security/controller/transaction services against
 * disposable PG only.
 */
@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        ReportingChannelLegacyUrlHttpPersistenceTest.HttpFixtureConfig.class })
@TestPropertySource(properties = { "org.itech.login.basic=false", "org.itech.login.form=true",
        "org.itech.login.saml=false", "org.itech.login.oauth=false", "org.itech.login.certificate=false",
        "server.ssl.key-store=classpath:hibernate/hibernate.cfg.xml", "server.ssl.key-store-password=unused-test-only",
        "encryption.general.password=url-http-fixture-only" })
public class ReportingChannelLegacyUrlHttpPersistenceTest extends BaseWebContextSensitiveTest {
    private static final String ENDPOINT = "/rest/ResultReportingConfiguration";
    private static final String ENABLED = "9025", URL = "9026", SECOND_ENABLED = "9027", SECOND_URL = "9028";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static OwnedQuartzGuard quartzGuard;
    private static String securityFactoryBeanName;

    @Autowired
    private ResultReportingConfigurationService writes;
    @Autowired
    private ResultReportingConfigurationRestController controller;
    @Autowired
    private SchedulerConfig schedulerConfig;

    private MockHttpSession session;
    private final AtomicInteger writeCalls = new AtomicInteger();
    private MethodInterceptor writeProbe;

    @Before
    public void prepareActualHttpFixtures() throws Exception {
        executeDataSetWithStateManagement("testdata/reporting-channel-http-contract.xml");
        // Reserved PostgreSQL group column is quoted in fixture-only JDBC, not DBUnit
        // INSERT.
        jdbcTemplate.update("UPDATE clinlims.site_information SET \"group\"=1 WHERE id IN (9025,9026)");
        jdbcTemplate.update("UPDATE clinlims.site_information SET \"group\"=2 WHERE id IN (9027,9028)");
        ConfigurationProperties.loadDBValuesIntoConfiguration();
        assertTrue("Actual production method-security proxy required", AopUtils.isAopProxy(controller));
        assertTrue("Real transactional service proxy required", writes instanceof Advised);
        assertEquals("No background @Scheduled executor may run in this isolated fixture", 0,
                webApplicationContext.getBeanNamesForType(ScheduledAnnotationBeanPostProcessor.class).length);
        assertTrue(webApplicationContext.getBean(SecurityConfig.class) instanceof SecurityConfig);
        assertDeterministicProductionCrypto();
        assertFalse("No configuration persistence mock", org.mockito.Mockito.mockingDetails(writes).isMock());
        writeProbe = invocation -> {
            if ("updateInformationAndSchedulers".equals(invocation.getMethod().getName())) {
                writeCalls.incrementAndGet();
            }
            return invocation.proceed();
        };
        ((Advised) writes).addAdvice(writeProbe);
        session = new MockHttpSession();
        var actor = new UserSessionData();
        actor.setSytemUserId(1);
        actor.setLoginName("admin");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).apply(springSecurity()).build();
        assertInactiveAndNoScheduledSend();
    }

    @After
    public void removeReadOnlyWriteProbe() {
        if (writes instanceof Advised && writeProbe != null) {
            ((Advised) writes).removeAdvice(writeProbe);
        }
    }

    @AfterClass
    public static void closeOnlyTestOwnedPausedQuartz() throws Exception {
        if (quartzGuard != null) {
            try {
                quartzGuard.close();
            } finally {
                System.out.println("URL_HTTP_QUARTZ_INSTANCE_CHAIN=" + quartzGuard.timeline);
            }
        }
    }

    @Test
    public void anonymousGetAndPostAreDeniedBeforeConfigurationWrites() throws Exception {
        String before = persistedSnapshot();
        var getResult = mockMvc.perform(get(ENDPOINT).session(session).with(anonymous()))
                .andExpect(status().is3xxRedirection()).andReturn();
        assertTrue(getResult.getResponse().getHeader("Location").endsWith("/LoginPage"));
        var postResult = performObservedPost(post(ENDPOINT).session(session).with(anonymous()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(validChannel("https://lis.example.org/results"))))
                .andExpect(status().is3xxRedirection()).andReturn();
        assertTrue(postResult.getResponse().getHeader("Location").endsWith("/LoginPage"));
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void resultsValidationAndReceptionCannotGetOrPostDespiteValidCsrf() throws Exception {
        String before = persistedSnapshot();
        for (String role : List.of("RESULTS", "VALIDATION", "RECEPTION")) {
            mockMvc.perform(get(ENDPOINT).session(session).with(user("admin").roles(role)))
                    .andExpect(status().isForbidden());
            performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles(role)).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body(validChannel("https://lis.example.org/results")))).andExpect(status().isForbidden());
        }
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void administratorGetPreservesStoredValuesVersionsAndInactiveSchedule() throws Exception {
        String before = persistedSnapshot();
        JsonNode first = channel(readAsAdministrator(), URL);
        assertEquals(ENABLED, first.get("enabledId").asText());
        assertEquals("disable", first.get("enabled").asText());
        assertEquals("https://original.example.org/results", first.get("url").asText());
        assertEquals("9003", first.get("schedulerId").asText());
        assertTrue(first.get("isScheduled").asBoolean());
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void malformedFirstReportsUrlUsesRealCascadeAndReturns400BeforeServiceWrite() throws Exception {
        String before = persistedSnapshot();
        performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(validChannel("not a url"))))
                .andExpect(status().isBadRequest());
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void malformedSecondReportsUrlCannotWriteTheFirstValidChild() throws Exception {
        String before = persistedSnapshot();
        ReportingConfiguration second = validChannel("not a url");
        second.setEnabledId(SECOND_ENABLED);
        second.setUrlId(SECOND_URL);
        second.setIsScheduled(false);
        second.setSchedulerId(null);
        performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(validChannel("http://10.42.0.8:18080/results"), second)))
                .andExpect(status().isBadRequest());
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void disabledHttpAndHttpsChannelChangesCommitAndFreshGetDoesNotAdvanceVersion() throws Exception {
        for (String address : List.of("http://10.42.0.8:18080/results", "http://lis.intranet.local:18080/results",
                "https://lis.example.org/results")) {
            String exportsBefore = exportSnapshot();
            var originalVersion = jdbcTemplate.queryForObject(
                    "SELECT lastupdated FROM clinlims.site_information WHERE id=9026", java.sql.Timestamp.class);
            performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(body(validChannel(address))))
                    .andExpect(status().isOk());
            assertEquals("Inactive URL POST must not create, alter or dequeue exports", exportsBefore,
                    exportSnapshot());
            assertEquals(address, jdbcTemplate
                    .queryForObject("SELECT value FROM clinlims.site_information WHERE id=9026", String.class));
            var savedVersion = jdbcTemplate.queryForObject(
                    "SELECT lastupdated FROM clinlims.site_information WHERE id=9026", java.sql.Timestamp.class);
            assertFalse("A legitimate URL update uses existing optimistic versioning",
                    originalVersion.equals(savedVersion));
            String saved = persistedSnapshot();
            JsonNode read = channel(readAsAdministrator(), URL);
            assertEquals(URL, read.get("urlId").asText());
            assertEquals(ENABLED, read.get("enabledId").asText());
            assertEquals(address, read.get("url").asText());
            assertEquals("disable", read.get("enabled").asText());
            assertEquals(saved, persistedSnapshot());
            assertInactiveAndNoScheduledSend();
        }
        assertEquals(3, writeCalls.get());
        assertEquals("Record each real reload replacement", 3, quartzGuard.reloadCount);
    }

    @Test
    public void wrongIdentityPairReturns400WithoutValueOrVersionChanges() throws Exception {
        String before = persistedSnapshot();
        ReportingConfiguration invalid = validChannel("https://attempted.example.org/results");
        invalid.setUrlId(SECOND_URL);
        performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(invalid))).andExpect(status().isBadRequest());
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void unchangedDisabledLegacyUrlAllowsAnotherChannelsValidEdit() throws Exception {
        prepareLegacyDisabledUrl();
        ReportingConfiguration second = secondChannel("http://10.42.0.9:18080/results");
        String exportsBefore = exportSnapshot();
        performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(validChannel("disable"), second)))
                .andExpect(status().isOk());
        assertEquals(1, writeCalls.get());
        JsonNode current = readAsAdministrator();
        assertEquals("disable", channel(current, URL).get("url").asText());
        assertEquals("disable", channel(current, URL).get("enabled").asText());
        assertEquals("http://10.42.0.9:18080/results", channel(current, SECOND_URL).get("url").asText());
        assertEquals("never", jdbcTemplate.queryForObject(
                "SELECT cron_statement FROM clinlims.quartz_cron_scheduler WHERE id=9003", String.class));
        assertEquals(exportsBefore, exportSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    @Test
    public void enablingLegacyOpaqueUrlReturns400WithoutWrites() throws Exception {
        prepareLegacyDisabledUrl();
        ReportingConfiguration channel = validChannel("disable");
        channel.setEnabled("enable");
        assertRejectedWithoutWrites(channel);
    }

    @Test
    public void changedDisabledLegacyUrlCannotIntroduceMalformedAddress() throws Exception {
        prepareLegacyDisabledUrl();
        assertRejectedWithoutWrites(validChannel("not a url"));
    }

    @Test
    public void compatibleLegacyChildDoesNotHideSecondInvalidUrl() throws Exception {
        prepareLegacyDisabledUrl();
        assertRejectedWithoutWrites(validChannel("disable"), secondChannel("not a url"));
    }

    @Test
    public void compatibleLegacyUrlDoesNotHideOtherCascadedConstraint() throws Exception {
        prepareLegacyDisabledUrl();
        ReportingConfiguration channel = validChannel("disable");
        channel.setScheduleHours("25");
        assertRejectedWithoutWrites(channel);
    }

    @Test
    public void legacyPlaceholderCannotBeAttachedToAnotherChannelsIdentity() throws Exception {
        prepareLegacyDisabledUrl();
        ReportingConfiguration channel = validChannel("disable");
        channel.setEnabledId(SECOND_ENABLED);
        assertRejectedWithoutWrites(channel);
    }

    @Test
    public void nonexistentLegacyUrlIdentityReturns400WithoutWrites() throws Exception {
        prepareLegacyDisabledUrl();
        ReportingConfiguration channel = validChannel("disable");
        channel.setUrlId("999999");
        assertRejectedWithoutWrites(channel);
    }

    private void prepareLegacyDisabledUrl() {
        assertEquals(1, jdbcTemplate.update("UPDATE clinlims.site_information SET value='disable' WHERE id=9026"));
        ConfigurationProperties.loadDBValuesIntoConfiguration();
    }

    private ReportingConfiguration secondChannel(String address) {
        ReportingConfiguration channel = validChannel(address);
        channel.setEnabledId(SECOND_ENABLED);
        channel.setUrlId(SECOND_URL);
        channel.setIsScheduled(false);
        channel.setSchedulerId(null);
        return channel;
    }

    private void assertRejectedWithoutWrites(ReportingConfiguration... channels) throws Exception {
        String before = persistedSnapshot();
        performObservedPost(post(ENDPOINT).session(session).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(channels))).andExpect(status().isBadRequest());
        assertEquals(0, writeCalls.get());
        assertEquals(before, persistedSnapshot());
        assertInactiveAndNoScheduledSend();
    }

    private ReportingConfiguration validChannel(String address) {
        var channel = new ReportingConfiguration();
        channel.setEnabledId(ENABLED);
        channel.setUrlId(URL);
        channel.setEnabled("disable");
        channel.setUrl(address);
        channel.setIsScheduled(true);
        channel.setSchedulerId("9003");
        return channel;
    }

    private String body(ReportingConfiguration... channels) throws Exception {
        var form = new ResultReportingConfigurationForm();
        form.setReports(List.of(channels));
        return JSON.writeValueAsString(form);
    }

    private JsonNode readAsAdministrator() throws Exception {
        MvcResult result = mockMvc.perform(get(ENDPOINT).session(session).with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk()).andReturn();
        assertTrue(result.getResponse().getContentType().startsWith("application/json"));
        return JSON.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode channel(JsonNode form, String id) {
        for (JsonNode row : form.get("reports")) {
            if (id.equals(row.get("urlId").asText())) {
                return row;
            }
        }
        throw new AssertionError("Expected real channel " + id);
    }

    private String persistedSnapshot() {
        String rows = jdbcTemplate
                .queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb)::text "
                        + "FROM clinlims.site_information s", String.class);
        String schedules = jdbcTemplate
                .queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb)::text "
                        + "FROM clinlims.quartz_cron_scheduler q", String.class);
        return rows + "\n" + schedules + "\n" + exportSnapshot();
    }

    private String exportSnapshot() {
        return jdbcTemplate.queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb)::text "
                + "FROM clinlims.report_external_export e", String.class);
    }

    private ResultActions performObservedPost(MockHttpServletRequestBuilder request) throws Exception {
        Scheduler previous = quartzGuard.currentOwned(schedulerConfig);
        try {
            return mockMvc.perform(request);
        } finally {
            // Observe the actual production field even when HTTP setup/controller/assertion
            // fails.
            quartzGuard.recordAfterRequest(schedulerConfig, previous);
        }
    }

    private void assertDeterministicProductionCrypto() {
        var factory = (org.springframework.beans.factory.config.ConfigurableListableBeanFactory) webApplicationContext
                .getAutowireCapableBeanFactory();
        SecurityConfig source = webApplicationContext.getBean(SecurityConfig.class);
        for (String name : List.of("textEncryptor", "passwordEncoder")) {
            var definition = factory.getBeanDefinition(name);
            assertEquals(securityFactoryBeanName, definition.getFactoryBeanName());
            assertEquals(name, definition.getFactoryMethodName());
            assertEquals(SecurityConfig.class.getName(), definition.getAttribute("urlHttpCryptoSource"));
        }
        TextEncryptor encryptor = webApplicationContext.getBean("textEncryptor", TextEncryptor.class);
        assertTrue(encryptor instanceof AES256TextEncryptor);
        assertFalse(org.mockito.Mockito.mockingDetails(encryptor).isMock());
        assertSame(source.textEncryptor(), encryptor);
        String plain = "public-url-http-crypto-fixture";
        String encrypted = encryptor.encrypt(plain);
        assertNotEquals("Production AES must not become AppTest identity encryption", plain, encrypted);
        assertEquals(plain, encryptor.decrypt(encrypted));
        PasswordEncoder encoder = webApplicationContext.getBean("passwordEncoder", PasswordEncoder.class);
        assertTrue(encoder instanceof BCryptPasswordEncoder);
        assertFalse(org.mockito.Mockito.mockingDetails(encoder).isMock());
        assertSame(source.passwordEncoder(), encoder);
        String encoded = encoder.encode("public-fixture-only-password");
        assertNotEquals("public-fixture-only-password", encoded);
        assertTrue(encoder.matches("public-fixture-only-password", encoded));
        assertFalse(encoder.matches("a-different-public-fixture-password", encoded));
    }

    private void assertInactiveAndNoScheduledSend() throws Exception {
        assertEquals(Integer.valueOf(0), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.quartz_cron_scheduler WHERE active IS TRUE", Integer.class));
        assertEquals("never", jdbcTemplate.queryForObject(
                "SELECT cron_statement FROM clinlims.quartz_cron_scheduler WHERE id=9003", String.class));
        assertNull(jdbcTemplate.queryForObject("SELECT last_run FROM clinlims.quartz_cron_scheduler WHERE id=9003",
                java.sql.Timestamp.class));
        Scheduler current = quartzGuard.currentOwned(schedulerConfig);
        assertTrue(current.isInStandbyMode());
        assertTrue(current.getJobKeys(GroupMatcher.anyJobGroup()).isEmpty());
        assertTrue(current.getTriggerKeys(GroupMatcher.anyTriggerGroup()).isEmpty());
    }

    @Configuration
    @Import({ SecurityConfig.class, CustomUserDetailsService.class, ResultReportingConfigurationRestController.class })
    public static class HttpFixtureConfig implements WebMvcConfigurer {
        @Bean
        @Primary
        public LocalValidatorFactoryBean httpUrlValidator() {
            var factory = new LocalValidatorFactoryBean();
            // Existing fixture strategy: real provider/constraints, no EL runtime needed.
            factory.setMessageInterpolator(new ParameterMessageInterpolator());
            return factory;
        }

        @Override
        public org.springframework.validation.Validator getValidator() {
            return httpUrlValidator();
        }

        @Bean
        public static BeanFactoryPostProcessor chooseProductionCryptoFactories() {
            return factory -> {
                List<String> definitions = new ArrayList<>();
                for (String name : factory.getBeanDefinitionNames()) {
                    var definition = factory.getBeanDefinition(name);
                    String sourceClassName;
                    if (definition instanceof AnnotatedBeanDefinition annotated) {
                        sourceClassName = annotated.getMetadata().getClassName();
                    } else if (definition instanceof AbstractBeanDefinition resolved && resolved.hasBeanClass()) {
                        sourceClassName = ClassUtils.getUserClass(resolved.getBeanClass()).getName();
                    } else {
                        sourceClassName = definition.getBeanClassName();
                    }
                    if (SecurityConfig.class.getName().equals(sourceClassName)
                            && definition.getFactoryMethodName() == null && definition.getFactoryBeanName() == null) {
                        assertTrue("Actual imported SecurityConfig must retain @Configuration metadata",
                                definition instanceof AnnotatedBeanDefinition configuration
                                        && configuration.getMetadata().hasAnnotation(Configuration.class.getName()));
                        definitions.add(name);
                    }
                }
                assertEquals("Exactly one actual imported SecurityConfig definition", 1, definitions.size());
                securityFactoryBeanName = definitions.get(0);
                BeanDefinitionRegistry registry = (BeanDefinitionRegistry) factory;
                for (String name : List.of("textEncryptor", "passwordEncoder")) {
                    assertFalse("No crypto bean may initialize before its explicit source is fixed: " + name,
                            factory.containsSingleton(name));
                    if (registry.containsBeanDefinition(name)) {
                        registry.removeBeanDefinition(name);
                    }
                    RootBeanDefinition selected = new RootBeanDefinition();
                    selected.setFactoryBeanName(securityFactoryBeanName);
                    selected.setFactoryMethodName(name);
                    selected.setPrimary(true);
                    selected.setAttribute("urlHttpCryptoSource", SecurityConfig.class.getName());
                    registry.registerBeanDefinition(name, selected);
                }
            };
        }

        @Bean(destroyMethod = "close")
        public OwnedQuartzGuard urlHttpQuartzGuard() throws Exception {
            quartzGuard = new OwnedQuartzGuard();
            return quartzGuard;
        }

        @Bean
        public SchedulerConfig urlHttpSchedulerConfig(OwnedQuartzGuard ownership) throws Exception {
            SchedulerConfig actual = new SchedulerConfig();
            // Ordinary bean: actual reload implementation/dependencies, no scheduling
            // annotation import.
            ReflectionTestUtils.setField(actual, "reloadableScheduler", ownership.createInitial());
            return actual;
        }
    }

    /**
     * Identity ownership, not a default Quartz name; never shuts down a
     * pre-existing scheduler.
     */
    public static final class OwnedQuartzGuard implements AutoCloseable {
        private final Set<Scheduler> owned = Collections.newSetFromMap(new IdentityHashMap<>());
        private final List<String> timeline = new ArrayList<>();
        private int reloadCount;

        OwnedQuartzGuard() throws Exception {
            assertTrue("Fresh test JVM Quartz registry must be empty; refuse foreign schedulers",
                    SchedulerRepository.getInstance().lookupAll().isEmpty());
            timeline.add("PREFLIGHT_REGISTRY_EMPTY");
        }

        synchronized Scheduler createInitial() throws Exception {
            assertTrue(owned.isEmpty());
            assertTrue("Registry still empty immediately before the only fixture creation",
                    SchedulerRepository.getInstance().lookupAll().isEmpty());
            Scheduler created = StdSchedulerFactory.getDefaultScheduler();
            owned.add(created); // Record immediately: later context/setup failure still owns only this object.
            timeline.add("INITIAL:" + identity(created));
            requireOnlyRegistryInstance(created);
            assertTrue(created.isInStandbyMode());
            return created;
        }

        synchronized Scheduler currentOwned(SchedulerConfig actual) throws Exception {
            Scheduler current = (Scheduler) ReflectionTestUtils.getField(actual, "reloadableScheduler");
            assertNotNull("Read actual SchedulerConfig field without creating a scheduler", current);
            assertTrue("Actual field must contain an object in the identity-owned chain", owned.contains(current));
            requireOnlyRegistryInstance(current);
            assertFalse(current.isShutdown());
            return current;
        }

        synchronized void recordAfterRequest(SchedulerConfig actual, Scheduler previous) throws Exception {
            Scheduler current = (Scheduler) ReflectionTestUtils.getField(actual, "reloadableScheduler");
            assertNotNull(current);
            if (current != previous) {
                assertTrue("Real reload must shut down the previously owned instance", previous.isShutdown());
                assertFalse("A replacement cannot be a previously recorded instance", owned.contains(current));
                // Only the production field's returned replacement, with an exact existing
                // registry match.
                requireOnlyRegistryInstance(current);
                assertFalse(current.isShutdown());
                owned.add(current);
                reloadCount++;
                timeline.add("RELOAD:" + identity(previous) + "->" + identity(current));
            }
            currentOwned(actual);
        }

        private void requireOnlyRegistryInstance(Scheduler expected) throws Exception {
            var registered = SchedulerRepository.getInstance().lookupAll();
            assertEquals("No unowned/foreign scheduler may share this test JVM", 1, registered.size());
            assertSame(expected, registered.iterator().next());
            assertSame(expected, SchedulerRepository.getInstance().lookup(expected.getSchedulerName()));
        }

        private String identity(Scheduler value) throws Exception {
            return value.getSchedulerName() + "@" + Integer.toHexString(System.identityHashCode(value));
        }

        @Override
        public synchronized void close() throws Exception {
            List<Throwable> failures = new ArrayList<>();
            // May run on context-setup failure, @AfterClass and later context close; safe
            // and idempotent.
            for (Scheduler instance : owned) {
                if (instance.isShutdown()) {
                    continue;
                }
                Scheduler registered = SchedulerRepository.getInstance().lookup(instance.getSchedulerName());
                if (registered != instance) {
                    failures.add(new AssertionError(
                            "Refuse shutdown: registry identity no longer owns " + identity(instance)));
                    continue;
                }
                try {
                    instance.shutdown(true);
                    assertTrue(instance.isShutdown());
                    timeline.add("SHUTDOWN:" + identity(instance));
                } catch (Throwable failure) {
                    failures.add(failure);
                }
            }
            for (Scheduler registered : SchedulerRepository.getInstance().lookupAll()) {
                failures.add(new AssertionError(
                        "Unremoved registry object; no foreign shutdown attempted: " + identity(registered)));
            }
            if (!failures.isEmpty()) {
                AssertionError combined = new AssertionError("Test-owned Quartz cleanup did not fully succeed");
                failures.forEach(combined::addSuppressed);
                throw combined;
            }
        }
    }
}
