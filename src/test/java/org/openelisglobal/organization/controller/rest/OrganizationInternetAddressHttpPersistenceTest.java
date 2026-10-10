package org.openelisglobal.organization.controller.rest;

import static org.junit.Assert.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.AppTestConfig;
import org.openelisglobal.BaseTestConfig;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.address.service.AddressPartService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.interceptor.ModuleAuthenticationInterceptor;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.resultreporting.controller.rest.ReportingChannelHttpPersistenceTest;
import org.openelisglobal.security.SecurityConfig;
import org.springframework.aop.framework.Advised;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Real organization MVC/validator/module guard/PG; external FHIR is an explicit
 * no-network mock.
 */
@ContextConfiguration(classes = { BaseTestConfig.class, AppTestConfig.class,
        ReportingChannelHttpPersistenceTest.HttpFixtureConfig.class,
        OrganizationInternetAddressHttpPersistenceTest.OrganizationFixtureConfig.class })
@TestPropertySource(properties = { "org.itech.login.basic=false", "org.itech.login.form=true",
        "org.itech.login.saml=false", "org.itech.login.oauth=false", "org.itech.login.certificate=false",
        "server.ssl.key-store=classpath:hibernate/hibernate.cfg.xml", "server.ssl.key-store-password=unused-test-only",
        "encryption.general.password=url-http-fixture-only" })
public class OrganizationInternetAddressHttpPersistenceTest extends BaseWebContextSensitiveTest {
    private static final String ENDPOINT = "/rest/Organization";
    private static final String ORG = "9008";
    private static final ObjectMapper JSON = new ObjectMapper();
    @Autowired
    private OrganizationService organizations;
    @Autowired
    private FhirTransformService fhirBoundary;
    private final AtomicInteger writeCalls = new AtomicInteger();
    private MethodInterceptor probe;

