package org.openelisglobal.report.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.service.ReportGroupingConfigurationService;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * HTTP contract tests; domain authorization is tested separately with the real
 * authorization service.
 */
public class ReportDocumentRestControllerTest {
    private final ReportDocumentService documents = mock(ReportDocumentService.class);
    private final PatientReportReleaseService releases = mock(PatientReportReleaseService.class);
    private final ReportGroupingConfigurationService configuration = mock(ReportGroupingConfigurationService.class);
    private MockMvc mvc;
    private MockHttpSession session;

    @Before
    public void setup() {
        var controller = new ReportDocumentRestController();
        ReflectionTestUtils.setField(controller, "documents", documents);
        ReflectionTestUtils.setField(controller, "releases", releases);
        ReflectionTestUtils.setField(controller, "configuration", configuration);
        var patientController = new PatientReportRestController();
        ReflectionTestUtils.setField(patientController, "patientReportReleaseService", releases);
        mvc = MockMvcBuilders.standaloneSetup(controller, patientController).build();
        session = new MockHttpSession();
        var user = new UserSessionData();
        user.setSytemUserId(7);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, user);
    }

    @Test public void prepareAcceptsOnlyApplicationAndConfiguredGroupForServerResolution() throws Exception {
        when(documents.prepare("301", "SIM-CHEM", "7")).thenReturn(new ReportDocumentSummary("201", "101", "301", "SIM-CHEM", "SIM-1", "BG-SIM", null, List.of("401", "402")));
        mvc.perform(post("/rest/reports/documents").session(session).contentType(MediaType.APPLICATION_JSON)
                .content("{\"sampleId\":\"301\",\"groupKey\":\"SIM-CHEM\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.analysisIds[1]").value("402"));
        verify(documents).prepare("301", "SIM-CHEM", "7");
    }

    @Test
    public void historicalPatientDraftRequestIsRejectedBeforeService() throws Exception {
        mvc.perform(post("/rest/reports/patient-results/releases/drafts").session(session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"patientId\":\"101\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("EXPLICIT_REPORT_DOCUMENT_REQUIRED"));
        verify(releases, never()).createDocumentDraft(any(), any(), any());
    }

    @Test
    public void explicitDocumentDraftAndHistoryUseDocumentIdentityAndCurrentActor() throws Exception {
        mvc.perform(post("/rest/reports/patient-results/releases/drafts").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"documentId\":\"201\",\"amendmentReason\":\"SIM correction\"}")).andExpect(status().isOk());
        verify(releases).createDocumentDraft("201", "SIM correction", "7");
        mvc.perform(get("/rest/reports/documents/201/releases").session(session)).andExpect(status().isOk());
        verify(releases).getByDocument("201", "7");
    }

    @Test
    public void legacyPatientHistoryCannotBypassDocumentSelection() throws Exception {
        mvc.perform(get("/rest/reports/patient-results/releases?patientId=101").session(session))
                .andExpect(status().isConflict());
        verify(releases, never()).getByDocument(anyString(), anyString());
    }

    @Test public void configurationConflictIsAnExplicit409() throws Exception {
        when(configuration.getRules()).thenThrow(new IllegalStateException("Report grouping is not configured"));
        mvc.perform(get("/rest/reports/group-rules").session(session)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("REPORT_STATE_CONFLICT"));
    }

    @Test
    public void roleAnnotationsSeparateReportPreparationFromConfigurationAdministration() throws Exception {
        assertEquals("hasRole('REPORTS')",
                ReportDocumentRestController.class.getAnnotation(PreAuthorize.class).value());
        var method = ReportDocumentRestController.class.getMethod("configure",
                ReportDocumentRestController.ConfigureRequest.class, jakarta.servlet.http.HttpServletRequest.class);
        assertEquals("hasRole('ADMIN')", method.getAnnotation(PreAuthorize.class).value());
        assertEquals("hasRole('ADMIN')",
                ReportGroupingConfigurationService.class.getMethod("configure", String.class, List.class, String.class)
                        .getAnnotation(PreAuthorize.class).value());
    }
}
