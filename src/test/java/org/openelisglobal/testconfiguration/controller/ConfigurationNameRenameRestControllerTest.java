package org.openelisglobal.testconfiguration.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.NoSuchElementException;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.testconfiguration.controller.rest.PanelRenameEntryRestController;
import org.openelisglobal.testconfiguration.controller.rest.TestSectionRenameEntryRestController;
import org.openelisglobal.testconfiguration.form.PanelRenameEntryForm;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;
import org.openelisglobal.testconfiguration.service.ConfigurationNameService;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@WebAppConfiguration
@ContextConfiguration(classes = ConfigurationNameRenameRestControllerTest.TestConfig.class)
@TestPropertySource("classpath:common.properties")
public class ConfigurationNameRenameRestControllerTest extends SecuritySliceMockMvcTest {
    @Autowired
    private ConfigurationNameService names;
    private final DisplayListService displayLists = TestConfig.MOCK_LISTS;

    @Before
    public void resetMocks() {
        reset(names, displayLists);
    }

    @Test
    public void unauthenticatedWritesAreDeniedBeforeBusinessLogic() throws Exception {
        for (String endpoint : new String[] { "PanelRenameEntry", "TestSectionRenameEntry" }) {
            mockMvc.perform(post("/rest/" + endpoint).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isUnauthorized());
        }
        verifyZeroInteractions(names, displayLists);
    }

    @Test
    public void nonAdminWritesAreDeniedBeforeBusinessLogic() throws Exception {
        for (String endpoint : new String[] { "PanelRenameEntry", "TestSectionRenameEntry" }) {
            mockMvc.perform(post("/rest/" + endpoint).with(user("technician").roles("RESULTS"))
                    .contentType(MediaType.APPLICATION_JSON).content(payload(endpoint, "中文名称")))
                    .andExpect(status().isForbidden());
        }
        verifyZeroInteractions(names, displayLists);
    }

    @Test
    public void adminPanelWritePassesChineseAndBusinessIdToService() throws Exception {
        perform("PanelRenameEntry", payload("PanelRenameEntry", "肝功能组合"), 200);
        ArgumentCaptor<PanelRenameEntryForm> capture = ArgumentCaptor.forClass(PanelRenameEntryForm.class);
        verify(names).renamePanel(capture.capture(), eq("12"));
        org.junit.Assert.assertEquals("41", capture.getValue().getPanelId());
        org.junit.Assert.assertEquals("肝功能组合", capture.getValue().getNameChinese());
        org.junit.Assert.assertEquals("French", capture.getValue().getNameFrench());
    }

    @Test
    public void adminGroupWritePassesChineseAndBusinessIdToService() throws Exception {
        perform("TestSectionRenameEntry", payload("TestSectionRenameEntry", "临床生化组"), 200);
        ArgumentCaptor<TestSectionRenameEntryForm> capture = ArgumentCaptor.forClass(TestSectionRenameEntryForm.class);
        verify(names).renameTestSection(capture.capture(), eq("12"));
        org.junit.Assert.assertEquals("73", capture.getValue().getTestSectionId());
        org.junit.Assert.assertEquals("临床生化组", capture.getValue().getNameChinese());
    }

    @Test
    public void oldClientOmittingChineseRemainsCompatible() throws Exception {
        perform("PanelRenameEntry", "{\"panelId\":\"41\",\"nameEnglish\":\"English\",\"nameFrench\":\"French\"}", 200);
        ArgumentCaptor<PanelRenameEntryForm> capture = ArgumentCaptor.forClass(PanelRenameEntryForm.class);
        verify(names).renamePanel(capture.capture(), eq("12"));
        org.junit.Assert.assertNull(capture.getValue().getNameChinese());
    }

    @Test
    public void blankChineseAndHtmlAndInvalidIdReturn400WithoutSaving() throws Exception {
        perform("PanelRenameEntry", payload("PanelRenameEntry", "   "), 400);
        perform("PanelRenameEntry", payload("PanelRenameEntry", "<script>evil()</script>"), 400);
        perform("PanelRenameEntry", payload("PanelRenameEntry", "中文").replace("\"41\"", "\"bad-id\""), 400);
        verifyZeroInteractions(names, displayLists);
    }

    @Test
    public void missingRecordsReturn404InsteadOfSuccess() throws Exception {
        // any(form) is intentional: this HTTP test isolates error translation after
        // valid binding.
        doThrow(new NoSuchElementException("missing")).when(names).renamePanel(any(PanelRenameEntryForm.class),
                eq("12"));
        doThrow(new NoSuchElementException("missing")).when(names)
                .renameTestSection(any(TestSectionRenameEntryForm.class), eq("12"));
        perform("PanelRenameEntry", payload("PanelRenameEntry", "中文"), 404);
        perform("TestSectionRenameEntry", payload("TestSectionRenameEntry", "中文"), 404);
        verifyZeroInteractions(displayLists);
    }

    @Test
    public void persistenceFailuresReturn500InsteadOfSuccess() throws Exception {
        // any(form) is intentional: the service throws for every valid request in this
        // error-path test.
        doThrow(new LIMSRuntimeException("database unavailable")).when(names)
                .renamePanel(any(PanelRenameEntryForm.class), eq("12"));
        doThrow(new LIMSRuntimeException("database unavailable")).when(names)
                .renameTestSection(any(TestSectionRenameEntryForm.class), eq("12"));
        perform("PanelRenameEntry", payload("PanelRenameEntry", "中文"), 500);
        perform("TestSectionRenameEntry", payload("TestSectionRenameEntry", "中文"), 500);
        verifyZeroInteractions(displayLists);
    }

    private void perform(String endpoint, String body, int expected) throws Exception {
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mockMvc.perform(post("/rest/" + endpoint).with(user("admin").roles("ADMIN"))
                .sessionAttr(IActionConstants.USER_SESSION_DATA, actor).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().is(expected));
    }

    private String payload(String endpoint, String chinese) {
        String id = endpoint.equals("PanelRenameEntry") ? "\"panelId\":\"41\"" : "\"testSectionId\":\"73\"";
        return "{" + id + ",\"nameEnglish\":\"English\",\"nameFrench\":\"French\",\"nameChinese\":\"" + chinese + "\"}";
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    static class TestConfig implements WebMvcConfigurer {
        @Bean
        LocalValidatorFactoryBean validator() {
            // The slice has no Jakarta EL implementation; Tomcat supplies it in production.
            LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
            validator.setMessageInterpolator(new ParameterMessageInterpolator());
            return validator;
        }

        @Override
        public org.springframework.validation.Validator getValidator() {
            return validator();
        }

        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults())
                    .csrf(csrf -> csrf.disable());
            return http.build();
        }

        @Bean
        ConfigurationNameService names() {
            return mock(ConfigurationNameService.class);
        }

        @Bean
        UserModuleService userModuleService() {
            return mock(UserModuleService.class);
        }

        @Bean
        PageBuilderService pageBuilderService() {
            return mock(PageBuilderService.class);
        }

        static final DisplayListService MOCK_LISTS = mock(DisplayListService.class);

        @Bean
        PanelRenameEntryRestController panelController(ConfigurationNameService names) {
            return new PanelRenameEntryRestController(names, MOCK_LISTS);
        }

        @Bean
        TestSectionRenameEntryRestController sectionController(ConfigurationNameService names) {
            return new TestSectionRenameEntryRestController(names, MOCK_LISTS);
        }
    }
}
