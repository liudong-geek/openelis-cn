package org.openelisglobal.report.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.*;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.report.form.ReportApplicationSummary;
import org.openelisglobal.report.service.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class ReportFrozenHttpContractTest {
    private PatientReportReleaseService releases;
    private ReportDocumentService documents;
    private MockMvc mvc;
    private MockHttpSession session;

    @Before
    public void setup() {
        releases = mock(PatientReportReleaseService.class);
        documents = mock(ReportDocumentService.class);
        var controller = new ReportDocumentRestController();
        ReflectionTestUtils.setField(controller, "releases", releases);
        ReflectionTestUtils.setField(controller, "documents", documents);
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
        session = new MockHttpSession();
        var actor = new UserSessionData();
        actor.setSytemUserId(7);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
    }

    @Test public void applicationSelectorReturnsCanonicalIdsWithNoCache() throws Exception {
        when(documents.getApplications("101", "7")).thenReturn(List.of(new ReportApplicationSummary("101", "301", "SIM-301")));
        mvc.perform(get("/rest/reports/applications?patientId=101").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sampleId").value("301")).andExpect(jsonPath("$[0].patientId").value("101"))
                .andExpect(header().string("Cache-Control", "no-store, private"));
    }

    @Test
    public void documentDraftFreezeAndSnapshotPassOnlyServerActorAndUrlIdentity() throws Exception {
        mvc.perform(post("/rest/reports/documents/201/releases").session(session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"amendmentReason\":\"SIM change\"}"))
                .andExpect(status().isOk());
        verify(releases).createDocumentDraft("201", "SIM change", "7");
        mvc.perform(post("/rest/reports/documents/201/releases/10/freeze").session(session)).andExpect(status().isOk());
        verify(releases).freeze("201", 10L, "7");
        mvc.perform(get("/rest/reports/documents/201/releases/10/snapshot").session(session))
                .andExpect(status().isOk());
        verify(releases).getSnapshot("201", 10L, "7");
    }

    @Test
    public void issuePassesPasswordHashAndServerActorToSingleTransactionService() throws Exception {
        mvc.perform(post("/rest/reports/documents/201/releases/10/issue").session(session)
                .contentType(MediaType.APPLICATION_JSON).header("User-Agent", "SIM-UA")
                .content("{\"snapshotSha256\":\"hash\",\"password\":\"SIM-SECRET\"}")).andExpect(status().isOk())
                .andExpect(content().string(""));
        verify(releases).issueDocument("201", 10L, "hash", "SIM-SECRET", "7", "127.0.0.1", "SIM-UA");
        verify(releases, never()).issue(any(), any(), any());
    }

    @Test
    public void voidPassesExpectedOriginalHashAndReasonToSingleTransactionService() throws Exception {
        mvc.perform(post("/rest/reports/documents/201/releases/10/void").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedPdfSha256\":\"hash\",\"password\":\"SIM-SECRET\",\"reason\":\"SIM void\"}"))
                .andExpect(status().isOk());
        verify(releases).voidDocument("201", 10L, "hash", "SIM-SECRET", "SIM void", "7", "127.0.0.1", null);
    }

    @Test public void sourceConflictReturns409AndNoCredentials() throws Exception {
        when(releases.issueDocument(any(), any(), any(), any(), any(), any(), any())).thenThrow(new IllegalStateException("Report source changed"));
        mvc.perform(post("/rest/reports/documents/201/releases/10/issue").session(session).contentType(MediaType.APPLICATION_JSON)
                .content("{\"snapshotSha256\":\"hash\",\"password\":\"SIM-SECRET\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("REPORT_STATE_CONFLICT"))
                .andExpect(jsonPath("$.message").value("Report source changed"));
    }

    @Test public void frozenPreviewIsClearlyUnissuedAndNeverPrintAudited() throws Exception {
        when(releases.previewFrozen("201", 10L, "7")).thenReturn(new byte[] {37,80,68,70});
        mvc.perform(get("/rest/reports/documents/201/releases/10/preview.pdf").session(session)).andExpect(status().isOk())
                .andExpect(header().string("X-Report-Type", "FROZEN_PREVIEW"))
                .andExpect(header().doesNotExist("X-Report-Print-Audit"));
        verify(releases, never()).recordPrint(any(), any(), any());
    }
}