    @Before
    public void prepareSyntheticOrganizationAndSeparateActors() throws Exception {
        executeDataSetWithStateManagement("testdata/organization-url-http-contract.xml");
        jdbcTemplate.update("UPDATE clinlims.site_information SET \"group\"=1 WHERE id IN (9025,9026)");
        jdbcTemplate.update("UPDATE clinlims.site_information SET \"group\"=2 WHERE id IN (9027,9028)");
        ConfigurationProperties.loadDBValuesIntoConfiguration();
        String actualPermissionMode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        assertEquals("Use the exact actual configured module authorization mode", "Role", actualPermissionMode);
        assertTrue("The real interceptor must select its role branch", "ROLE".equalsIgnoreCase(actualPermissionMode));
        assertTrue("Real transaction proxy required", organizations instanceof Advised);
        assertFalse(org.mockito.Mockito.mockingDetails(organizations).isMock());
        assertTrue("FHIR is the sole explicit outbound boundary mock",
                org.mockito.Mockito.mockingDetails(fhirBoundary).isMock());
        assertEquals(Integer.valueOf(1), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.system_module_url WHERE url_path='/Organization' AND system_module_id=6",
                Integer.class));
        assertEquals(Integer.valueOf(2), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.address_part WHERE (id=2 AND part_name='commune') OR (id=3 AND part_name='village')",
                Integer.class));
        probe = invocation -> {
            if (Set.of("insert", "update", "save", "deleteAllLinksForOrganization", "linkOrganizationAndType")
                    .contains(invocation.getMethod().getName()))
                writeCalls.incrementAndGet();
            return invocation.proceed();
        };
        ((Advised) organizations).addAdvice(probe);
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).apply(springSecurity()).build();
        org.mockito.Mockito.clearInvocations(fhirBoundary);
    }

    @After
    public void removeOnlyThisWriteProbe() {
        if (organizations instanceof Advised && probe != null)
            ((Advised) organizations).removeAdvice(probe);
    }

    @AfterClass
    public static void closeReusedOwnedQuartz() throws Exception {
        ReportingChannelHttpPersistenceTest.closeOnlyTestOwnedPausedQuartz();
    }

    @Test
    public void httpPrivateIpv4SavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("http://10.42.0.8:18080/lis/results");
    }

    @Test
    public void httpsPublicLiteralDnsSavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("https://lis.example.org/results");
    }

    @Test
    public void httpMultiLabelIntranetDnsSavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("http://lis.intranet.local:18080/results");
    }

    @Test
    public void httpSingleLabelDnsSavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("http://lis:18080/results");
    }

    @Test
    public void httpLocalhostSavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("http://localhost:18080/results");
    }

    @Test
    public void httpsPrivateIpv4SavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("https://192.168.10.20:8443/lis/results");
    }

    @Test
    public void httpBracketedIpv6SavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("http://[fd00::8]:18080/lis/results");
    }

    @Test
    public void httpsPortPathQuerySavesAndFreshGetPreservesIdentity() throws Exception {
        assertAcceptedAddress("https://lis.example.org:8443/r?group=1");
    }

    @Test
    public void exact40CharacterUrlSavesAndFreshGetPreservesIdentity() throws Exception {
        String address = "https://lis.example.org/r?group=12345678";
        assertEquals(40, address.length());
        assertAcceptedAddress(address);
    }

    @Test
    public void validFormat41CharacterUrlReturnsExactSize400WithoutAnyDatabaseWrite() throws Exception {
        String address = "https://lis.example.org/r?group=123456789";
        assertEquals(41, address.length());
        ObjectNode body = currentForm();
        body.put("internetAddress", address);
        Map<String, String> before = databaseFingerprints();
        MvcResult result = mockMvc
                .perform(post(ENDPOINT).session(actorSession(1, "admin", "ADMIN")).with(user("admin").roles("ADMIN"))
                        .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andReturn();
        Object savedErrors = result.getRequest()
                .getAttribute(org.openelisglobal.common.constants.Constants.REQUEST_ERRORS);
        assertTrue("Actual MVC validation errors must be retained by the production controller",
                savedErrors instanceof org.springframework.validation.BindingResult);
        org.springframework.validation.BindingResult errors = (org.springframework.validation.BindingResult) savedErrors;
        assertEquals("Only this storage length constraint rejects a well-formed URL", 1, errors.getErrorCount());
        org.springframework.validation.FieldError field = errors.getFieldError("internetAddress");
        assertNotNull(field);
        assertFalse(field.isBindingFailure());
        assertEquals("Size", field.getCode());
        assertEquals(address, field.getRejectedValue());
        assertEquals(40, org.openelisglobal.organization.form.OrganizationForm.class.getDeclaredField("internetAddress")
                .getAnnotation(jakarta.validation.constraints.Size.class).max());
        assertNoDatabaseWrite(before);
    }

    @Test
    public void malformedTextReturns400WithoutAnyDatabaseWrite() throws Exception {
        assertInvalidAddress("not a url");
    }

    @Test
    public void bareDnsReturns400WithoutAnyDatabaseWrite() throws Exception {
        assertInvalidAddress("lis.intranet.local/results");
    }

    @Test
    public void bareIpReturns400WithoutAnyDatabaseWrite() throws Exception {
        assertInvalidAddress("10.42.0.8:18080/results");
    }

    @Test
    public void resultsCannotWriteOrganization() throws Exception {
        assertRoleDenied(9001, "urlresults", "RESULTS");
    }

    @Test
    public void validationCannotWriteOrganization() throws Exception {
        assertRoleDenied(9002, "urlvalidator", "VALIDATION");
    }

    @Test
    public void receptionCannotWriteOrganization() throws Exception {
        assertRoleDenied(9003, "urlreception", "RECEPTION");
    }

    @Test
    public void anonymousCannotWriteOrganization() throws Exception {
        ObjectNode body = currentForm();
        body.put("internetAddress", "https://changed.example.org/organization");
        Map<String, String> before = databaseFingerprints();
        MvcResult response = mockMvc
                .perform(post(ENDPOINT).session(actorSession(0, "anonymous", "ANONYMOUS")).with(anonymous())
                        .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)))
                .andExpect(status().is3xxRedirection()).andReturn();
        assertTrue(response.getResponse().getHeader("Location").endsWith("/LoginPage"));
        assertNoDatabaseWrite(before);
    }

    @Test
    public void validAddressDoesNotBypassOtherFormConstraint() throws Exception {
        ObjectNode body = currentForm();
        body.put("internetAddress", "https://changed.example.org/organization");
        body.put("organizationName", "");
        Map<String, String> before = databaseFingerprints();
        postAsAdministrator(body, 400);
        assertNoDatabaseWrite(before);
    }

    @Test
    public void nestedOrganizationUrlStillUsesActualValidCascade() throws Exception {
        ObjectNode body = currentForm();
        ObjectNode nested = JSON.createObjectNode();
        // The real GET has already serialized these scalars; do not traverse a detached
        // Hibernate collection.
        for (String scalar : new String[] { "id", "organizationName", "organizationLocalAbbreviation", "city",
                "zipCode", "mlsSentinelLabFlag", "shortName", "multipleUnit", "streetAddress", "state", "cliaNum",
                "pwsId", "mlsLabFlag", "isActive", "orgMltOrgMltId", "selectedOrgId", "internetAddress",
                "lastupdated" }) {
            if (body.has(scalar)) {
                assertTrue("The real GET common field must remain scalar: " + scalar, body.get(scalar).isValueNode());
                nested.set(scalar, body.get(scalar));
            }
        }
        assertEquals(ORG, nested.get("id").asText());
        assertEquals(body.get("organizationName"), nested.get("organizationName"));
        assertEquals(body.get("isActive"), nested.get("isActive"));
        nested.put("internetAddress", "not a url");
        body.set("organization", nested);
        Map<String, String> before = databaseFingerprints();
        MvcResult result = mockMvc
                .perform(post(ENDPOINT).session(actorSession(1, "admin", "ADMIN")).with(user("admin").roles("ADMIN"))
                        .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andReturn();
        Object savedErrors = result.getRequest()
                .getAttribute(org.openelisglobal.common.constants.Constants.REQUEST_ERRORS);
        assertTrue("The real controller must retain the cascaded MVC validation errors",
                savedErrors instanceof org.springframework.validation.BindingResult);
        org.springframework.validation.BindingResult errors = (org.springframework.validation.BindingResult) savedErrors;
        assertEquals("Only the nested URL constraint rejects this otherwise valid real GET payload", 1,
                errors.getErrorCount());
        org.springframework.validation.FieldError field = errors.getFieldError("organization.internetAddress");
        assertNotNull(field);
        assertFalse(field.isBindingFailure());
        assertEquals("URL", field.getCode());
        assertEquals("not a url", field.getRejectedValue());
        assertNoDatabaseWrite(before);
    }

    private ObjectNode currentForm() throws Exception {
        MvcResult result = mockMvc
                .perform(get(ENDPOINT).param("ID", ORG).param("startingRecNo", "1")
                        .session(actorSession(1, "admin", "ADMIN")).with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk()).andReturn();
        assertTrue(result.getResponse().getContentType().startsWith("application/json"));
        ObjectNode form = (ObjectNode) JSON.readTree(result.getResponse().getContentAsString());
        assertEquals(ORG, form.get("id").asText());
        // The default profile hides inline types. Preserve the real stored links, never
        // replace them with null.
        form.set("selectedTypes", JSON.valueToTree(organizations.getTypeIdsForOrganizationId(ORG)));
        return form;
    }

    private void assertAcceptedAddress(String address) throws Exception {
        ObjectNode body = currentForm();
        Map<String, Object> rowBefore = jdbcTemplate.queryForMap("SELECT * FROM clinlims.organization WHERE id=9008");
        Map<String, String> rolesBefore = roleFingerprints();
        String linksBefore = relationFingerprint("organization_organization_type");
        String addressBefore = relationFingerprint("organization_address");
        body.put("internetAddress", address);
        JsonNode saved = postAsAdministrator(body, 200);
        assertTrue(saved.get("success").asBoolean());
        assertEquals(ORG, saved.get("id").asText());
        assertTrue(writeCalls.get() > 0);
        assertEquals(address, jdbcTemplate
                .queryForObject("SELECT internet_address FROM clinlims.organization WHERE id=9008", String.class));
        assertEquals(address, currentForm().get("internetAddress").asText());
        Map<String, Object> rowAfter = jdbcTemplate.queryForMap("SELECT * FROM clinlims.organization WHERE id=9008");
        rowBefore.remove("internet_address");
        rowAfter.remove("internet_address");
        rowBefore.remove("lastupdated");
        rowAfter.remove("lastupdated");
        assertEquals("All remaining identity and organization fields preserved", rowBefore, rowAfter);
        assertEquals(rolesBefore, roleFingerprints());
        assertEquals(linksBefore, relationFingerprint("organization_organization_type"));
        assertEquals(addressBefore, relationFingerprint("organization_address"));
        org.mockito.Mockito.verify(fhirBoundary).transformPersistOrganization(org.mockito.ArgumentMatchers.any());
    }

    private void assertInvalidAddress(String address) throws Exception {
        ObjectNode body = currentForm();
        body.put("internetAddress", address);
        Map<String, String> before = databaseFingerprints();
        postAsAdministrator(body, 400);
        assertNoDatabaseWrite(before);
    }

    private void assertRoleDenied(int id, String name, String role) throws Exception {
        assertEquals(Integer.valueOf(1), jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.system_user_role WHERE system_user_id=?", Integer.class, id));
        assertEquals("N", jdbcTemplate.queryForObject("SELECT is_admin FROM clinlims.login_user WHERE login_name=?",
                String.class, name));
        ObjectNode body = currentForm();
        body.put("internetAddress", "https://changed.example.org/organization");
        Map<String, String> before = databaseFingerprints();
        MvcResult response = mockMvc
                .perform(post(ENDPOINT).session(actorSession(id, name, role)).with(user(name).roles(role)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)))
                .andReturn();
        assertTrue("A real module/method authorization rejection is required; authenticated 200 is a failure",
                response.getResponse().getStatus() == 401 || response.getResponse().getStatus() == 403);
        assertNoDatabaseWrite(before);
    }

    private JsonNode postAsAdministrator(ObjectNode body, int expected) throws Exception {
        MvcResult result = mockMvc
                .perform(post(ENDPOINT).session(actorSession(1, "admin", "ADMIN")).with(user("admin").roles("ADMIN"))
                        .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)))
                .andExpect(status().is(expected)).andReturn();
        return expected == 200 ? JSON.readTree(result.getResponse().getContentAsString()) : null;
    }

    private MockHttpSession actorSession(int id, String name, String role) {
        MockHttpSession session = new MockHttpSession();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(id);
        actor.setLoginName(name);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        var principal = User.withUsername(name).password("unused-fixture-only").roles(role).build();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, new SecurityContextImpl(
                new UsernamePasswordAuthenticationToken(principal, "unused-fixture-only", principal.getAuthorities())));
        return session;
    }

    private void assertNoDatabaseWrite(Map<String, String> before) {
        assertEquals(0, writeCalls.get());
        assertEquals(before, databaseFingerprints());
        assertTrue("Denied and invalid requests must have absolutely zero FHIR interactions",
                org.mockito.Mockito.mockingDetails(fhirBoundary).getInvocations().isEmpty());
        org.mockito.Mockito.verifyZeroInteractions(fhirBoundary);
    }

    private String relationFingerprint(String table) {
        assertTrue(table.matches("[a-z0-9_]+"));
        return jdbcTemplate
                .queryForObject(
                        "SELECT count(*)::text || ':' || md5(coalesce(string_agg(v, E'\\n' ORDER BY v),'')) "
                                + "FROM (SELECT to_jsonb(t)::text v FROM clinlims.\"" + table + "\" t) q",
                        String.class);
    }

    private Map<String, String> databaseFingerprints() {
        Map<String, String> result = new LinkedHashMap<>();
        for (String table : jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema='clinlims' AND table_type='BASE TABLE' ORDER BY table_name",
                String.class)) {
            result.put(table, relationFingerprint(table));
        }
        return result;
    }

    private Map<String, String> roleFingerprints() {
        Map<String, String> result = new LinkedHashMap<>();
        for (String table : new String[] { "system_user", "login_user", "system_role", "system_role_module",
                "system_user_role", "system_user_module", "system_module", "system_module_url" }) {
            result.put(table, relationFingerprint(table));
        }
        return result;
    }

    @Configuration
    @Import(ModuleAuthenticationInterceptor.class)
    public static class OrganizationFixtureConfig implements WebMvcConfigurer {
        @Autowired
        private ModuleAuthenticationInterceptor module;

        @Bean
        @Lazy
        public OrganizationRestController organizationRestController(AddressPartService parts) {
            return new OrganizationRestController(parts);
        }

        @Bean
        @Primary
        public FhirTransformService organizationUrlExternalFhirBoundary() {
            return org.mockito.Mockito.mock(FhirTransformService.class);
        }

        @Override
        public void addInterceptors(InterceptorRegistry registry) {
            // Exact production AppConfig module registration, including its exclusions.
            registry.addInterceptor(module).addPathPatterns("/**").excludePathPatterns(SecurityConfig.OPEN_PAGES)
                    .excludePathPatterns(SecurityConfig.LOGIN_PAGES).excludePathPatterns(SecurityConfig.RESOURCE_PAGES)
                    .excludePathPatterns(SecurityConfig.AUTH_OPEN_PAGES);
        }
    }
}
