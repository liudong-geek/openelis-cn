package org.openelisglobal.dataexchange.fhir;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.server.IResourceProvider;
import ca.uhn.fhir.rest.server.RestfulServer;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.List;
import org.apache.http.HttpVersion;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpUriRequest;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.message.BasicStatusLine;
import org.hl7.fhir.r4.model.*;
import org.junit.Test;
import org.openelisglobal.fhir.providers.*;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;

public class FhirPublicationIncludeGuardTest {
    @Test
    public void rejectsFirstPageBeforeAnUnguardedLaterClinicalPageCanBeFollowed() throws Exception {
        Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(2);
        upstream.addEntry().setResource(new Patient().setId("patient-one"));
        upstream.addLink().setRelation("next").setUrl("https://store.invalid/fhir?_getpages=later-clinical-page");
        UnprocessableEntityException error = assertThrows(UnprocessableEntityException.class, () -> forward(upstream));
        assertEquals(422, error.getStatusCode());
        assertTrue(error.getMessage().contains("缩小查询范围"));
        assertFalse(error.getMessage().contains("store.invalid"));
    }

    @Test
    public void retainsSinglePageContentAndTotalWhileReplacingOnlyUpstreamSelf() throws Exception {
        Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(1);
        Patient patient = new Patient();
        patient.setId("patient-one");
        patient.addName().setFamily("合成患者");
        upstream.addEntry().setResource(patient).getSearch().setMode(Bundle.SearchEntryMode.MATCH);
        upstream.addLink().setRelation("self").setUrl("https://store.invalid/fhir/Patient?identifier=patient-one");
        Bundle result = forward(upstream);
        assertEquals(1, result.getTotal());
        assertEquals(1, result.getEntry().size());
        assertEquals(Bundle.SearchEntryMode.MATCH, result.getEntryFirstRep().getSearch().getMode());
        assertEquals("合成患者", ((Patient) result.getEntryFirstRep().getResource()).getNameFirstRep().getFamily());
        assertEquals("https://lis.example.test/lis/fhir/Patient?identifier=patient-one&_count=10",
                result.getLink("self").getUrl());
    }

    @Test
    public void rejectsOtherNavigationAndNestedBundleLinksWithoutReturningAnIncompleteSuccess() throws Exception {
        for (String relation : List.of("previous", "first", "last", "alternate")) {
            Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(20);
            upstream.addLink().setRelation(relation).setUrl("https://store.invalid/fhir?_getpages=opaque");
            assertThrows(relation, UnprocessableEntityException.class, () -> forward(upstream));
        }
        Bundle nested = new Bundle().setType(Bundle.BundleType.SEARCHSET);
        nested.addLink().setRelation("self").setUrl("https://store.invalid/fhir/Patient");
        Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(1);
        upstream.addEntry().setResource(nested);
        assertThrows(UnprocessableEntityException.class, () -> forward(upstream));
    }

    @Test
    public void allFiveActualFhirSearchRoutesReturn422InsteadOfWrappingAs500() throws Exception {
        Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(2);
        upstream.addLink().setRelation("next").setUrl("https://store.invalid/fhir?_getpages=opaque");
        List<IResourceProvider> providers = List.of(new PatientProvider(), new ServiceRequestProvider(),
                new SpecimenProvider(), new PractitionerProvider(), new OrganizationProvider());
        RestfulServer server = new RestfulServer(FhirContext.forR4());
        for (IResourceProvider provider : providers)
            ReflectionTestUtils.setField(provider, "util", utilFor(upstream));
        server.setResourceProviders(providers);
        MockServletContext servletContext = new MockServletContext();
        servletContext.setContextPath("/lis");
        server.init(new MockServletConfig(servletContext));
        try {
            for (String type : List.of("Patient", "ServiceRequest", "Specimen", "Practitioner", "Organization")) {
                MockHttpServletRequest request = requestFor(type);
                request.setQueryString("_count=1");
                request.addParameter("_count", "1");
                MockHttpServletResponse response = new MockHttpServletResponse();
                server.service(request, response);
                assertEquals(type + ": " + response.getContentAsString(), 422, response.getStatus());
                String body = response.getContentAsString();
                assertTrue(body.contains("OperationOutcome"));
                assertTrue(body.contains("缩小查询范围"));
                assertFalse(body.contains("store.invalid"));
            }
        } finally {
            server.destroy();
        }
    }

