package org.openelisglobal.testcatalog.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analyzer.service.AnalyzerService;
import org.openelisglobal.analyzerimport.service.AnalyzerTestMappingService;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.resultlimit.service.ResultLimitService;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testcatalog.controller.rest.TestCatalogEditorRestController;
import org.openelisglobal.testcatalog.service.CatalogHealthService;
import org.openelisglobal.testcatalog.service.RangeCoverageValidationService;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultinterpretation.service.TestResultInterpretationService;
import org.openelisglobal.testsamplehandling.service.TestSampleHandlingService;
import org.openelisglobal.testterminology.service.TestTerminologyMappingService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/**
 * FR-004: the unified Test Catalog editor surface is gated on ROLE_ADMIN — the
 * API returns 403 for non-admins and 401 for the unauthenticated.
 */
@WebAppConfiguration
@ContextConfiguration(classes = { TestCatalogEditorRestControllerSecurityTest.TestConfig.class })
@TestPropertySource("classpath:common.properties")
public class TestCatalogEditorRestControllerSecurityTest extends SecuritySliceMockMvcTest {

    @Autowired
    private TestService tests;
    @Autowired
    private TestCatalogEditorRestController controller;
    private TypeOfSampleTestService sampleLinks;
    private Object originalHealth;

    @Before
    public void resetSearchFixtures() {
        sampleLinks = (TypeOfSampleTestService) ReflectionTestUtils.getField(controller, "typeOfSampleTestService");
        reset(tests, sampleLinks);
        originalHealth = ReflectionTestUtils.getField(controller, "catalogHealthService");
    }

    @After
    public void restoreSearchFixtures() {
        ReflectionTestUtils.setField(controller, "catalogHealthService", originalHealth);
    }

