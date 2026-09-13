package org.openelisglobal.qachecklist.controller;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.*;
import org.openelisglobal.qachecklist.service.QaChecklistCompletionTest;
import org.openelisglobal.qachecklist.service.SampleQaChecklistService;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Actual HTTP/controller -> transactional service/actor; only SIM data access
 * is replaced.
 */
public class QaChecklistEntryTest {
    private QaChecklistCompletionTest fixture;
    private SampleQaChecklistRestController controller;
    private SampleService samples;
    private SpecimenReceiptDAO specimens;
    private MockHttpServletRequest actual;
    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void setup() {
        fixture = new QaChecklistCompletionTest();
        fixture.setup();
        samples = mock(SampleService.class);
        specimens = (SpecimenReceiptDAO) ReflectionTestUtils.getField(fixture, "specimens");
        var sample = (Sample) ReflectionTestUtils.getField(fixture, "sample");
        when(samples.getMatch("id", "701")).thenReturn(Optional.of(sample));
        when(samples.getSampleByAccessionNumber("SIM-QA-701")).thenReturn(sample);
        ReflectionTestUtils.setField(ReflectionTestUtils.getField(fixture, "target"), "sampleService", samples);
        controller = new SampleQaChecklistRestController();
        ReflectionTestUtils.setField(controller, "sampleQaChecklistService",
                ReflectionTestUtils.getField(fixture, "service"));
        ReflectionTestUtils.setField(controller, "sampleService", samples);
        actual = (MockHttpServletRequest) ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes())
                .getRequest();
    }

    @After
    public void cleanup() {
        fixture.cleanup();
    }

    private Map<String, Object> body() {
        return new HashMap<>(Map.of("sampleId", 701, "verifiedItems", Map.of("patient", true, "specimen", true)));
    }

    private void rejection(Map<String, Object> body, int status) {
        var response = controller.saveQaChecklist(body, actual);
        assertEquals(String.valueOf(response.getBody()), status, response.getStatusCode().value());
        assertEquals(false, ((Map<?, ?>) response.getBody()).get("success"));
        assertNull(ReflectionTestUtils.getField(fixture, "persisted"));
    }

    @Test
    public void actualEntrySavesAfterCurrentChecks() {
        var response = controller.saveQaChecklist(body(), actual);
        assertEquals(200, response.getStatusCode().value());
        var result = (Map<?, ?>) response.getBody();
        assertEquals(true, result.get("allRequiredVerified"));
        assertEquals(false, result.get("currentAcceptanceVerified"));
        assertEquals("stored_checklist_snapshot", result.get("completionScope"));
    }

    @Test
    public void labOnlyIsResolvedWithinGuardedTransaction() {
        var body = body();
        body.remove("sampleId");
        body.put("labNumber", "SIM-QA-701");
        assertEquals(200, controller.saveQaChecklist(body, actual).getStatusCode().value());
    }

    @Test
    public void matchingIdentifiersSucceed() {
        var body = body();
        body.put("labNumber", "SIM-QA-701");
        assertEquals(200, controller.saveQaChecklist(body, actual).getStatusCode().value());
    }

    @Test
    public void mismatchedIdentifiersCannotWrite() {
        var other = new Sample();
        other.setId("702");
        when(samples.getSampleByAccessionNumber("SIM-other")).thenReturn(other);
        var body = body();
        body.put("labNumber", "SIM-other");
        rejection(body, 409);
    }

    @Test public void missingApplicationCannotWrite() { when(samples.getMatch("id","701")).thenReturn(Optional.empty());rejection(body(),404); }

    @Test
    public void fractionalOverflowBooleanAndStringIdentifiersAreRejectedBeforeLookup() {
        for (Object bad : List.of(701.9, 4294967997L, true, "701.0", "2147483648", 0, -1)) {
            var body = body();
            body.put("sampleId", bad);
            rejection(body, 400);
        }
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void stringBooleanCannotPassChecklist() {
        var body = body();
        body.put("verifiedItems", Map.of("patient", "true", "specimen", true));
        rejection(body, 400);
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void invalidLabEvenWithValidIdIsRejectedBeforeLookup() {
        var body = body();
        body.put("labNumber", false);
        rejection(body, 400);
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void noIdentifiersCannotWrite() {
        var body = body();
        body.remove("sampleId");
        rejection(body, 400);
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void dirtyPersistenceContextStopsBeforeTargetOrDictionaryQueries() {
        doThrow(new IllegalStateException("SIM-dirty")).when(specimens).requireCleanContext();
        rejection(body(), 500);
        verifyZeroInteractions(samples);
        verifyZeroInteractions((Object) ReflectionTestUtils.getField(fixture, "dictionaries"));
    }

    private void replaceSession() {
        var old = actual.getSession(false);
        var replacement = new MockHttpSession();
        var names = old.getAttributeNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            replacement.setAttribute(name, old.getAttribute(name));
        }
        var other = new MockHttpServletRequest();
        other.setSession(replacement);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
    }

    @Test public void sameAccountOtherSessionDuringTargetLookupCannotWrite() {
        when(samples.getMatch("id","701")).thenAnswer(call->{ replaceSession();return Optional.of((Sample)ReflectionTestUtils.getField(fixture,"sample"));});
        rejection(body(),403);verify(specimens,never()).lockOrder(anyString());
    }

    @Test
    public void sameAccountOtherSessionBeforeEntryCannotWrite() {
        replaceSession();
        rejection(body(), 403);
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void sameSessionWrapperIsSupported() {
        var wrapper = new jakarta.servlet.http.HttpServletRequestWrapper(actual);
        assertEquals(200, controller.saveQaChecklist(body(), wrapper).getStatusCode().value());
    }

    @Test
    public void missingReceiptErrorNamesNextAction() {
        @SuppressWarnings("unchecked")
        var rows = (List<org.openelisglobal.sampleitem.valueholder.SampleItem>) ReflectionTestUtils.getField(fixture,
                "items");
        rows.get(1).setReceivedDate(null);
        var response = controller.saveQaChecklist(body(), actual);
        assertEquals(409, response.getStatusCode().value());
        assertEquals("qa.checklist.receiptRequired", ((Map<?, ?>) response.getBody()).get("errorKey"));
        assertEquals("collect", ((Map<?, ?>) response.getBody()).get("blockedStep"));
    }

    @Test
    public void mvcParsesFractionalIdWithoutCoercion() throws Exception {
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        var response = mvc
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/rest/qa-checklist")
                        .session((MockHttpSession) actual.getSession()).contentType("application/json")
                        .content("{\"sampleId\":701.9,\"verifiedItems\":{\"patient\":true,\"specimen\":true}}"))
                .andReturn().getResponse();
        assertEquals(400, response.getStatus());
        verifyZeroInteractions(samples, specimens);
    }

    @Test
    public void mvcSuccessfulWriteUsesActualEntry() throws Exception {
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/rest/qa-checklist").session((MockHttpSession) actual.getSession())
                .contentType("application/json").content(json.writeValueAsString(body()))).andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertTrue(json.readTree(response.getContentAsByteArray()).path("success").asBoolean());
    }
}
