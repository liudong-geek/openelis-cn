package org.openelisglobal.qachecklist.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.qachecklist.service.SampleQaChecklistService;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Real MVC parser boundary, mock service only. */
public class QaChecklistConfirmationControllerTest {
    private SampleQaChecklistService service;
    private MockMvc mvc;
    private static final String URL = "/rest/qa-checklist/confirm-current";

    @Before
    public void setup() {
        service = mock(SampleQaChecklistService.class);
        mvc = MockMvcBuilders.standaloneSetup(new QaChecklistConfirmationRestController(service)).build();
    }

    @Test
    public void duplicateJsonKeyIsRejectedBeforeService() throws Exception {
        mvc.perform(post(URL).contentType("application/json").content("{\"sampleId\":\"1\",\"sampleId\":\"2\"}"))
                .andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }

    @Test
    public void trailingDocumentIsRejectedBeforeService() throws Exception {
        mvc.perform(post(URL).contentType("application/json").content("{} {}")).andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }

    @Test
    public void invalidUtf8IsRejectedBeforeService() throws Exception {
        mvc.perform(post(URL).contentType("application/json").content(new byte[] { (byte) 0xc3, (byte) 0x28 }))
                .andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }

    @Test
    public void oversizedRequestIsRejectedBeforeService() throws Exception {
        mvc.perform(post(URL).contentType("application/json").content(" ".repeat(65537)))
                .andExpect(status().isPayloadTooLarge());
        verifyZeroInteractions(service);
    }

    @Test public void noStoreAppliesToSuccessfulAcknowledgement() throws Exception {
        when(service.confirmCurrentChecklist(any(),any())).thenReturn(Map.of("readbackRequired",true));
        var response=mvc.perform(post(URL).contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertEquals("no-store",response.getHeader("Cache-Control"));
        verify(service).confirmCurrentChecklist(any(),any());
    }

    @Test public void unknownFailureDoesNotPromiseRollbackOrEncourageRetry() throws Exception {
        when(service.confirmCurrentChecklist(any(),any())).thenThrow(new IllegalStateException("SIM-store"));
        var response=mvc.perform(post(URL).contentType("application/json").content("{}"))
                .andExpect(status().isInternalServerError()).andReturn().getResponse();
        assertEquals("no-store",response.getHeader("Cache-Control"));
        assertTrue(response.getContentAsString(StandardCharsets.UTF_8).contains("不要重复提交"));
    }
}
