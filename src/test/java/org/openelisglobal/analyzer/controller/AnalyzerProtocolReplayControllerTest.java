package org.openelisglobal.analyzer.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analyzer.service.AnalyzerMappingPreviewService;
import org.openelisglobal.analyzer.service.MappingPreviewResult;
import org.openelisglobal.analyzer.service.PreviewOptions;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Controller contract tests for read-only analyzer protocol replay. */
public class AnalyzerProtocolReplayControllerTest {

    private AnalyzerMappingPreviewService previewService;
    private MockMvc mockMvc;

    @Before
    public void setUp() {
        previewService = mock(AnalyzerMappingPreviewService.class);
        AnalyzerFieldMappingRestController controller = new AnalyzerFieldMappingRestController();
        ReflectionTestUtils.setField(controller, "analyzerMappingPreviewService", previewService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    public void replayReturnsProtocolHashSummaryAndDryRunEvidence() throws Exception {
        MappingPreviewResult result = new MappingPreviewResult();
        result.setProtocol("HL7");
        result.setMessageHash("a".repeat(64));
        result.setDryRun(true);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("parsedFieldCount", 12);
        summary.put("appliedMappingCount", 3);
        summary.put("clinicalWrites", 0);
        result.setReplaySummary(summary);

        when(previewService.previewMapping(eq("analyzer-1"), eq("MSH|^~\\&|SIM"),
                org.mockito.ArgumentMatchers.any(PreviewOptions.class))).thenReturn(result);

        mockMvc.perform(post("/rest/analyzer/analyzers/analyzer-1/preview-mapping")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"MSH|^~\\\\&|SIM\",\"protocol\":\"AUTO\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.protocol").value("HL7"))
                .andExpect(jsonPath("$.dryRun").value(true)).andExpect(jsonPath("$.messageHash").isString())
                .andExpect(jsonPath("$.replaySummary.clinicalWrites").value(0));

        verify(previewService).previewMapping(eq("analyzer-1"), eq("MSH|^~\\&|SIM"),
                org.mockito.ArgumentMatchers.argThat(options -> "AUTO".equals(options.getProtocol())));
    }

    @Test
    public void blankProtocolMessageIsRejectedBeforeReplay() throws Exception {
        mockMvc.perform(post("/rest/analyzer/analyzers/analyzer-1/preview-mapping")
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"   \",\"protocol\":\"ASTM\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
    }

    @Test
    public void legacyAstmMessageFieldRemainsAccepted() throws Exception {
        MappingPreviewResult result = new MappingPreviewResult();
        result.setProtocol("ASTM");
        result.setDryRun(true);
        when(previewService.previewMapping(eq("analyzer-1"), eq("H|\\^&|||SIM"),
                org.mockito.ArgumentMatchers.any(PreviewOptions.class))).thenReturn(result);

        mockMvc.perform(post("/rest/analyzer/analyzers/analyzer-1/preview-mapping")
                .contentType(MediaType.APPLICATION_JSON).content("{\"astmMessage\":\"H|\\\\^&|||SIM\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.protocol").value("ASTM"))
                .andExpect(jsonPath("$.dryRun").value(true));
    }
}