    @Test
    public void listTests_codeOnlyMatchUsesCaseInsensitiveSubstring() throws Exception {
        stubCatalog(searchTest("1", "平滑肌抗体", "SMA-001"), searchTest("2", "无关项目", "OTHER"));
        search("sma", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.rows[0].testId").value("1"))
                .andExpect(jsonPath("$.rows[0].code").value("SMA-001"));
    }

    @Test
    public void listTests_nameStillMatchesWhenCodeDoesNot() throws Exception {
        stubCatalog(searchTest("1", "乙肝表面抗原", "HBV-001"), searchTest("2", "无关项目", "OTHER"));
        search("表面抗原", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.rows[0].testId").value("1"));
    }

    @Test
    public void listTests_nullNameOrCodeCannotBreakSearch() throws Exception {
        stubCatalog(searchTest("1", null, "Code-only"), searchTest("2", "Name-only", null),
                searchTest("3", null, null));
        search("code", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.rows[0].testId").value("1"));
        search("NAME", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.rows[0].testId").value("2"));
        search(null, Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3));
    }

    @Test
    public void listTests_searchWithNoNameOrCodeMatchReturnsEmptyPage() throws Exception {
        stubCatalog(searchTest("1", "平滑肌抗体", "SMA-001"));
        search("unmatched", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.rows").isEmpty());
    }

    @Test
    public void listTests_codeMatchPreservesOtherFiltersAndPagination() throws Exception {
        var first = searchTest("1", "A匹配", "SMA-1");
        var second = searchTest("2", "B匹配", "SMA-2");
        var wrongDomain = searchTest("3", "不匹配业务域", "SMA-3");
        wrongDomain.setDomain("VECTOR");
        var inactive = searchTest("4", "停用项目", "SMA-4");
        inactive.setIsActive("N");
        var notAmr = searchTest("5", "非AMR项目", "SMA-5");
        notAmr.setAntimicrobialResistance(false);
        var wrongSample = searchTest("6", "不匹配标本", "SMA-6");
        var noIssues = searchTest("7", "无配置问题", "SMA-7");
        var wrongQuery = searchTest("8", "不匹配查询", "OTHER");
        stubCatalog(first, second, wrongDomain, inactive, notAmr, wrongSample, noIssues, wrongQuery);
        List<TypeOfSampleTest> links = new ArrayList<>();
        for (String id : List.of("1", "2", "3", "4", "5", "7", "8")) {
            TypeOfSampleTest link = new TypeOfSampleTest();
            link.setTestId(id);
            link.setTypeOfSampleId("7");
            links.add(link);
        }
        when(sampleLinks.getTypeOfSampleTestsForSampleType("7")).thenReturn(links);
        CatalogHealthService health = mock(CatalogHealthService.class);
        var finding = new CatalogHealthService.Finding("search-fixture", CatalogHealthService.Severity.WARNING,
                "basic-info", "配置提示");
        when(health.getAll()).thenReturn(Map.of("1", List.of(finding), "2", List.of(finding), "3", List.of(finding),
                "4", List.of(finding), "5", List.of(finding), "6", List.of(finding), "8", List.of(finding)));
        ReflectionTestUtils.setField(controller, "catalogHealthService", health);
        search("sma",
                Map.of("domain", "CLINICAL", "status", "active", "amr", "true", "sampleType", "7", "issuesOnly", "true",
                        "page", "2", "pageSize", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.page").value(2)).andExpect(jsonPath("$.pageSize").value(1))
                .andExpect(jsonPath("$.rows.length()").value(1)).andExpect(jsonPath("$.rows[0].testId").value("2"))
                .andExpect(jsonPath("$.totalWithIssues").value(2)).andExpect(jsonPath("$.totalWarnings").value(2));
    }

    private void stubCatalog(org.openelisglobal.test.valueholder.Test... catalog) {
        List<org.openelisglobal.test.valueholder.Test> rows = List.of(catalog);
        when(tests.getAll()).thenReturn(rows);
        when(tests.getTestById(anyString())).thenAnswer(invocation -> rows.stream()
                .filter(t -> t.getId().equals(invocation.getArgument(0))).findFirst().orElse(null));
        when(tests.getTypeOfSamples(any(org.openelisglobal.test.valueholder.Test.class))).thenReturn(List.of());
    }

    private org.openelisglobal.test.valueholder.Test searchTest(String id, String name, String code) {
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId(id);
        test.setDescription(name);
        test.setLocalCode(code);
        test.setDomain("CLINICAL");
        test.setIsActive("Y");
        test.setAntimicrobialResistance(true);
        return test;
    }

    private ResultActions search(String query, Map<String, String> filters) throws Exception {
        // Exercise the real MVC filter; isolate the unrelated name-augmentation
        // setting.
        Object previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        factory.registerSingleton("configuration", mock(DefaultConfigurationProperties.class));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        try {
            MockHttpServletRequestBuilder request = get("/rest/test-catalog/tests").with(user("admin").roles("ADMIN"));
            if (query != null)
                request.param("search", query);
            filters.forEach((key, value) -> request.param(key, value));
            return mockMvc.perform(request);
        } finally {
            ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        }
    }

    @Test
    public void getEnvelope_withoutAuthenticationReturns401() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/tests/1")).andExpect(status().isUnauthorized());
    }

    @Test
    public void getEnvelope_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/tests/1").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void getEnvelope_adminUnknownTestReturns404() throws Exception {
        // Admin passes the gate; the (mocked) service returns null → 404, proving
        // the request reached the controller rather than being blocked by auth.
        mockMvc.perform(get("/rest/test-catalog/tests/999999").with(user("admin").roles("ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    public void saveBasicInfo_nonAdminReturns403() throws Exception {
        mockMvc.perform(put("/rest/test-catalog/tests/1/basic-info").with(user("results").roles("RESULTS"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    public void saveBasicInfo_adminUnknownTestReturns404() throws Exception {
        // Admin passes the gate; the mocked service returns null for an unknown test
        // → 404, proving the write-path reached the controller past auth.
        mockMvc.perform(put("/rest/test-catalog/tests/999999/basic-info").with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }

    @Test
    public void getAnalyzers_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/tests/1/analyzers").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void getAnalyzers_adminUnknownTestReturns404() throws Exception {
        // Admin passes the gate; the mocked TestService returns null → 404, proving
        // the read-path reached the controller past auth.
        mockMvc.perform(get("/rest/test-catalog/tests/999999/analyzers").with(user("admin").roles("ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    public void listSampleTypes_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/sample-types").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void getTestOrder_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/sample-types/1/test-order").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void saveTestOrder_nonAdminReturns403() throws Exception {
        mockMvc.perform(put("/rest/test-catalog/sample-types/1/test-order").with(user("results").roles("RESULTS"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    public void getTerminology_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/tests/1/terminology").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void saveTerminology_nonAdminReturns403() throws Exception {
        mockMvc.perform(put("/rest/test-catalog/tests/1/terminology").with(user("results").roles("RESULTS"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    public void listPanels_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/panels").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void getTestPanels_nonAdminReturns403() throws Exception {
        mockMvc.perform(get("/rest/test-catalog/tests/1/panels").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
    }

    @Test
    public void saveTestPanels_nonAdminReturns403() throws Exception {
        mockMvc.perform(put("/rest/test-catalog/tests/1/panels").with(user("results").roles("RESULTS"))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    static class TestConfig {
        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults())
                    .csrf(csrf -> csrf.disable());
            return http.build();
        }

        @Bean
        org.openelisglobal.testcatalog.service.TestCatalogBasicInfoService basicInfoService() {
            var service = mock(org.openelisglobal.testcatalog.service.TestCatalogBasicInfoService.class);
            org.mockito.Mockito.when(service.save(org.mockito.ArgumentMatchers.eq("999999"),
                    org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                    .thenThrow(new java.util.NoSuchElementException());
            return service;
        }

        @Bean
        TestService testService() {
            return mock(TestService.class);
        }

        @Bean
        TestCatalogEditorRestController testCatalogEditorRestController(TestService testService) {
            // Only the auth ordering is under test; the section services are unused here.
            return new TestCatalogEditorRestController(testService, mock(TestResultComponentService.class),
                    mock(TestResultInterpretationService.class), mock(TestResultService.class),
                    mock(ResultLimitService.class), mock(RangeCoverageValidationService.class),
                    mock(TestSampleHandlingService.class), mock(AnalyzerService.class),
                    mock(AnalyzerTestMappingService.class), mock(TypeOfSampleService.class),
                    mock(TypeOfSampleTestService.class), mock(TestTerminologyMappingService.class),
                    mock(PanelService.class), mock(PanelItemService.class));
        }
    }
}
