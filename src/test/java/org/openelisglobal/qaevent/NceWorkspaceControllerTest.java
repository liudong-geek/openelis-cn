package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.qaevent.controller.rest.NceWorkspaceRestController;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.Receipt;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.service.NceWorkspaceService;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class NceWorkspaceControllerTest {
    private NceWorkspaceService service;
    private MockMvc mvc;
    private ObjectMapper mapper;

    @Before
    public void setup() {
        service = mock(NceWorkspaceService.class);
        mapper = new ObjectMapper();
        mvc = MockMvcBuilders.standaloneSetup(new NceWorkspaceRestController(service)).build();
    }

    private String body() throws Exception {
        return mapper.writeValueAsString(NceWorkspaceTestSupport.command("2026-10-06", List.of()));
    }

    private Receipt applied() {
        return new Receipt("2", "7", NceWorkspaceTestSupport.KEY, "a".repeat(64), "APPLIED", "CREATE", "21",
                "NCE-2026-00001", "Pending", NceWorkspaceTestSupport.VERSION, List.of(), List.of());
    }

    @Test
    public void initializationIsVersionedReadOnlyAndUnmappedVersionFailsClosed() throws Exception {
        mvc.perform(get("/rest/nce/registration/meta").param("queryVersion", "2")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(service).meta(any());
        mvc.perform(get("/rest/nce/registration/meta")).andExpect(status().isBadRequest())
                .andExpect(header().string("Cache-Control", "no-store"));
        verifyNoMoreInteractions(service);
    }

    @Test
    public void sameActorPermissionDenialIs403AndNeverAnEmptyList() throws Exception {
        doThrow(new AccessDeniedException("db details must not leak")).when(service).workspace(any(), any());
        var result = mvc.perform(get("/rest/nce/workspace").param("queryVersion", "2"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NCE_PERMISSION_DENIED"))
                .andExpect(jsonPath("$.outcome").value("NOT_APPLIED"))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        assertFalse(result.getResponse().getContentAsString().contains("db details"));
    }

    @Test
    public void rejectsClientFormalNumberAndMalformedDateBeforeService() throws Exception {
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content("null")).andExpect(status().isBadRequest());
        String command = body();
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(command.substring(0, command.length() - 1) + ",\"nceNumber\":\"NCE-2026-00002\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(command.replace("2026-10-06", "2026-02-31"))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(jsonPath("$.outcome").value("NOT_APPLIED"))
                .andExpect(jsonPath("$.currentUserId").doesNotExist());
        verifyZeroInteractions(service);
    }

    @Test public void authoritativeCreateReturnsIdentityNumberOperationAndReceipt() throws Exception{
        when(service.create(any(),anyList(),any())).thenReturn(applied());mvc.perform(post("/rest/nce/registration").param("queryVersion","2").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.eventId").value("21")).andExpect(jsonPath("$.nceNumber").value("NCE-2026-00001")).andExpect(jsonPath("$.operation").value("CREATE")).andExpect(jsonPath("$.outcome").value("APPLIED")).andExpect(header().string("Cache-Control","no-store"));
    }

    @Test public void multipartPreservesEveryFilePart() throws Exception{
        when(service.create(any(),anyList(),any())).thenReturn(applied());mvc.perform(multipart("/rest/nce/registration").file(new MockMultipartFile("nceData","","application/json",body().getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .file(new MockMultipartFile("files","first.txt","text/plain",new byte[]{1})).file(new MockMultipartFile("files","second.txt","text/plain",new byte[]{2})).param("queryVersion","2")).andExpect(status().isOk());
        var captor=org.mockito.ArgumentCaptor.forClass(List.class);verify(service).create(any(),captor.capture(),any());assertEquals(2,captor.getValue().size());
    }

    @Test
    public void unexpectedFailureIsUnknownNotPermissionOrNoWrite() throws Exception {
        doThrow(new IllegalStateException("/internal/path/password")).when(service).create(any(), anyList(), any());
        var result = mvc
                .perform(post("/rest/nce/registration").param("queryVersion", "2")
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.outcome").value("UNKNOWN"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        assertFalse(result.getResponse().getContentAsString().contains("password"));
    }

    @Test
    public void writePermissionAndExistingReceiptAmbiguityKeepSameKeyUnknownButExactVersionFailureIsNotApplied()
            throws Exception {
        doThrow(new AccessDeniedException("revoked")).when(service).create(any(), anyList(), any());
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isForbidden()).andExpect(jsonPath("$.outcome").value("UNKNOWN"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
        for (String code : List.of("NCE_REQUEST_REPLAY_MISMATCH", "NCE_REQUEST_OPERATION_MISMATCH",
                "NCE_RECEIPT_INCOMPLETE")) {
            doThrow(new NceWorkspaceException(409, code)).when(service).create(any(), anyList(), any());
            mvc.perform(post("/rest/nce/registration").param("queryVersion", "2")
                    .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.outcome").value("UNKNOWN"))
                    .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
        }
        doThrow(new NceWorkspaceException(409, "NCE_REQUEST_OPERATION_MISMATCH")).when(service).receipt(anyString(),
                anyString(), any());
        mvc.perform(get("/rest/nce/registration/receipt").param("queryVersion", "2")
                .param("requestId", NceWorkspaceTestSupport.KEY).param("operation", "ADD_NOTE"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.outcome").value("NOT_APPLIED"));
        doThrow(new NceWorkspaceException(409, "NCE_ORDER_CHANGED")).when(service).create(any(), anyList(), any());
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isConflict()).andExpect(jsonPath("$.outcome").value("NOT_APPLIED"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
    }

    @Test
    public void collisionWithoutAuthoritativeAppliedReadbackCannotClaimNoOriginalWrite() throws Exception {
        doThrow(new NceWorkspaceException.ClaimCollision("a".repeat(64))).when(service).create(any(), anyList(), any());
        when(service.receipt(eq(NceWorkspaceTestSupport.KEY), eq("CREATE"), any()))
                .thenReturn(new Receipt("2", "7", NceWorkspaceTestSupport.KEY, null, "NOT_FOUND", "CREATE", null, null,
                        null, null, List.of(), List.of()));
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NCE_RECEIPT_INCOMPLETE"))
                .andExpect(jsonPath("$.outcome").value("UNKNOWN"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
    }

    @Test
    public void confirmedServiceRejectionsReturnOnlyItsVerifiedActorAndNeverTheClientOwner() throws Exception {
        doAnswer(invocation -> {
            var request = (jakarta.servlet.http.HttpServletRequest) invocation.getArgument(2);
            request.setAttribute("nceCurrentUserId", "7");
            throw new IllegalArgumentException("INVALID_NCE_ATTACHMENT");
        }).when(service).create(any(), anyList(), any());
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.outcome").value("NOT_APPLIED"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(jsonPath("$.currentUserId").value("7"));
        doAnswer(invocation -> {
            var request = (jakarta.servlet.http.HttpServletRequest) invocation.getArgument(2);
            request.setAttribute("nceCurrentUserId", "7");
            throw new NceWorkspaceException(409, "NCE_ORDER_CHANGED");
        }).when(service).create(any(), anyList(), any());
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body())).andExpect(status().isConflict()).andExpect(jsonPath("$.outcome").value("NOT_APPLIED"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(jsonPath("$.currentUserId").value("7"));
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2").contentType(MediaType.APPLICATION_JSON)
                .content(body().replace("2026-10-06", "2026-02-31"))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(jsonPath("$.currentUserId").doesNotExist());
        verify(service, times(2)).create(any(), anyList(), any());
    }
}
