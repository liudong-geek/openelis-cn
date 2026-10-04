package org.openelisglobal.testcalculated.controller.rest;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.EntityManagerFactory;
import org.junit.Test;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.testcalculated.service.ResultCalculationService;
import org.openelisglobal.testcalculated.service.TestCalculationService;
import org.openelisglobal.testreflex.controller.rest.TestReflexRuleRestController;
import org.openelisglobal.testreflex.service.ReflexRuleConfigurationService;
import org.openelisglobal.testreflex.service.TestReflexService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
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
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@WebAppConfiguration
@ContextConfiguration(classes = RuleConfigurationSecurityTest.TestConfig.class)
@TestPropertySource("classpath:common.properties")
public class RuleConfigurationSecurityTest extends SecuritySliceMockMvcTest {
    @Autowired
    private ReflexRuleConfigurationService reflex;
    @Autowired
    private TestCalculationService calculated;
    @Autowired
    private TestReflexService reader;

    @Test
    public void anonymousCannotReadOrWriteConfiguration() throws Exception {
        mockMvc.perform(get("/rest/reflexrules")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/rest/test-calculation").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        verifyZeroInteractions(reflex, calculated, reader);
    }

    @Test
    public void dataRolesCannotReadOrWriteAnyRuleEndpoint() throws Exception {
        for (String role : new String[] { "RESULTS", "VALIDATION", "RECEPTION" }) {
            for (String path : new String[] { "/rest/reflexrules", "/rest/reflexrule/1", "/rest/reflexrule-options",
                    "/rest/test-calculations", "/rest/test-calculation/1", "/rest/math-functions" }) {
                mockMvc.perform(get(path).with(user("data").roles(role))).andExpect(status().isForbidden());
            }
            for (String path : new String[] { "/rest/reflexrule", "/rest/activate-reflexrule/1",
                    "/rest/deactivate-reflexrule/1", "/rest/test-calculation", "/rest/activate-test-calculation/1",
                    "/rest/deactivate-test-calculation/1" }) {
                mockMvc.perform(
                        post(path).with(user("data").roles(role)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                        .andExpect(status().isForbidden());
            }
        }
        verifyZeroInteractions(reflex, calculated, reader);
    }

    @Test
    public void administratorReachesConfigurationService() throws Exception {
        when(reflex.get(991)).thenThrow(org.openelisglobal.testcalculated.service.RuleConfigurationValidation.missing());
        mockMvc.perform(get("/rest/reflexrule/991").with(user("admin").roles("ADMIN")))
                .andExpect(status().isNotFound());
        verify(reflex).get(991);
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    public static class TestConfig {
        @Bean
        SecurityFilterChain filters(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults())
                    .csrf(csrf -> csrf.disable());
            return http.build();
        }

        @Bean
        EntityManagerFactory entityManagerFactory() {
            return mock(EntityManagerFactory.class);
        }

        @Bean
        static org.springframework.beans.factory.config.BeanFactoryPostProcessor registerReflexConfigurationMock() {
            // Register the mock directly: bean post-processing must not inject the real
            // service's private collaborators into a Mockito subclass.
            return factory -> factory.registerSingleton("reflexConfiguration",
                    mock(ReflexRuleConfigurationService.class));
        }

        @Bean
        TestCalculationService testCalculationService() {
            return mock(TestCalculationService.class);
        }

        @Bean
        TestReflexService testReflexService() {
            return mock(TestReflexService.class);
        }

        @Bean
        TypeOfSampleService types() {
            return mock(TypeOfSampleService.class);
        }

        @Bean
        DictionaryService dictionary() {
            return mock(DictionaryService.class);
        }

        @Bean
        PatientService patients() {
            return mock(PatientService.class);
        }

        @Bean
        ResultService results() {
            return mock(ResultService.class);
        }

        @Bean
        ResultCalculationService calculations() {
            return mock(ResultCalculationService.class);
        }

        @Bean
        TestReflexRuleRestController reflexController() {
            return new TestReflexRuleRestController();
        }

        @Bean
        CalculatedValueRestController calculationController() {
            return new CalculatedValueRestController();
        }
    }
}
