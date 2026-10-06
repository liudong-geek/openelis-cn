package org.openelisglobal.workplan;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.*;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.workplan.controller.rest.*;
import org.openelisglobal.workplan.form.*;
import org.openelisglobal.workplan.service.*;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

public class WorkplanQueryMvcTest {
    private WorkplanQueryService service;
    private WorkplanReportService reports;
    private MockMvc mvc;

    @Before
    public void setup() {
        service = mock(WorkplanQueryService.class);
        reports = mock(WorkplanReportService.class);
        mvc = MockMvcBuilders.standaloneSetup(new WorkplanQueryRestController(service, reports)).build();
    }

    private String body() {
        return "{\"pageSnapshot\":\"" + "0".repeat(64)
                + "\",\"type\":\"test\",\"filterId\":\"11\",\"page\":2,\"pageSize\":10,\"analyses\":[{\"analysisId\":\"1\",\"sampleId\":\"31\",\"sampleItemId\":\"41\",\"testId\":\"11\",\"accessionNumber\":\"HMC26092800001\",\"statusId\":\"4\",\"lastupdated\":\"2026-10-06T08:00:00.123456Z\"}]}";
    }

    @Test
    public void completePageQueryReachesServiceWithoutSessionPageBranch() throws Exception {
        mvc.perform(get("/rest/Workplan").param("queryVersion", "2").param("type", "panel").param("filterId", "17")
                .param("page", "2").param("pageSize", "10")).andExpect(status().isOk());
        var capture = ArgumentCaptor.forClass(WorkplanQueryRequest.class);
        verify(service).query(any(), capture.capture());
        assertEquals(new WorkplanQueryRequest("panel", "17", 2, 10), capture.getValue());
    }

    @Test
    public void malformedDuplicateAndUnknownFiltersFailBeforeService() throws Exception {
        for (var request : List.of(
                get("/rest/Workplan").param("queryVersion", "2").param("type", "other").param("filterId", "17"),
                get("/rest/Workplan").param("queryVersion", "2").param("type", "test").param("filterId", "17")
                        .param("page", "1", "2"),
                get("/rest/Workplan").param("queryVersion", "2").param("type", "test").param("filterId", "17")
                        .param("actor", "99"),
                get("/rest/Workplan").param("queryVersion", "3")))
            mvc.perform(request).andExpect(status().isBadRequest());
        verifyZeroInteractions(service, reports);
    }

    @Test
    public void currentModuleDenialAndStaleSelectionAreExplicit() throws Exception {
        doThrow(new AccessDeniedException("workplan.permissionDenied")).when(service).preparePrint(any(), any());
        mvc.perform(post("/rest/PrintWorkplanReport").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("workplan.permissionDenied"));
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "workplan.selectionChanged")).when(service)
                .preparePrint(any(), any());
        mvc.perform(post("/rest/PrintWorkplanReport").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("workplan.selectionChanged"));
        verifyZeroInteractions(reports);
    }

    @Test
    public void clientContentsAndUnknownIdentityFieldsAreRejected() throws Exception {
        for (String b : List.of(body().replace("\"analyses\":", "\"testName\":\"client forged title\",\"analyses\":"),
                body().replace("\"analysisId\":", "\"patientInfo\":\"forged\",\"analysisId\":"))) {
            mvc.perform(post("/rest/PrintWorkplanReport").param("queryVersion", "2")
                    .contentType(MediaType.APPLICATION_JSON).content(b)).andExpect(status().isBadRequest());
        }
        verifyZeroInteractions(service, reports);
    }

    @Test
    public void rendererReceivesOnlyFreshServerResponseAndHasPdfHeader() throws Exception {
        var response = new WorkplanQueryResponse("2", "7", new WorkplanQueryRequest("test", "11", 2, 10),
                new WorkplanQueryResponse.EffectiveScope("Results", List.of("11")),
                new WorkplanQueryResponse.Paging("2", "2", 18, 10), List.of(), "server title", true, "0".repeat(64));
        when(service.preparePrint(any(), any())).thenReturn(response);
        when(reports.render(response)).thenReturn(new byte[] { 37, 80, 68, 70 });
        mvc.perform(post("/rest/PrintWorkplanReport").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isOk()).andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(content().bytes(new byte[] { 37, 80, 68, 70 }));
        var capture = ArgumentCaptor.forClass(WorkplanPrintRequest.class);
        verify(service).preparePrint(any(), capture.capture());
        assertEquals("2", capture.getValue().getPage());
        assertEquals("1", capture.getValue().getAnalyses().get(0).getAnalysisId());
        verify(reports).render(response);
    }

 @Test public void dataFailureDoesNotBecomeSuccessfulEmptyList()throws Exception{when(service.query(any(),any())).thenThrow(new IllegalStateException("database down"));mvc.perform(get("/rest/Workplan").param("queryVersion","2").param("type","test").param("filterId","11")).andExpect(status().isInternalServerError()).andExpect(jsonPath("$.errorCode").value("workplan.queryUnavailable"));}
}
