package org.openelisglobal.qc.controller;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.openelisglobal.analyzer.service.QCProcessingResult;
import org.openelisglobal.analyzer.service.QCStagingService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.security.SecuritySliceMockMvcTest;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@WebAppConfiguration
@ContextConfiguration(classes = QCImportRestControllerSecurityTest.TestConfig.class)
@TestPropertySource("classpath:common.properties")
public class QCImportRestControllerSecurityTest extends SecuritySliceMockMvcTest {

    private static final String URL = "/rest/qc/imports";
    private static final String ID = "301";
    private static final String USER_ID = "17";

    @Autowired
    private QCStagingService stagingService;

    @Before
    public void resetService() {
        reset(stagingService);
        when(stagingService.readOutcome(anyString()))
                .thenReturn(QCProcessingResult.notProcessed("QC_PROCESSING_PENDING"));
    }

    @Test
    public void anonymousRequestsAreRejectedBeforeBusinessProcessing() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(URL + "/" + ID)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(URL + "/" + ID + "/reprocess").with(csrf())).andExpect(status().isUnauthorized());
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void clinicalResultsAndInstrumentImportRolesCannotReadOrReprocessQc() throws Exception {
        for (String role : List.of("RESULTS", "ANALYSER_IMPORT")) {
            mockMvc.perform(get(URL).with(user("operator").roles(role))).andExpect(status().isForbidden());
            mockMvc.perform(get(URL + "/" + ID).with(user("operator").roles(role))).andExpect(status().isForbidden());
            mockMvc.perform(post(URL + "/" + ID + "/reprocess").with(user("operator").roles(role)).with(csrf())
                    .sessionAttr(IActionConstants.USER_SESSION_DATA, sessionUser(17)))
                    .andExpect(status().isForbidden());
        }
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void allThreeAuthorizedRolesCanReadWithoutAnApplicationSession() throws Exception {
        when(stagingService.list("OPEN", 20, 0)).thenReturn(Map.of("rows", List.of(), "total", 0));
        for (String role : List.of("ADMIN", "GLOBAL_ADMIN", "LAB_SUPERVISOR")) {
            mockMvc.perform(get(URL).with(user("authorized").roles(role))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(0));
        }
        verify(stagingService, org.mockito.Mockito.times(3)).list("OPEN", 20, 0);
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void supervisorListForwardsExactStatusAndPaging() throws Exception {
        when(stagingService.list("UNKNOWN", 10, 30))
                .thenReturn(Map.of("rows", List.of(Map.of("id", ID, "qcProcessingStatus", "UNKNOWN")), "total", 1));

        mockMvc.perform(get(URL).with(user("supervisor").roles("LAB_SUPERVISOR")).param("status", "UNKNOWN")
                .param("limit", "10").param("offset", "30")).andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].id").value(ID))
                .andExpect(jsonPath("$.rows[0].qcProcessingStatus").value("UNKNOWN"));

        verify(stagingService).list("UNKNOWN", 10, 30);
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void authorizedDetailReadUsesTheRequestedRecordWithoutAnApplicationSession() throws Exception {
        when(stagingService.get(ID)).thenReturn(Map.of("id", ID, "qcProcessingStatus", "NOT_PROCESSED"));
        mockMvc.perform(get(URL + "/" + ID).with(user("supervisor").roles("LAB_SUPERVISOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(ID));
        verify(stagingService).get(ID);
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void malformedOrOutOfRangePagingIsRejectedBeforeQuerying() throws Exception {
        for (Map<String, String> invalid : List.of(Map.of("limit", "0"), Map.of("limit", "101"), Map.of("offset", "-1"),
                Map.of("limit", "abc"), Map.of("offset", "abc"))) {
            MockHttpServletRequestBuilder request = get(URL).with(user("supervisor").roles("LAB_SUPERVISOR"));
            invalid.forEach(request::param);
            mockMvc.perform(request).andExpect(status().isBadRequest());
        }
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void unsupportedStatusReturnsBadRequestWithoutProcessing() throws Exception {
        when(stagingService.list("INVALID", 20, 0)).thenThrow(new IllegalArgumentException("Invalid status"));
        mockMvc.perform(get(URL).with(user("supervisor").roles("LAB_SUPERVISOR")).param("status", "INVALID"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorKey").value("qc.imports.invalidQuery"));
        verify(stagingService).list("INVALID", 20, 0);
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void missingAndInvalidDetailIdsHaveDistinctResponses() throws Exception {
        when(stagingService.get("404")).thenThrow(new NoSuchElementException("Missing"));
        when(stagingService.get("invalid")).thenThrow(new IllegalArgumentException("Invalid id"));
        mockMvc.perform(get(URL + "/404").with(user("supervisor").roles("LAB_SUPERVISOR")))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(URL + "/invalid").with(user("supervisor").roles("LAB_SUPERVISOR")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorKey").value("qc.imports.invalidRecord"));
        verify(stagingService).get("404");
        verify(stagingService).get("invalid");
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void supervisorReprocessUsesSessionActorAndReturnsCreatedReceipt() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenReturn(QCProcessingResult.created("901"));
        mockMvc.perform(reprocess(ID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CREATED")).andExpect(jsonPath("$.qcResultId").value("901"));
        verifyReadThenProcessOnly();
    }

    @Test
    public void notProcessedReceiptPreservesReasonWithoutRetry() throws Exception {
        when(stagingService.process(ID, USER_ID))
                .thenReturn(QCProcessingResult.notProcessed("QC_CONTROL_LOT_NOT_RESOLVED"));
        mockMvc.perform(reprocess(ID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("NOT_PROCESSED"))
                .andExpect(jsonPath("$.reasonCode").value("QC_CONTROL_LOT_NOT_RESOLVED"));
        verifyReadThenProcessOnly();
    }

    @Test
    public void unknownReceiptIsAcceptedWithoutAutomaticReplay() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenReturn(QCProcessingResult.unknown());
        mockMvc.perform(reprocess(ID)).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("UNKNOWN"));
        verifyReadThenProcessOnly();
    }

    @Test
    public void authorizedRoleWithoutApplicationSessionCannotWrite() throws Exception {
        mockMvc.perform(
                post(URL + "/" + ID + "/reprocess").with(user("supervisor").roles("LAB_SUPERVISOR")).with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void defaultOrNegativeSessionUserCannotWrite() throws Exception {
        for (int userId : new int[] { 0, -1 }) {
            mockMvc.perform(post(URL + "/" + ID + "/reprocess").with(user("supervisor").roles("LAB_SUPERVISOR"))
                    .with(csrf()).sessionAttr(IActionConstants.USER_SESSION_DATA, sessionUser(userId)))
                    .andExpect(status().isUnauthorized());
        }
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void requestAttributeCannotSubstituteForApplicationSession() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenReturn(QCProcessingResult.created("901"));
        mockMvc.perform(post(URL + "/" + ID + "/reprocess").with(user("supervisor").roles("LAB_SUPERVISOR"))
                .with(csrf()).requestAttr(IActionConstants.USER_SESSION_DATA, sessionUser(17)))
                .andExpect(status().isUnauthorized());
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void missingCsrfIsRejectedBeforeBusinessProcessing() throws Exception {
        mockMvc.perform(post(URL + "/" + ID + "/reprocess").with(user("supervisor").roles("LAB_SUPERVISOR"))
                .sessionAttr(IActionConstants.USER_SESSION_DATA, sessionUser(17))).andExpect(status().isForbidden());
        verifyZeroInteractions(stagingService);
    }

    @Test
    public void missingOrNonQcRecordIsRejectedBeforeAnyWrite() throws Exception {
        when(stagingService.readOutcome("404")).thenThrow(new NoSuchElementException("Missing"));
        when(stagingService.readOutcome("patient")).thenThrow(new IllegalArgumentException("Not a QC original"));
        mockMvc.perform(reprocess("404")).andExpect(status().isNotFound());
        mockMvc.perform(reprocess("patient")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorKey").value("qc.imports.invalidRecord"));
        verify(stagingService).readOutcome("404");
        verify(stagingService).readOutcome("patient");
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void acknowledgementFailureReadsBackCommittedReceiptWithoutReplaying() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenThrow(new IllegalStateException("Commit response lost"));
        when(stagingService.markUnknown(ID, USER_ID)).thenReturn(QCProcessingResult.created("902"));
        mockMvc.perform(reprocess(ID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CREATED")).andExpect(jsonPath("$.qcResultId").value("902"));
        verifyProcessThenReadbackOnly();
    }

    @Test
    public void unconfirmedReadbackReturnsUnknownAcceptedWithoutReplaying() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenThrow(new IllegalStateException("Commit response lost"));
        when(stagingService.markUnknown(ID, USER_ID)).thenReturn(QCProcessingResult.unknown());
        mockMvc.perform(reprocess(ID)).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("UNKNOWN"));
        verifyProcessThenReadbackOnly();
    }

    @Test
    public void failedReadbackReturnsUnavailableUnknownWithoutReplaying() throws Exception {
        when(stagingService.process(ID, USER_ID)).thenThrow(new IllegalStateException("Commit response lost"));
        when(stagingService.markUnknown(ID, USER_ID)).thenThrow(new IllegalStateException("Database unavailable"));
        mockMvc.perform(reprocess(ID)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("UNKNOWN"))
                .andExpect(jsonPath("$.reasonCode").value("QC_PROCESSING_OUTCOME_UNKNOWN"));
        verifyProcessThenReadbackOnly();
    }

    @Test
    public void lotConfigurationExceptionDuringProcessingUsesUnknownReadback() throws Exception {
        when(stagingService.process(ID, USER_ID))
                .thenThrow(new IllegalArgumentException("Control lot is no longer active"));
        when(stagingService.markUnknown(ID, USER_ID)).thenReturn(QCProcessingResult.unknown());

        mockMvc.perform(reprocess(ID)).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("UNKNOWN"))
                .andExpect(jsonPath("$.reasonCode").value("QC_PROCESSING_OUTCOME_UNKNOWN"));

        verifyProcessThenReadbackOnly();
    }

    @Test
    public void confirmedOrLegacyReadbackReturnsWithoutReprocessing() throws Exception {
        when(stagingService.readOutcome(ID)).thenReturn(QCProcessingResult.created("901"));
        when(stagingService.readOutcome("302"))
                .thenReturn(QCProcessingResult.notProcessed("QC_LEGACY_REVIEW_REQUIRED"));

        mockMvc.perform(reprocess(ID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CREATED")).andExpect(jsonPath("$.qcResultId").value("901"));
        mockMvc.perform(reprocess("302")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("NOT_PROCESSED"))
                .andExpect(jsonPath("$.reasonCode").value("QC_LEGACY_REVIEW_REQUIRED"));

        verify(stagingService).readOutcome(ID);
        verify(stagingService).readOutcome("302");
        verifyNoMoreInteractions(stagingService);
    }

    @Test
    public void unavailableOriginalReadbackReturnsUnknownWithoutStartingAWrite() throws Exception {
        when(stagingService.readOutcome(ID)).thenThrow(new IllegalStateException("Database unavailable"));

        mockMvc.perform(reprocess(ID)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("UNKNOWN"))
                .andExpect(jsonPath("$.reasonCode").value("QC_PROCESSING_OUTCOME_UNKNOWN"));

        verify(stagingService).readOutcome(ID);
        verifyNoMoreInteractions(stagingService);
    }

    private void verifyReadThenProcessOnly() {
        InOrder order = inOrder(stagingService);
        order.verify(stagingService).readOutcome(ID);
        order.verify(stagingService).process(ID, USER_ID);
        verifyNoMoreInteractions(stagingService);
    }

    private void verifyProcessThenReadbackOnly() {
        InOrder order = inOrder(stagingService);
        order.verify(stagingService).readOutcome(ID);
        order.verify(stagingService).process(ID, USER_ID);
        order.verify(stagingService).markUnknown(ID, USER_ID);
        verifyNoMoreInteractions(stagingService);
    }

    private MockHttpServletRequestBuilder reprocess(String id) {
        return post(URL + "/" + id + "/reprocess").with(user("supervisor").roles("LAB_SUPERVISOR")).with(csrf())
                .sessionAttr(IActionConstants.USER_SESSION_DATA, sessionUser(17));
    }

    private UserSessionData sessionUser(int id) {
        UserSessionData session = new UserSessionData();
        session.setSytemUserId(id);
        return session;
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity(prePostEnabled = true)
    static class TestConfig {
        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).httpBasic(Customizer.withDefaults());
            return http.build();
        }

        @Bean
        QCStagingService stagingService() {
            return mock(QCStagingService.class);
        }

        @Bean
        QCImportRestController controller(QCStagingService stagingService) {
            QCImportRestController controller = new QCImportRestController();
            ReflectionTestUtils.setField(controller, "stagingService", stagingService);
            return controller;
        }
    }
}
