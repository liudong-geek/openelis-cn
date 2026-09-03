package org.openelisglobal.referral.controller.rest;

import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.Test;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.referral.service.ReferralService;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.view.PageBuilderService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
@ContextConfiguration(classes = { ReferredOutTestsRestControllerSecurityTest.TestConfig.class })
@TestPropertySource("classpath:common.properties")
public class ReferredOutTestsRestControllerSecurityTest extends SecuritySliceMockMvcTest {

    @Test
    public void search_withoutAuthenticationReturns401() throws Exception {
        mockMvc.perform(get("/rest/ReferredOutTests")).andExpect(status().isUnauthorized());
    }

    @Test
    public void search_withoutResultsRoleReturns403() throws Exception {
        mockMvc.perform(get("/rest/ReferredOutTests").with(user("reception").roles("RECEPTION")))
                .andExpect(status().isForbidden());
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
        ReferralService referralService() {
            return mock(ReferralService.class);
        }

        @Bean
        UserModuleService userModuleService() {
            return mock(UserModuleService.class);
        }

        @Bean
        PageBuilderService pageBuilderService() {
            return mock(PageBuilderService.class);
        }

        @Bean
        ReferredOutTestsRestController referredOutTestsRestController() {
            return new ReferredOutTestsRestController();
        }
    }
}
