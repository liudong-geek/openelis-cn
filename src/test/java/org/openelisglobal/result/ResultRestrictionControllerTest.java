package org.openelisglobal.result;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.result.controller.rest.ResultRestrictionRestController;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.form.ResultRestrictionResponse;
import org.openelisglobal.result.form.ResultRestrictionResponse.*;
import org.openelisglobal.result.service.*;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class ResultRestrictionControllerTest {
    private ResultRestrictionService service;
    private ResultRestrictionRestController controller;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        service = mock(ResultRestrictionService.class);
        controller = new ResultRestrictionRestController(service);
        request = new MockHttpServletRequest();
        request.addParameter("queryVersion", "2");
        request.addParameter("sampleItemId", "2");
        request.addParameter("testId", "3");
        request.addParameter("labNumber", "RAW-1");
        request.addParameter("analysisLastupdated", "1700000000000");
    }

    @Test
    public void malformedRequestHasNoOwnerAndNeverCallsService() {
        request.addParameter("currentUserId", "7");
        var r = controller.inspect("1", request);
        assertEquals(400, r.getStatusCode().value());
        assertEquals("no-store", r.getHeaders().getCacheControl());
        assertFalse(((Map<?, ?>) r.getBody()).containsKey("currentUserId"));
        verifyZeroInteractions(service);
    }

    @Test
    public void readsThroughServiceAndDisablesCaching() {
        var r = controller.inspect("1", request);
        assertEquals(200, r.getStatusCode().value());
        assertEquals("no-store", r.getHeaders().getCacheControl());
        verify(service).inspect(new ResultRestrictionRequest("1", "2", "3", "RAW-1", "1700000000000"), request);
    }

    @Test
    public void deniedCurrentActorCannotExposeData() {
        doThrow(new AccessDeniedException("private-detail")).when(service).inspect(any(), eq(request));
        var r = controller.inspect("1", request);
        assertEquals(403, r.getStatusCode().value());
        assertEquals("RESULT_RESTRICTION_DENIED", ((Map<?, ?>) r.getBody()).get("code"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }

    @Test
    public void exactConflictKeepsOnlyAuthoritativelyBoundOwner() {
        request.setAttribute("resultRestrictionCurrentUserId", "7");
        doThrow(new ResultRestrictionException(409, "RESULT_RESTRICTION_VERSION_CHANGED")).when(service).inspect(any(),
                eq(request));
        var r = controller.inspect("1", request);
        assertEquals(409, r.getStatusCode().value());
        assertEquals("7", ((Map<?, ?>) r.getBody()).get("currentUserId"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }

    @Test
    public void databaseErrorIsUnavailableNotEmptyOrStackTrace() {
        doThrow(new IllegalStateException("database detail")).when(service).inspect(any(), eq(request));
        var r = controller.inspect("1", request);
        assertEquals(503, r.getStatusCode().value());
        assertEquals("RESULT_RESTRICTION_UNAVAILABLE", ((Map<?, ?>) r.getBody()).get("code"));
        assertFalse(r.getBody().toString().contains("database detail"));
        assertEquals("no-store", r.getHeaders().getCacheControl());
    }

    private ResultRestrictionResponse response(boolean open, boolean edit, boolean unknown, boolean masked) {
        var q = new ResultRestrictionRequest("1", "2", "3", "RAW-1", "1700000000000");
        var identity = new Identity("4", "2", "1", "3", "RAW-1", "1700000000000", null, null);
        var specimen = unknown ? new Status(null, "SAMPLE", null, null, null, false)
                : new Status("20", "SAMPLE", "Sample", "Entered", "录入", true);
        var analysis = unknown ? new Status(null, "ANALYSIS", null, null, null, false)
                : new Status("4", "ANALYSIS", "Analysis", "NotStarted", "未开始", true);
        var facts = new Facts(new DateFact(FactState.RECORDED, "2026-10-14T18:51:00Z"),
                new DateFact(FactState.MISSING, null), new RequestFact(FactState.UNKNOWN, null, null),
                new AcceptanceFact(FactState.MISSING, null, null));
        var target = open ? new Target("4", "2", "5", "1", "3", "RAW-1", "RAW-1.1") : null;
        var current = new SpecimenLookupService.Current("4", "RAW-1", "1", masked,
                masked ? null : new SpecimenLookupService.Patient("9", "张", "伟", "M", "1990-01-01"),
                List.of(new SpecimenLookupService.RequestedSpecimen("5", "7", "全血", "COLLECTED", "2"),
                        new SpecimenLookupService.RequestedSpecimen("6", "7", "全血", "REQUESTED", null)),
                List.of(new SpecimenLookupService.PhysicalSpecimen("2", "5", "1", "7", "20", false, false,
                        "2026-10-14T18:51:00Z", null, "NOT_RECORDED", null, null, null, null, null),
                        new SpecimenLookupService.PhysicalSpecimen("8", null, "2", "7", "20", false, false, null, null,
                                "NOT_RECORDED", null, null, null, null, null)),
                null);
        var lookup = open
                ? new SpecimenLookupService.Result(1, "specimen_lookup", true, "specimen",
                        new SpecimenLookupService.Selection("4", "2", "5"), current, "2026-10-14T18:51:00Z")
                : null;
        String unavailable = open ? null : "RECEPTION_PERMISSION_REQUIRED";
        return new ResultRestrictionResponse("2", "7", true, q, identity, specimen, analysis,
                "error.results.specimenIntakeMissing", facts, List.of("RECEIPT_NOT_RECORDED"), open, unavailable, edit,
                edit ? null : open ? "RECEPTION_UPDATE_PERMISSION_REQUIRED" : unavailable, target, lookup, List.of());
    }

    private JsonNode wire(String name, ResultRestrictionResponse value) throws Exception {
        when(service.inspect(any(), any())).thenReturn(value);
        var converter = new AppConfig().jacksonMessageConverter();
        var mvc = MockMvcBuilders.standaloneSetup(controller).setMessageConverters(converter).build();
        String body = mvc.perform(get("/rest/results-entry/analysis/1/restriction").param("queryVersion", "2")
                .param("sampleItemId", "2").param("testId", "3").param("labNumber", "RAW-1")
                .param("analysisLastupdated", "1700000000000")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        String output = System.getProperty("restrictionWireOutput");
        if (output != null) {
            Files.createDirectories(Path.of(output));
            Files.writeString(Path.of(output, name + ".json"), body);
        }
        return converter.getObjectMapper().readTree(body);
    }

    private void explicitNull(JsonNode object, String... fields) {
        for (String field : fields) {
            assertTrue("required nullable key " + field, object.has(field));
            assertTrue("explicit null for " + field, object.get(field).isNull());
        }
    }

    @Test
    public void actualConverterKeepsMissingReceiptAndAcceptanceNullFields() throws Exception {
        var body = wire("editable", response(true, true, false, false));
        explicitNull(body, "actionUnavailableReason", "intakeEditUnavailableReason");
        explicitNull(body.get("facts").get("receipt"), "value");
        explicitNull(body.get("facts").get("request"), "id", "statusCode");
        explicitNull(body.get("facts").get("acceptance"), "id", "decision");
        assertEquals("MISSING", body.get("facts").get("receipt").get("state").asText());
        assertEquals("2026-10-14T18:51:00Z", body.get("facts").get("collection").get("value").asText());
        assertEquals("1", body.get("identity").get("analysisId").asText());
    }

    @Test
    public void actualConverterKeepsAbsentIntakeTargetExplicitWithoutGrantingCapability() throws Exception {
        var body = wire("no-intake", response(false, false, false, false));
        explicitNull(body, "target", "intakeLookup");
        assertFalse(body.get("canOpenIntake").asBoolean());
        assertFalse(body.get("canEditIntake").asBoolean());
        assertEquals("RECEPTION_PERMISSION_REQUIRED", body.get("actionUnavailableReason").asText());
    }

    @Test
    public void actualConverterKeepsUnknownStatusAndVersionNullFields() throws Exception {
        var body = wire("unknown", response(false, false, true, false));
        explicitNull(body.get("identity"), "sampleLastupdated", "sampleItemLastupdated");
        for (String kind : List.of("specimenStatus", "analysisStatus")) {
            explicitNull(body.get(kind), "statusId", "actualStatusType", "statusCode", "statusName");
            assertFalse(body.get(kind).get("known").asBoolean());
        }
    }

    @Test
    public void actualConverterKeepsMaskedPatientNullWithoutExposingThePatient() throws Exception {
        var body = wire("masked", response(true, false, false, true));
        var current = body.get("intakeLookup").get("current");
        assertTrue(current.get("patientMasked").asBoolean());
        explicitNull(current, "patient");
        assertFalse(body.get("canEditIntake").asBoolean());
        assertEquals("RECEPTION_UPDATE_PERMISSION_REQUIRED", body.get("intakeEditUnavailableReason").asText());
    }

    @Test
    public void actualConverterKeepsUncollectedRequestAndUnlinkedTubeIdentitiesNull() throws Exception {
        var body = wire("unlinked", response(true, true, false, false));
        var current = body.get("intakeLookup").get("current");
        explicitNull(current.get("requestedSpecimens").get(1), "sampleItemId");
        explicitNull(current.get("physicalSpecimens").get(1), "requestId");
        assertEquals("2", current.get("requestedSpecimens").get(0).get("sampleItemId").asText());
        assertEquals("5", current.get("physicalSpecimens").get(0).get("requestId").asText());
    }
}
