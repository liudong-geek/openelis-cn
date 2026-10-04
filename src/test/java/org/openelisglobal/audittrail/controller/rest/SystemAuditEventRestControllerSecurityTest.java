package org.openelisglobal.audittrail.controller.rest;

import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.EntityManagerFactory;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.audittrail.service.AuditEntitySnapshotService;
import org.openelisglobal.history.service.HistoryService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.beans.factory.annotation.Autowired;
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
@ContextConfiguration(classes = SystemAuditEventRestControllerSecurityTest.TestConfig.class)
@TestPropertySource("classpath:common.properties")
public class SystemAuditEventRestControllerSecurityTest extends SecuritySliceMockMvcTest {

    @Autowired
    private HistoryService historyService;

    @Autowired
    private PatientService patientService;

    @Before
    public void clearDataReadInvocations() {
        clearInvocations(historyService, patientService);
    }

    @Test
    public void auditQueryWithoutAuthenticationReturns401() throws Exception {
        mockMvc.perform(get("/rest/systemAuditEvents")).andExpect(status().isUnauthorized());
        verifyNoMoreInteractions(historyService, patientService);
    }

    @Test
    public void auditQueryWithOrdinaryRoleReturns403() throws Exception {
        mockMvc.perform(get("/rest/systemAuditEvents").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
        verifyNoMoreInteractions(historyService, patientService);
    }

    @Test
    public void auditQueryWithAdminAndNoRegisteredTablesReturnsAnEmptyResult() throws Exception {
        // Every reference-table lookup returns null, so the real controller must
        // short-circuit safely rather than query all history records.
        mockMvc.perform(get("/rest/systemAuditEvents").with(user("admin").roles("ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.events").isEmpty()).andExpect(jsonPath("$.totalItems").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));
        verifyNoMoreInteractions(historyService, patientService);
    }

    @Test
    public void csvExportWithOrdinaryRoleReturns403() throws Exception {
        mockMvc.perform(get("/rest/systemAuditEvents/export").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
        verifyNoMoreInteractions(historyService, patientService);
    }

    @Test
    public void pdfExportWithOrdinaryRoleReturns403() throws Exception {
        mockMvc.perform(get("/rest/systemAuditEvents/exportPdf").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
        verifyNoMoreInteractions(historyService, patientService);
    }

    @Test
    public void patientScopedQueryWithOrdinaryRoleReturns403BeforeReadingPatientOrHistory() throws Exception {
        mockMvc.perform(get("/rest/systemAuditEvents").param("patientId", "123").with(user("results").roles("RESULTS")))
                .andExpect(status().isForbidden());
        verifyNoMoreInteractions(patientService, historyService);
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
        SystemAuditEventRestController controller() {
            return new SystemAuditEventRestController();
        }

        @Bean
        HistoryService historyService() {
            return mock(HistoryService.class);
        }

        @Bean
        ReferenceTablesService referenceTablesService() {
            return mock(ReferenceTablesService.class);
        }

        @Bean
        SystemUserService systemUserService() {
            return mock(SystemUserService.class);
        }

        @Bean
        PatientService patientService() {
            return mock(PatientService.class);
        }

        @Bean
        EntityManagerFactory entityManagerFactory() {
            return mock(EntityManagerFactory.class);
        }

        @Bean
        AuditEntitySnapshotService snapshotService() {
            return mock(AuditEntitySnapshotService.class);
        }
    }
}
