package org.openelisglobal.qaevent;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.qaevent.controller.rest.NceWorkspaceRestController;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.Receipt;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.service.NceWorkspaceService;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
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
        mvc = MockMvcBuilders.standaloneSetup(new NceWorkspaceRestController(service))
                .setMessageConverters(new AppConfig().jacksonMessageConverter(),
                        new StringHttpMessageConverter(StandardCharsets.UTF_8))
                .build();
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

    @Test
    public void productionConverterReceivesChineseRegistrationAsExactObject() throws Exception {
        when(service.create(any(), anyList(), any())).thenReturn(applied());
        String command = body().replace("Title", "标本采集异常").replace("Description", "采集后发现标本溶血");
        mvc.perform(post("/rest/nce/registration").param("queryVersion", "2")
                .contentType(MediaType.APPLICATION_JSON).content(command.getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY))
                .andExpect(jsonPath("$.eventId").value("21"));
        var captured = ArgumentCaptor.forClass(NceRegistrationCommand.class);
        verify(service, times(1)).create(captured.capture(), eq(List.of()), any());
        assertEquals("标本采集异常", captured.getValue().title());
        assertEquals("采集后发现标本溶血", captured.getValue().description());
        assertEquals("7", captured.getValue().currentUserId());
    }

    @Test
    public void productionConverterReceivesExactActionAndAuthoritativeReceipt() throws Exception {
        var command = new NceActionCommand(NceWorkspaceTestSupport.KEY, "7", NceWorkspaceTestSupport.VERSION,
                "ADD_NOTE", "补充处理记录", null);
        var receipt = new Receipt("2", "7", NceWorkspaceTestSupport.KEY, "a".repeat(64), "APPLIED", "ADD_NOTE", "21",
                "NCE-2026-00001", "Pending", NceWorkspaceTestSupport.VERSION, List.of(), List.of());
        when(service.action(eq("21"), any(), any())).thenReturn(receipt);
        mvc.perform(post("/rest/nce/events/21/actions").param("queryVersion", "2")
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(command)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.operation").value("ADD_NOTE"))
                .andExpect(jsonPath("$.eventId").value("21"))
                .andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
        verify(service, times(1)).action(eq("21"), eq(command), any());
    }

    @Test
    public void rawJsonRetainsDuplicateTrailingUnknownAndBoundedBodyRejection() throws Exception {
        String command = body();
        for (String invalid : List.of(command + " {}",
                command.replace("\"title\":\"Title\"", "\"title\":\"first\",\"title\":\"Title\""),
                command.substring(0, command.length() - 1) + ",\"nceNumber\":\"NCE-FAKE\"}",
                mapper.writeValueAsString(command), " ".repeat(1024 * 1024 + 1) + command)) {
            mvc.perform(post("/rest/nce/registration").param("queryVersion", "2")
                    .contentType(MediaType.APPLICATION_JSON).content(invalid.getBytes(StandardCharsets.UTF_8)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.outcome").value("NOT_APPLIED"));
        }
        verifyZeroInteractions(service);
    }

    @Test
    public void stringMultipartMetadataPreservesChineseCommandAndEveryAttachment() throws Exception {
        when(service.create(any(), anyList(), any())).thenReturn(applied());
        String command = body().replace("Title", "标本采集异常");
        mvc.perform(multipart("/rest/nce/registration")
                .file(new MockMultipartFile("files", "first.txt", "text/plain", new byte[] { 1 }))
                .file(new MockMultipartFile("files", "second.txt", "text/plain", new byte[] { 2 }))
                .param("queryVersion", "2").param("nceData", command))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requestId").value(NceWorkspaceTestSupport.KEY));
        var captured = ArgumentCaptor.forClass(NceRegistrationCommand.class);
        var uploads = ArgumentCaptor.forClass(List.class);
        verify(service).create(captured.capture(), uploads.capture(), any());
        assertEquals("标本采集异常", captured.getValue().title());
        assertEquals(2, uploads.getValue().size());
        assertEquals("first.txt", ((org.springframework.web.multipart.MultipartFile) uploads.getValue().get(0))
                .getOriginalFilename());
        assertEquals("second.txt", ((org.springframework.web.multipart.MultipartFile) uploads.getValue().get(1))
                .getOriginalFilename());
    }

    @Test
    public void actionRawJsonRetainsStrictTokensFieldsAndSizeBeforeAnyWrite() throws Exception {
        String command = mapper.writeValueAsString(new NceActionCommand(NceWorkspaceTestSupport.KEY, "7",
                NceWorkspaceTestSupport.VERSION, "ADD_NOTE", "补充处理记录", null));
        for (String invalid : List.of(command + " {}",
                command.replace("\"type\":\"ADD_NOTE\"", "\"type\":\"ACKNOWLEDGE\",\"type\":\"ADD_NOTE\""),
                command.substring(0, command.length() - 1) + ",\"status\":\"Completed\"}",
                mapper.writeValueAsString(command), " ".repeat(1024 * 1024 + 1) + command)) {
            mvc.perform(post("/rest/nce/events/21/actions").param("queryVersion", "2")
                    .contentType(MediaType.APPLICATION_JSON).content(invalid.getBytes(StandardCharsets.UTF_8)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.outcome").value("NOT_APPLIED"));
        }
        verifyZeroInteractions(service);
    }

    private Receipt specimenOnlyReceipt() {
        java.util.Map<String, Object> link = new java.util.LinkedHashMap<>();
        link.put("sampleId", "1");
        link.put("labNumber", "HMC00001");
        link.put("sampleLastupdated", NceWorkspaceTestSupport.VERSION);
        link.put("sampleItemId", "10");
        link.put("lastupdated", NceWorkspaceTestSupport.VERSION);
        link.put("analysisId", null);
        link.put("analysisLastupdated", null);
        link.put("testName", null);
        return new Receipt("2", "1", NceWorkspaceTestSupport.KEY, "a".repeat(64), "APPLIED", "CREATE", "21",
                "NCE-2026-00001", "Pending", NceWorkspaceTestSupport.VERSION, List.of(link), List.of());
    }

    private void assertSpecimenReceipt(org.springframework.test.web.servlet.MvcResult result, String file)
            throws Exception {
        String wire = result.getResponse().getContentAsString();
        String output = System.getProperty("nceReceiptWireOutput");
        if (output != null) {
            java.nio.file.Path directory = java.nio.file.Path.of(output);
            java.nio.file.Files.createDirectories(directory);
            java.nio.file.Files.writeString(directory.resolve(file), wire);
        }
        var link = mapper.readTree(wire).get("linkedSpecimens").get(0);
        assertTrue("specimen-only analysis identity must remain explicit null", link.has("analysisId"));
        assertTrue(link.get("analysisId").isNull());
        assertTrue("specimen-only analysis version must remain explicit null", link.has("analysisLastupdated"));
        assertTrue(link.get("analysisLastupdated").isNull());
        assertFalse("unrelated null metadata retains ordinary NON_NULL policy", link.has("testName"));
    }

    @Test
    public void createSpecimenOnlyReceiptPreservesNullableIdentityWithProductionConverter() throws Exception {
        when(service.create(any(), anyList(), any())).thenReturn(specimenOnlyReceipt());
        var result = mvc.perform(post("/rest/nce/registration").param("queryVersion", "2")
                .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isOk()).andReturn();
        assertSpecimenReceipt(result, "create.json");
    }

    @Test
    public void readOriginalSpecimenOnlyReceiptPreservesNullableIdentityWithProductionConverter() throws Exception {
        when(service.receipt(eq(NceWorkspaceTestSupport.KEY), eq("CREATE"), any())).thenReturn(specimenOnlyReceipt());
        var result = mvc.perform(get("/rest/nce/registration/receipt").param("queryVersion", "2")
                .param("requestId", NceWorkspaceTestSupport.KEY).param("operation", "CREATE"))
                .andExpect(status().isOk()).andReturn();
        assertSpecimenReceipt(result, "receipt.json");
    }

    @Test
    public void analysisReceiptRetainsExactNonNullableAnalysisIdentity() throws Exception {
        var original = specimenOnlyReceipt();
        var link = new java.util.LinkedHashMap<>(original.linkedSpecimens().get(0));
        link.put("analysisId", "100");
        link.put("analysisLastupdated", "2026-10-06 09:11:12.345123");
        when(service.receipt(anyString(), eq("CREATE"), any())).thenReturn(new Receipt(original.queryVersion(),
                original.currentUserId(), original.requestId(), original.requestHash(), original.outcome(),
                original.operation(), original.eventId(), original.nceNumber(), original.statusCode(),
                original.lastupdated(), List.of(link), original.attachments()));
        mvc.perform(get("/rest/nce/registration/receipt").param("queryVersion", "2")
                .param("requestId", NceWorkspaceTestSupport.KEY).param("operation", "CREATE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.linkedSpecimens[0].analysisId").value("100"))
                .andExpect(jsonPath("$.linkedSpecimens[0].analysisLastupdated").value("2026-10-06 09:11:12.345123"))
                .andExpect(jsonPath("$.linkedSpecimens[0].testName").doesNotExist());
    }
}
