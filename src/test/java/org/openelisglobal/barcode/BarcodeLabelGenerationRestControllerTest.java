package org.openelisglobal.barcode;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.barcode.controller.BarcodeLabelGenerationRestController;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse.GeneratedLabel;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.barcode.service.BarcodeLabelGenerationPermissionService;
import org.openelisglobal.barcode.service.BarcodeLabelGenerationService;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class BarcodeLabelGenerationRestControllerTest {
    private final BarcodeLabelGenerationPermissionService permissions = mock(BarcodeLabelGenerationPermissionService.class);
    private final BarcodeLabelGenerationService service = mock(BarcodeLabelGenerationService.class);
    private final BarcodeLabelGenerationPermissionService.BoundOperator operator = new BarcodeLabelGenerationPermissionService.BoundOperator(null, null, null, null, "7", "SIM-operator", 0, java.util.Set.of());
    private MockMvc mvc;
    private static final String URL = "/rest/barcode/labels/generate";
    private static final String BODY = "{\"orderId\":\"12\",\"labNumber\":\"TEST260001\",\"labels\":[{\"type\":\"order\",\"sampleItemId\":null,\"quantity\":1}]}";

    @Before
    public void setup() {
        ObjectMapper mapper = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
        mvc = MockMvcBuilders.standaloneSetup(new BarcodeLabelGenerationRestController(permissions, service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
        when(permissions.requirePrintPermission(any())).thenReturn(operator);
        when(service.generate(any(), same(operator))).thenReturn(new BarcodeLabelGenerateResponse("12", "TEST260001",
                List.of(new GeneratedLabel("order", null, "TEST260001", 1, 0, "PRINT_LIMIT")), 0, null));
    }

    @Test
    public void zeroGenerationReturnsExplicitNullPdfAndManifest() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().string(org.hamcrest.CoreMatchers.containsString("\"pdfBase64\":null")))
                .andExpect(content().string(org.hamcrest.CoreMatchers.containsString("\"sampleItemId\":null")))
                .andExpect(jsonValue("totalGenerated", 0));
    }

    @Test
    public void requiresPermissionBeforeAnyBusinessLookup() throws Exception {
        when(permissions.requirePrintPermission(any())).thenThrow(new BarcodeLabelGenerationException(403, "BARCODE_PERMISSION_DENIED"));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden())
                .andExpect(jsonValue("code", "BARCODE_PERMISSION_DENIED"));
        verify(service, never()).generate(any(), any());
    }

    @Test
    public void missingIdentityIs401AndNeverInvokesGeneration() throws Exception {
        when(permissions.requirePrintPermission(any())).thenThrow(new BarcodeLabelGenerationException(401, "BARCODE_AUTH_REQUIRED"));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        verify(service, never()).generate(any(), any());
    }

    @Test
    public void rejectsUnknownOverrideAndMalformedJson() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY.replace("\"orderId\"", "\"override\":true,\"orderId\"")))
                .andExpect(status().isBadRequest());
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonValue("code", "BARCODE_REQUEST_INVALID"));
        verify(service, never()).generate(any(), any());
    }

    @Test
    public void unexpectedServiceFailureDoesNotReturnPdfOrInternalDetails() throws Exception {
        when(service.generate(any(), any())).thenThrow(new IllegalStateException("sensitive internal details"));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isInternalServerError())
                .andExpect(jsonValue("code", "BARCODE_GENERATION_FAILED"))
                .andExpect(result -> org.junit.Assert.assertFalse(new ObjectMapper().readTree(result.getResponse().getContentAsByteArray()).has("pdfBase64")))
                .andExpect(content().string(org.hamcrest.CoreMatchers.not(org.hamcrest.CoreMatchers.containsString("sensitive"))));
    }

    @Test
    public void noGetGenerationSurface() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isMethodNotAllowed());
        verify(service, never()).generate(any(), any());
    }

    private static org.springframework.test.web.servlet.ResultMatcher jsonValue(String name, Object expected) {
        return result -> org.junit.Assert.assertEquals(new ObjectMapper().valueToTree(expected),
                new ObjectMapper().readTree(result.getResponse().getContentAsByteArray()).get(name));
    }
}
