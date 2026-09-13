package org.openelisglobal.qachecklist.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.service.SampleQaChecklistService;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * HTTP/controller contracts only; transactional database effects are tested in
 * the service suite.
 */
public class SampleQaChecklistRestControllerTest {
    private SampleQaChecklistService checklistService;
    private SampleService sampleService;
    private SampleQaChecklistRestController controller;
    private MockMvc mockMvc;

    @Before
    public void setUp() {
        checklistService = mock(SampleQaChecklistService.class);
        sampleService = mock(SampleService.class);
        controller = new SampleQaChecklistRestController();
        ReflectionTestUtils.setField(controller, "sampleQaChecklistService", checklistService);
        ReflectionTestUtils.setField(controller, "sampleService", sampleService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        when(checklistService.getActiveChecklistItems()).thenReturn(activeItems());
    }

    @After
    public void clearRequest() {
        org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void configReturnsActiveDictionaryItems() {
        when(checklistService.getActiveChecklistItems()).thenReturn(activeItems());
        ResponseEntity<?> response = controller.getChecklistConfig();
        assertEquals(200, response.getStatusCode().value());
        List<?> items = (List<?>) response.getBody();
        assertEquals(2, items.size());
        assertEquals("patientInfoVerified", ((Map<?, ?>) items.get(0)).get("itemKey"));
        assertEquals("Patient Info", ((Map<?, ?>) items.get(0)).get("label"));
        assertEquals(true, ((Map<?, ?>) items.get(0)).get("isActive"));
    }

    @Test
    public void readCopiesVerifiedItemsBeforeAddingActiveDefaults() {
        SampleQaChecklist checklist = saved();
        when(checklistService.findBySampleId("42")).thenReturn(checklist);
        when(checklistService.getActiveChecklistItems()).thenReturn(activeItems());
        ResponseEntity<?> response = controller.getQaChecklist(" 42 ");
        assertEquals(200, response.getStatusCode().value());
        assertEquals("42", body(response).get("sampleId"));
        assertEquals(false, body(response).get("allRequiredVerified"));
        assertEquals(true, body(response).get("storedChecklistComplete"));
        assertEquals(false, body(response).get("currentAcceptanceVerified"));
        Map<?, ?> flags = (Map<?, ?>) body(response).get("verifiedItems");
        assertEquals(true, flags.get("patientInfoVerified"));
        assertEquals(false, flags.get("samplesVerified"));
        assertFalse(checklist.getVerifiedItems().containsKey("samplesVerified"));
    }

    @Test
    public void missingChecklistReturnsUncheckedActiveItems() {
        when(checklistService.getActiveChecklistItems()).thenReturn(activeItems());
        ResponseEntity<?> response = controller.getQaChecklist("99");
        assertEquals(200, response.getStatusCode().value());
        assertEquals(false, body(response).get("allRequiredVerified"));
        assertEquals(false, ((Map<?, ?>) body(response).get("verifiedItems")).get("samplesVerified"));
    }

    @Test
    public void readRejectsInvalidIdsAndDoesNotExposeExceptionDetails() {
        for (String id : List.of("abc", "0", "-1", "1.5", "2147483648")) {
            assertFailure(controller.getQaChecklist(id), 400, "QA_SAMPLE_ID_INVALID", "sampleIdInvalid");
        }
        verifyZeroInteractions(checklistService);
        when(checklistService.getActiveChecklistItems()).thenThrow(new RuntimeException("secret jdbc host"));
        assertFailure(controller.getChecklistConfig(), 500, "QA_LOAD_FAILED", "loadFailed");
        when(checklistService.findBySampleId("42")).thenThrow(new RuntimeException("secret jdbc host"));
        assertFailure(controller.getQaChecklist("42"), 500, "QA_LOAD_FAILED", "loadFailed");
    }

    @Test
    public void labLookupTrimsInputAndReturns404ForMissingSample() throws Exception {
        when(sampleService.getSampleByAccessionNumber("LAB-42")).thenReturn(sample(42));
        assertEquals(200, controller.getQaChecklistByLabNumber(" LAB-42 ").getStatusCode().value());
        verify(checklistService).findBySampleId("42");
        mockMvc.perform(get("/rest/qa-checklist/by-lab-number/MISSING"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("QA_SAMPLE_NOT_FOUND"))
                .andExpect(jsonPath("$.errorKey").value("qa.checklist.sampleNotFound"));
    }

    @Test
    public void unauthenticatedAndZeroIdentityNeverReachServices() throws Exception {
        assertFailure(controller.saveQaChecklist(validBody(), new MockHttpServletRequest()), 401, "QA_AUTH_REQUIRED",
                "authRequired");
        assertFailure(controller.saveQaChecklist(validBody(), request(0)), 401, "QA_AUTH_REQUIRED", "authRequired");
        mockMvc.perform(post("/rest/qa-checklist").contentType(MediaType.APPLICATION_JSON)
                .content("{\"sampleId\":42,\"verifiedItems\":{}}")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false)).andExpect(jsonPath("$.code").value("QA_AUTH_REQUIRED"))
                .andExpect(jsonPath("$.errorKey").value("qa.checklist.authRequired"));
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void savesStrictIntegerIdsAndUsesAuthenticatedAuditUser() {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), eq(Map.of("patientInfoVerified", true)), eq(7), any()))
                .thenReturn(saved());
        for (Object id : List.of(42, " 42 ", 42L, new BigInteger("42"))) {
            Map<String, Object> data = validBody();
            data.put("sampleId", id);
            ResponseEntity<?> response = controller.saveQaChecklist(data, request(7));
            assertEquals(200, response.getStatusCode().value());
            assertEquals(true, body(response).get("success"));
            assertEquals(42, body(response).get("sampleId"));
            assertEquals(7, body(response).get("verifiedByUserId"));
        }
    }

