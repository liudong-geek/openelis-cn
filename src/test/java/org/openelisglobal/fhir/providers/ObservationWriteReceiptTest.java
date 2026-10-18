package org.openelisglobal.fhir.providers;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.server.RestfulServer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.StringType;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.fhir.service.FhirClinicalTestReadiness;
import org.openelisglobal.fhir.service.FhirObservationIntakeGuard;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Actual HAPI write contract; persistence and authorization services are test
 * doubles.
 */
public class ObservationWriteReceiptTest {
    private static final UUID RESULT_UUID = UUID.fromString("10000000-0000-0000-0000-000000000050");
    private static final String CLINICAL_MARKER = "UNISSUED-CLINICAL";
    private final Map<Class<?>, Object> beans = new HashMap<>();
    private Object originalFactory;
    private Object originalFormFields;
    private RestfulServer servlet;
    private FhirTransformService transforms;
    private FhirObservationIntakeGuard guard;
    private LogbookResultsPersistService persistence;
    private ResultService results;
    private Result existing;
    private Analysis analysis;

    @Before
    public void setup() throws Exception {
        originalFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        originalFormFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(any(Class.class))).thenAnswer(call -> bean(call.getArgument(0)));
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        when(bean(DefaultConfigurationProperties.class).getPropertyValueUpperCase(any())).thenReturn("");

