package org.openelisglobal.sample;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.controller.rest.SavedOrderReadRestController;
import org.openelisglobal.sample.form.SavedOrderReadRequest;
import org.openelisglobal.sample.form.SavedOrderReadResponse;
import org.openelisglobal.sample.service.SavedOrderReadException;
import org.openelisglobal.sample.service.SavedOrderReadService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class SavedOrderReadMvcTest {
    private SavedOrderReadService service;
    private MockMvc mvc;

    @Before
    public void setup() {
        service = mock(SavedOrderReadService.class);
        mvc = MockMvcBuilders.standaloneSetup(new SavedOrderReadRestController(service)).build();
    }

    @Test
    public void detachedViewEchoesExactOwnerAndIdentityWithNoStore() throws Exception {
        var response = new SavedOrderReadResponse("2", "7", new SavedOrderReadRequest("HMC1"), "4", "HMC1", true, false,
                false, "MODIFY_PERMISSION_DENIED", List.of(), null, Map.of(), List.of(), List.of());
        when(service.read(any(), any())).thenReturn(response);
        mvc.perform(get("/rest/order/saved").param("queryVersion", "2").param("labNumber", "HMC1"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store, max-age=0"))
                .andExpect(jsonPath("$.currentUserId").value("7")).andExpect(jsonPath("$.orderId").value("4"))
                .andExpect(jsonPath("$.query.labNumber").value("HMC1")).andExpect(jsonPath("$.readOnly").value(true));
    }

    @Test
    public void invalidQueryNeverCallsReadAndAllErrorsAreNoStore() throws Exception {
        mvc.perform(get("/rest/order/saved").param("queryVersion", "2").param("labNumber", "HMC1", "HMC2"))
                .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store, max-age=0"));
        verifyZeroInteractions(service);
        for (int code : new int[] { 403, 404, 409, 500 }) {
            RuntimeException error = code == 403 ? new AccessDeniedException("secret should not leak")
                    : code == 500 ? new IllegalStateException("secret should not leak")
                            : new SavedOrderReadException(code, "STABLE_CODE");
            doThrow(error).when(service).read(any(), any());
            String body = mvc.perform(get("/rest/order/saved").param("queryVersion", "2").param("labNumber", "HMC1"))
                    .andExpect(status().is(code)).andExpect(header().string("Cache-Control", "no-store, max-age=0"))
                    .andExpect(header().string("Pragma", "no-cache")).andReturn().getResponse().getContentAsString();
            assertFalse(body.contains("secret"));
            assertFalse(body.contains("samples"));
        }
        doThrow(new IllegalArgumentException("data failure must not be a query error")).when(service).read(any(),
                any());
        mvc.perform(get("/rest/order/saved").param("queryVersion", "2").param("labNumber", "HMC1"))
                .andExpect(status().isInternalServerError())
                .andExpect(header().string("Cache-Control", "no-store, max-age=0"))
                .andExpect(jsonPath("$.code").value("SAVED_ORDER_DATA_UNAVAILABLE"));
    }
}