    @Test
    public void actualReverseIncludeReturns422WithoutUnissuedClinicalContent() throws Exception {
        Bundle upstream = new Bundle().setType(Bundle.BundleType.SEARCHSET).setTotal(1);
        upstream.addEntry().setResource(new ServiceRequest().setId("request-one"));
        Observation result = new Observation();
        result.setId("unissued-result");
        result.setValue(new StringType("PRIVATE_CLINICAL_RESULT"));
        upstream.addEntry().setResource(result).getSearch().setMode(Bundle.SearchEntryMode.INCLUDE);
        ServiceRequestProvider provider = new ServiceRequestProvider();
        ReflectionTestUtils.setField(provider, "util", utilFor(upstream));
        RestfulServer server = new RestfulServer(FhirContext.forR4());
        server.setResourceProviders(provider);
        MockServletContext servletContext = new MockServletContext();
        servletContext.setContextPath("/lis");
        server.init(new MockServletConfig(servletContext));
        try {
            MockHttpServletRequest request = requestFor("ServiceRequest");
            request.setQueryString("_revinclude=Observation%3Abased-on");
            request.addParameter("_revinclude", "Observation:based-on");
            MockHttpServletResponse response = new MockHttpServletResponse();
            server.service(request, response);
            assertEquals(response.getContentAsString(), 422, response.getStatus());
            String body = response.getContentAsString();
            assertTrue(body.contains("OperationOutcome"));
            assertTrue(body.contains("正式报告"));
            assertFalse(body.contains("PRIVATE_CLINICAL_RESULT"));
            assertFalse(body.contains("unissued-result"));
        } finally {
            server.destroy();
        }
    }

    private Bundle forward(Bundle upstream) throws Exception {
        return utilFor(upstream).forwardSearchToFhirStore(requestFor("Patient"));
    }

    private FhirUtil utilFor(Bundle upstream) throws Exception {
        FhirContext context = FhirContext.forR4();
        FhirConfig configuration = new FhirConfig();
        ReflectionTestUtils.setField(configuration, "localFhirStorePath", "https://store.invalid/fhir");
        CloseableHttpClient transport = mock(CloseableHttpClient.class);
        CloseableHttpResponse response = mock(CloseableHttpResponse.class);
        when(response.getStatusLine()).thenReturn(new BasicStatusLine(HttpVersion.HTTP_1_1, 200, "OK"));
        when(response.getEntity()).thenReturn(new StringEntity(context.newJsonParser().encodeResourceToString(upstream),
                ContentType.APPLICATION_JSON));
        when(transport.execute(any(HttpUriRequest.class))).thenReturn(response);
        FhirUtil util = new FhirUtil();
        ReflectionTestUtils.setField(util, "fhirContext", context);
        ReflectionTestUtils.setField(util, "fhirConfig", configuration);
        ReflectionTestUtils.setField(util, "closeableHttpClient", transport);
        return util;
    }

    private MockHttpServletRequest requestFor(String type) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/lis/fhir/" + type);
        request.setContextPath("/lis");
        request.setServletPath("/fhir");
        request.setPathInfo("/" + type);
        request.setScheme("https");
        request.setServerName("lis.example.test");
        request.setServerPort(443);
        request.setQueryString("identifier=patient-one&_count=10");
        request.addHeader("Accept", "application/fhir+json");
        return request;
    }

    @Test
    public void permitsNonclinicalPatientSearch() {
        Bundle bundle = new Bundle();
        bundle.addEntry().setResource(new Patient());
        FhirUtil.rejectStagedClinicalContent(bundle);
    }

    @Test
    public void blocksReverseIncludedStagedResults() {
        Bundle bundle = new Bundle();
        bundle.addEntry().setResource(new Patient());
        bundle.addEntry().setResource(new Observation());
        assertThrows(UnprocessableEntityException.class, () -> FhirUtil.rejectStagedClinicalContent(bundle));
    }

    @Test
    public void blocksNestedReportsAndContainedResults() {
        Patient patient = new Patient();
        patient.addContained(new DiagnosticReport());
        Bundle nested = new Bundle();
        nested.addEntry().setResource(patient);
        Bundle outer = new Bundle();
        outer.addEntry().setResource(nested);
        assertThrows(UnprocessableEntityException.class, () -> FhirUtil.rejectStagedClinicalContent(outer));
    }
}