        Sample sample = new Sample();
        sample.setId("10");
        sample.setAccessionNumber("TEST-INCOMING-10");
        SampleItem specimen = new SampleItem();
        specimen.setId("20");
        specimen.setSample(sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("30");
        analysis = new Analysis();
        analysis.setId("40");
        analysis.setTest(test);
        analysis.setSampleItem(specimen);
        analysis.setRevision("1");
        TestResult definition = new TestResult();
        definition.setId("60");
        definition.setTest(test);
        definition.setTestResultType("N");
        definition.setIsActive(true);
        when(bean(TestResultService.class).getActiveTestResultsByTest("30")).thenReturn(List.of(definition));
        when(bean(AnalysisService.class).get("40")).thenReturn(analysis);
        when(bean(SampleItemService.class).get("20")).thenReturn(specimen);
        when(bean(SampleHumanService.class).getMatch("sampleId", "10")).thenReturn(Optional.of(new SampleHuman()));
        when(bean(SampleService.class).getSampleByAccessionNumber("TEST-INCOMING-10")).thenReturn(sample);
        when(bean(IStatusService.class).getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("TECHNICAL");
        existing = new Result();
        populateExisting(existing, definition);
        results = bean(ResultService.class);
        doAnswer(call -> {
            populateExisting(call.getArgument(0), definition);
            return null;
        }).when(results).getData(any(Result.class));

        guard = bean(FhirObservationIntakeGuard.class);
        when(guard.validate(any(), eq("8"), nullable(Result.class))).thenReturn(analysis);
        transforms = bean(FhirTransformService.class);
        when(transforms.getItemByFhirId(RESULT_UUID.toString(), results)).thenReturn(existing);
        when(transforms.createResultFromObservation(any())).thenAnswer(call -> {
            TestResultItem item = new TestResultItem();
            item.setAnalysisId("40");
            item.setSampleItemId("20");
            item.setTestId("30");
            item.setAccessionNumber("TEST-INCOMING-10");
            item.setResultType("N");
            item.setResultValue("85.5");
            return item;
        });
        when(transforms.transformResultToObservation(any())).thenAnswer(call -> {
            Observation leaked = new Observation();
            leaked.setId("Observation/" + RESULT_UUID);
            leaked.setStatus(Observation.ObservationStatus.FINAL);
            leaked.setValue(new StringType(CLINICAL_MARKER));
            return leaked;
        });
        persistence = bean(LogbookResultsPersistService.class);
        doAnswer(call -> {
            ResultsUpdateDataSet data = call.getArgument(0);
            data.getNewResults().forEach(row -> {
                row.result.setId("50");
                row.result.setFhirUuid(RESULT_UUID);
            });
            return null;
        }).when(persistence).persistDataSet(any(), anyList(), eq("8"));
        ObservationProvider provider = new ObservationProvider();
        ReflectionTestUtils.setField(provider, "intakeGuard", guard);
        ReflectionTestUtils.setField(provider, "testReadiness", bean(FhirClinicalTestReadiness.class));
        ReflectionTestUtils.setField(provider, "fhirTransformService", transforms);
        ReflectionTestUtils.setField(provider, "sampleItemService", bean(SampleItemService.class));
        ReflectionTestUtils.setField(provider, "sampleHumanService", bean(SampleHumanService.class));
        ReflectionTestUtils.setField(provider, "statusService", bean(IStatusService.class));
        ReflectionTestUtils.setField(provider, "resultService", results);
        ReflectionTestUtils.setField(provider, "logbookResultsPersistService", persistence);
        servlet = new RestfulServer(FhirContext.forR4());
        servlet.setResourceProviders(provider);
        servlet.init(new MockServletConfig(new MockServletContext()));
    }

    @After
    public void cleanup() {
        if (servlet != null)
            servlet.destroy();
        ReflectionTestUtils.setField(SpringContext.class, "factory", originalFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", originalFormFields);
    }

    @Test
    public void createRepresentationIsOnlyAReceipt() throws Exception {
        verifyWrite("POST", "return=representation");
    }

    @Test
    public void updateRepresentationIsOnlyAReceipt() throws Exception {
        verifyWrite("PUT", "return=representation");
    }

    @Test
    public void createDefaultCannotPublishTheResult() throws Exception {
        verifyWrite("POST", null);
    }

    @Test
    public void updateDefaultCannotPublishTheResult() throws Exception {
        verifyWrite("PUT", null);
    }

    @Test
    public void createOperationOutcomeContainsNoClinicalData() throws Exception {
        verifyWrite("POST", "return=OperationOutcome");
    }

    @Test
    public void updateOperationOutcomeContainsNoClinicalData() throws Exception {
        verifyWrite("PUT", "return=OperationOutcome");
    }

    private void verifyWrite(String method, String preference) throws Exception {
        boolean create = method.equals("POST");
        String path = "/Observation" + (create ? "" : "/" + RESULT_UUID);
        MockHttpServletRequest request = new MockHttpServletRequest(method, "/fhir" + path);
        request.setServletPath("/fhir");
        request.setPathInfo(path);
        request.addHeader("Accept", "application/fhir+json");
        request.setContentType("application/fhir+json");
        if (preference != null)
            request.addHeader("Prefer", preference);
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(8);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        String body = "{\"resourceType\":\"Observation\"," + (create ? "" : "\"id\":\"" + RESULT_UUID + "\",")
                + "\"status\":\"final\",\"code\":{\"text\":\"" + CLINICAL_MARKER
                + "\"},\"valueQuantity\":{\"value\":85.5,\"unit\":\"g/L\"}}";
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();
        servlet.service(request, response);
        String responseBody = response.getContentAsString();
        assertEquals(responseBody, create ? 201 : 200, response.getStatus());
        assertFalse(responseBody, responseBody.contains(CLINICAL_MARKER));
        assertFalse(responseBody, responseBody.contains("valueQuantity"));
        assertFalse(responseBody, responseBody.contains("valueString"));
        assertFalse(responseBody, responseBody.contains("\"resourceType\":\"Observation\""));
        // HAPI 7 uses Location for POST and Content-Location for both POST/PUT.
        String location = response.getHeader(create ? "Location" : "Content-Location");
        assertNotNull("Stable result identity must survive a receipt-only response", location);
        assertTrue(location, location.endsWith("/Observation/" + RESULT_UUID));
        if ("return=OperationOutcome".equals(preference))
            assertTrue(responseBody, responseBody.contains("OperationOutcome"));
        verify(guard).validate(any(), eq("8"), create ? isNull() : same(existing));
        verify(persistence)
                .persistDataSet(
                        argThat(data -> !data.getModifiedItems().isEmpty()
                                && "TECHNICAL".equals(data.getModifiedAnalysis().get(0).getStatusId())),
                        anyList(), eq("8"));
        verify(transforms).transformPersistResultsEntryFhirObjects(any());
        verify(transforms, never()).transformResultToObservation(any());
    }

    private void populateExisting(Result result, TestResult definition) {
        result.setId("50");
        result.setFhirUuid(RESULT_UUID);
        result.setAnalysis(analysis);
        result.setTestResult(definition);
        result.setResultType("N");
        result.setValue("80.0");
    }

    @SuppressWarnings("unchecked")
    private <T> T bean(Class<T> type) {
        return (T) beans.computeIfAbsent(type, ignored -> mock(type));
    }
}