    @Test
    public void rejectsFractionalOverflowBooleanAndNonPositiveIdsBeforeLookup() {
        Object[] values = { null, "", "abc", "1.0", "-1", "0", "2147483648", true, false, 0, -1, 1.5, 1.0,
                Long.MAX_VALUE, new BigInteger("99999999999999999999"), new BigDecimal("42.0"), Map.of() };
        for (Object value : values) {
            Map<String, Object> data = validBody();
            data.put("sampleId", value);
            assertFailure(controller.saveQaChecklist(data, request(7)), 400, "QA_SAMPLE_ID_INVALID", "sampleIdInvalid");
        }
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void validatesLabNumberEvenWhenSampleIdIsPresent() {
        for (Object value : new Object[] { null, "", " ", 123, false, List.of("LAB-42") }) {
            Map<String, Object> data = validBody();
            data.put("labNumber", value);
            assertFailure(controller.saveQaChecklist(data, request(7)), 400, "QA_LAB_NUMBER_INVALID",
                    "labNumberInvalid");
        }
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void requiresObjectBooleanFlagsAndNeverCoercesValues() {
        for (Object value : new Object[] { null, List.of(), "true", true, 1, Map.of("patientInfoVerified", "true"),
                Map.of("patientInfoVerified", 1), Map.of("patientInfoVerified", List.of()) }) {
            Map<String, Object> data = validBody();
            data.put("verifiedItems", value);
            assertFailure(controller.saveQaChecklist(data, request(7)), 400, "QA_ITEMS_INVALID", "itemsInvalid");
        }
        Map<String, Object> nullFlag = new HashMap<>();
        nullFlag.put("patientInfoVerified", null);
        Map<String, Object> data = validBody();
        data.put("verifiedItems", nullFlag);
        assertFailure(controller.saveQaChecklist(data, request(7)), 400, "QA_ITEMS_INVALID", "itemsInvalid");
        data.remove("verifiedItems");
        assertFailure(controller.saveQaChecklist(data, request(7)), 400, "QA_ITEMS_INVALID", "itemsInvalid");
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void missingBodyOrIdentifierHasExplicitError() {
        assertFailure(controller.saveQaChecklist(null, request(7)), 400, "QA_REQUEST_INVALID", "invalidRequest");
        assertFailure(controller.saveQaChecklist(Map.of("verifiedItems", Map.of()), request(7)), 400,
                "QA_IDENTIFIER_REQUIRED", "identifierRequired");
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void missingSampleForEitherIdentifierNeverInvokesSave() {
        when(checklistService.saveFromRequest(any(), any(), any(), any(), any())).thenThrow(
                new QaChecklistValidationException(404, "QA_SAMPLE_NOT_FOUND", "qa.checklist.sampleNotFound"));
        assertFailure(controller.saveQaChecklist(validBody(), request(7)), 404, "QA_SAMPLE_NOT_FOUND",
                "sampleNotFound");
        assertFailure(controller.saveQaChecklist(Map.of("labNumber", "MISSING", "verifiedItems", Map.of()), request(7)),
                404, "QA_SAMPLE_NOT_FOUND", "sampleNotFound");
        verify(checklistService, never()).saveOrUpdateChecklist(anyInt(), any(), anyInt());
    }

    @Test
    public void dualIdentifiersMustMatchAndFailureNeverInvokesSave() throws Exception {
        existingSample();
        when(sampleService.getSampleByAccessionNumber("LAB-99")).thenReturn(sample(99));
        when(checklistService.saveFromRequest(eq(42), eq("LAB-99"), any(), eq(7), any())).thenThrow(
                new QaChecklistValidationException(409, "QA_IDENTIFIER_MISMATCH", "qa.checklist.identifierMismatch"));
        assertHttpFailure("{\"sampleId\":42,\"labNumber\":\"LAB-99\",\"verifiedItems\":{}}", 409,
                "QA_IDENTIFIER_MISMATCH", "identifierMismatch");
        verify(checklistService, never()).saveOrUpdateChecklist(anyInt(), any(), anyInt());
    }

    @Test
    public void matchingDualIdentifiersAndLabOnlyResolveSameSample() {
        existingSample();
        when(sampleService.getSampleByAccessionNumber("LAB-42")).thenReturn(sample(42));
        when(checklistService.saveFromRequest(any(), eq("LAB-42"), eq(Map.of("patientInfoVerified", true)), eq(7),
                any())).thenReturn(saved());
        Map<String, Object> data = validBody();
        data.put("labNumber", " LAB-42 ");
        assertEquals(200, controller.saveQaChecklist(data, request(7)).getStatusCode().value());
        data.remove("sampleId");
        assertEquals(200, controller.saveQaChecklist(data, request(7)).getStatusCode().value());
    }

    @Test
    public void httpSuccessPreservesFalseAndTrueValues() throws Exception {
        existingSample();
        Map<String, Boolean> flags = Map.of("patientInfoVerified", true, "samplesVerified", false);
        SampleQaChecklist saved = saved();
        saved.setVerifiedItems(flags);
        saved.setAllRequiredVerified(false);
        when(checklistService.saveFromRequest(eq(42), isNull(), eq(flags), eq(7), any())).thenReturn(saved);
        httpPost("{\"sampleId\":42,\"verifiedItems\":{\"patientInfoVerified\":true,\"samplesVerified\":false}}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.sampleId").value(42)).andExpect(jsonPath("$.verifiedByUserId").value(7))
                .andExpect(jsonPath("$.verifiedItems.patientInfoVerified").value(true))
                .andExpect(jsonPath("$.verifiedItems.samplesVerified").value(false))
                .andExpect(jsonPath("$.allRequiredVerified").value(false));
        verify(checklistService).saveFromRequest(eq(42), isNull(), eq(flags), eq(7), any());
    }

    @Test
    public void httpParsingRejectsDecimalsOverflowBooleanIdsAndStringFlags() throws Exception {
        for (String json : List.of("{\"sampleId\":1.5,\"verifiedItems\":{}}",
                "{\"sampleId\":4294967338,\"verifiedItems\":{}}", "{\"sampleId\":true,\"verifiedItems\":{}}")) {
            assertHttpFailure(json, 400, "QA_SAMPLE_ID_INVALID", "sampleIdInvalid");
        }
        assertHttpFailure("{\"sampleId\":42,\"verifiedItems\":{\"patientInfoVerified\":\"true\"}}", 400,
                "QA_ITEMS_INVALID", "itemsInvalid");
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void malformedJsonAndNonObjectBodiesUseConsistent400Contract() throws Exception {
        for (String json : List.of("[]", "{broken", "null", "")) {
            assertHttpFailure(json, 400, "QA_REQUEST_INVALID", "invalidRequest");
        }
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void httpMissingSampleHas404Contract() throws Exception {
        when(checklistService.saveFromRequest(any(), any(), any(), any(), any())).thenThrow(
                new QaChecklistValidationException(404, "QA_SAMPLE_NOT_FOUND", "qa.checklist.sampleNotFound"));
        assertHttpFailure("{\"sampleId\":42,\"verifiedItems\":{}}", 404, "QA_SAMPLE_NOT_FOUND", "sampleNotFound");
        verify(checklistService, never()).saveOrUpdateChecklist(anyInt(), any(), anyInt());
    }

    @Test
    public void serviceValidationPreservesStatusAndActionableStep() throws Exception {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), any(), eq(7), any()))
                .thenThrow(new QaChecklistValidationException(409, "QA_COLLECTION_REQUIRED",
                        "qa.checklist.collectionRequired", "collect"));
        assertHttpFailure("{\"sampleId\":42,\"verifiedItems\":{}}", 409, "QA_COLLECTION_REQUIRED", "collectionRequired")
                .andExpect(jsonPath("$.blockedStep").value("collect"));
    }

    @Test
    public void unexpectedFailureReturnsGeneric500NotFalseSuccess() {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), any(), eq(7), any()))
                .thenThrow(new RuntimeException("secret jdbc host and patient data"));
        assertFailure(controller.saveQaChecklist(validBody(), request(7)), 500, "QA_SAVE_FAILED", "saveFailed");
    }

    private void existingSample() {
        when(sampleService.getMatch("id", "42")).thenReturn(Optional.of(sample(42)));
    }

    private ResultActions httpPost(String json) throws Exception {
        return mockMvc.perform(post("/rest/qa-checklist").sessionAttr(IActionConstants.USER_SESSION_DATA, user(7))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions assertHttpFailure(String json, int httpStatus, String code, String key) throws Exception {
        return httpPost(json).andExpect(status().is(httpStatus)).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.errorKey").value("qa.checklist." + key));
    }

    private static void assertFailure(ResponseEntity<?> response, int httpStatus, String code, String key) {
        assertEquals(httpStatus, response.getStatusCode().value());
        assertEquals(false, body(response).get("success"));
        assertEquals(code, body(response).get("code"));
        assertEquals("qa.checklist." + key, body(response).get("errorKey"));
        assertFalse(body(response).toString().contains("secret"));
        assertFalse(body(response).containsKey("error"));
    }

    private static Map<?, ?> body(ResponseEntity<?> response) {
        assertNotNull(response.getBody());
        assertTrue(response.getBody() instanceof Map);
        return (Map<?, ?>) response.getBody();
    }

    private static Map<String, Object> validBody() {
        return new HashMap<>(Map.of("sampleId", 42, "verifiedItems", Map.of("patientInfoVerified", true)));
    }

    private static MockHttpServletRequest request(int id) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user(id));
        org.springframework.web.context.request.RequestContextHolder
                .setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        return request;
    }

    @Test
    public void sameUserDifferentRequestSessionCannotReachSave() {
        var actual = request(7);
        request(7);
        assertFailure(controller.saveQaChecklist(validBody(), actual), 403, "QA_PERMISSION_DENIED", "permissionDenied");
        verifyZeroInteractions(sampleService, checklistService);
    }

    @Test
    public void sameSessionWrapperIsAllowed() {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), any(), eq(7), any())).thenReturn(saved());
        var actual = request(7);
        var wrapper = new jakarta.servlet.http.HttpServletRequestWrapper(actual);
        assertEquals(200, controller.saveQaChecklist(validBody(), wrapper).getStatusCode().value());
    }

    @Test
    public void permissionLossIsExplicit403WithoutDetails() {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), any(), eq(7), any()))
                .thenThrow(new org.springframework.security.access.AccessDeniedException("SIM-secret"));
        assertFailure(controller.saveQaChecklist(validBody(), request(7)), 403, "QA_PERMISSION_DENIED",
                "permissionDenied");
    }

    @Test
    public void missingReceiptKeepsActionableBlock() {
        existingSample();
        when(checklistService.saveFromRequest(eq(42), any(), any(), eq(7), any()))
                .thenThrow(new QaChecklistValidationException(409, "QA_RECEIPT_REQUIRED",
                        "qa.checklist.receiptRequired", "collect"));
        var response = controller.saveQaChecklist(validBody(), request(7));
        assertFailure(response, 409, "QA_RECEIPT_REQUIRED", "receiptRequired");
        assertEquals("collect", body(response).get("blockedStep"));
    }

    private static UserSessionData user(int id) {
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(id);
        return user;
    }

    private static Sample sample(int id) {
        Sample sample = new Sample();
        sample.setId(Integer.toString(id));
        return sample;
    }

    private static SampleQaChecklist saved() {
        SampleQaChecklist saved = new SampleQaChecklist();
        saved.setId(1);
        saved.setSampleId(42);
        saved.setVerifiedItems(Map.of("patientInfoVerified", true));
        saved.setAllRequiredVerified(true);
        saved.setVerifiedByUserId(7);
        return saved;
    }

    private static List<Dictionary> activeItems() {
        Dictionary first = new Dictionary();
        first.setId("1");
        first.setDictEntry("patientInfoVerified");
        first.setSortOrder(1);
        first.setIsActive("Y");
        first.setLocalAbbreviation("Patient Info");
        Dictionary second = new Dictionary();
        second.setId("2");
        second.setDictEntry("samplesVerified");
        second.setSortOrder(2);
        second.setIsActive("Y");
        second.setLocalAbbreviation("Samples");
        return List.of(first, second);
    }
}
