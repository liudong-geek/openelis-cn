package org.openelisglobal.testconfiguration.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSDuplicateRecordException;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemusermodule.valueholder.RoleModule;
import org.openelisglobal.testconfiguration.controller.rest.SampleTypeCreateRestController;
import org.openelisglobal.testconfiguration.service.SampleTypeCreateService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.view.PageBuilderService;
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
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@WebAppConfiguration
@ContextConfiguration(classes = SampleTypeCreateRestContractTest.TestConfig.class)
public class SampleTypeCreateRestContractTest extends SecuritySliceMockMvcTest {
    private static final String LEGACY = "{\"sampleTypeEnglishName\":\"Serum\",\"sampleTypeFrenchName\":\"Serum FR\"}";
    @Autowired
    private SampleTypeCreateService creates;
    @Autowired
    private RoleService roles;

    @Before
    public void prepare() {
        reset(creates, roles);
        when(roles.getRoleByName("Results")).thenReturn(role("4"));
        when(roles.getRoleByName("Validation")).thenReturn(role("6"));
        doAnswer(call -> {
            ((TypeOfSample) call.getArgument(1)).setId("777");
            return null;
        }).when(creates).createAndInsertSampleType(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    public void unauthenticatedCannotCreate() throws Exception {
        mockMvc.perform(post("/rest/SampleTypeCreate").contentType(MediaType.APPLICATION_JSON).content(LEGACY))
                .andExpect(status().isUnauthorized());
        verifyNoWrites();
    }

    @Test
    public void nonAdminCannotCreate() throws Exception {
        mockMvc.perform(post("/rest/SampleTypeCreate").with(user("results").roles("RESULTS"))
                .contentType(MediaType.APPLICATION_JSON).content(LEGACY)).andExpect(status().isForbidden());
        verifyNoWrites();
    }

    @Test
    public void jakartaNotBlankRejectsMissingEnglishBeforeWrite() throws Exception {
        mockMvc.perform(admin("{\"sampleTypeFrenchName\":\"Serum FR\"}")).andExpect(status().isBadRequest());
        verifyNoWrites();
    }

    @Test
    public void jakartaNotBlankRejectsBlankFrenchBeforeWrite() throws Exception {
        mockMvc.perform(admin("{\"sampleTypeEnglishName\":\"Serum\",\"sampleTypeFrenchName\":\"  \"}"))
                .andExpect(status().isBadRequest());
        verifyNoWrites();
    }

    @Test
    public void effectiveInternalNameRejectsFortyOneCharactersBeforeWrite() throws Exception {
        mockMvc.perform(admin("{\"sampleTypeEnglishName\":\"" + "A".repeat(41) + "\",\"sampleTypeFrenchName\":\"FR\"}"))
                .andExpect(status().isBadRequest());
        verifyNoWrites();
    }

    @Test
    public void legacyFormReturnsRealIdAndKeepsDefaultInactive() throws Exception {
        mockMvc.perform(admin(LEGACY)).andExpect(status().isOk())
                .andExpect(jsonPath("$.createdSampleTypeId").value("777"));
        org.mockito.ArgumentCaptor<TypeOfSample> type = org.mockito.ArgumentCaptor.forClass(TypeOfSample.class);
        verify(creates).createAndInsertSampleType(any(), type.capture(), any(), any(), any(), any(), any(), any());
        assertEquals("Serum", type.getValue().getDescription());
        assertFalse(type.getValue().getIsActive());
        assertEquals(Integer.MAX_VALUE, type.getValue().getSortOrder());
    }

    @Test
    public void chineseAndInternalNamesInitializeExactlyTheExistingThreeGrants() throws Exception {
        doAnswer(call -> {
            Localization names = call.getArgument(0);
            TypeOfSample type = call.getArgument(1);
            assertEquals("Serum English", names.getEnglish());
            assertEquals("Serum FR", names.getFrench());
            assertEquals("血清标本", names.getLocalizedValue(java.util.Locale.CHINESE));
            assertEquals("Serum_Internal", type.getDescription());
            assertEquals("Serum_Inte", type.getLocalAbbreviation());
            assertEquals("1", type.getSysUserId());
            names.getValues().values().forEach(value -> assertEquals("1", value.getSysUserId()));
            String[] modules = { "Workplan", "LogbookResults", "ResultValidation" };
            for (int i = 0; i < 3; i++) {
                SystemModule module = call.getArgument(i + 2);
                RoleModule grant = call.getArgument(i + 5);
                assertEquals(modules[i] + ":Serum_Internal", module.getSystemModuleName());
                assertSame(module, grant.getSystemModule());
                assertEquals(i == 2 ? "6" : "4", grant.getRole().getId());
                assertEquals("Y", grant.getHasAdd());
                assertEquals("Y", grant.getHasDelete());
                assertEquals("Y", grant.getHasSelect());
                assertEquals("Y", grant.getHasUpdate());
                assertEquals("1", module.getSysUserId());
                assertEquals("1", grant.getSysUserId());
            }
            type.setId("777");
            return null;
        }).when(creates).createAndInsertSampleType(any(), any(), any(), any(), any(), any(), any(), any());
        mockMvc.perform(admin("{\"sampleTypeEnglishName\":\"Serum English\",\"sampleTypeFrenchName\":\"Serum FR\","
                + "\"nameZh\":\"血清标本\",\"identifyingName\":\"Serum_Internal\",\"createdSampleTypeId\":\"888\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdSampleTypeId").value("777"));
    }

    @Test
    public void duplicateReturns409WithoutSuccessId() throws Exception {
        doThrow(new LIMSDuplicateRecordException("duplicate")).when(creates).createAndInsertSampleType(any(), any(),
                any(), any(), any(), any(), any(), any());
        mockMvc.perform(admin(LEGACY)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.createdSampleTypeId").doesNotExist());
    }

    @Test
    public void failureReturns500WithoutSuccessId() throws Exception {
        doThrow(new LIMSRuntimeException("database failure")).when(creates).createAndInsertSampleType(any(), any(),
                any(), any(), any(), any(), any(), any());
        mockMvc.perform(admin(LEGACY)).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.createdSampleTypeId").doesNotExist());
    }

    private void verifyNoWrites() {
        verify(creates, never()).createAndInsertSampleType(any(), any(), any(), any(), any(), any(), any(), any());
    }

    private MockHttpServletRequestBuilder admin(String body) {
        UserSessionData session = new UserSessionData();
        session.setSytemUserId(1);
        return post("/rest/SampleTypeCreate").with(user("admin").roles("ADMIN"))
                .sessionAttr(IActionConstants.USER_SESSION_DATA, session).contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private Role role(String id) {
        Role role = new Role();
        role.setId(id);
        return role;
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    static class TestConfig implements org.springframework.web.servlet.config.annotation.WebMvcConfigurer {
        @Bean
        SecurityFilterChain security(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults())
                    .csrf(csrf -> csrf.disable());
            return http.build();
        }

        @Bean
        LocalValidatorFactoryBean validator() {
            var validator = new LocalValidatorFactoryBean();
            validator.setMessageInterpolator(
                    new org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator());
            return validator;
        }

        @Override
        public org.springframework.validation.Validator getValidator() {
            return validator();
        }

        @Bean
        SampleTypeCreateRestController controller() {
            return new SampleTypeCreateRestController();
        }

        @Bean
        SampleTypeCreateService creates() {
            return mock(SampleTypeCreateService.class);
        }

        @Bean
        TypeOfSampleService types() {
            return mock(TypeOfSampleService.class);
        }

        @Bean
        RoleService roles() {
            return mock(RoleService.class);
        }

        @Bean
        UserModuleService userModules() {
            return mock(UserModuleService.class);
        }

        @Bean
        PageBuilderService pages() {
            return mock(PageBuilderService.class);
        }
    }
}
