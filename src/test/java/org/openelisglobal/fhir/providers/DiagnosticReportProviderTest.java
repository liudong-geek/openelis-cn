package org.openelisglobal.fhir.providers;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.server.RestfulServer;
import ca.uhn.fhir.rest.server.exceptions.*;
import java.util.List;
import org.hl7.fhir.r4.model.*;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.report.service.impl.ReportPublicationService;
import org.springframework.mock.web.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

public class DiagnosticReportProviderTest {
    private DiagnosticReportProvider provider;
    private ReportPublicationService publications;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        provider = new DiagnosticReportProvider();
        publications = mock(ReportPublicationService.class);
        FhirConfig config = mock(FhirConfig.class);
        when(config.getOeFhirSystem()).thenReturn("https://lis.example.test");
        ReflectionTestUtils.setField(provider, "publications", publications);
        ReflectionTestUtils.setField(provider, "configuration", config);
        request = new MockHttpServletRequest();
        signedIn(request);
    }

    @Test
    public void unissuedAndMissingReturn404() {
        assertThrows(ResourceNotFoundException.class,
                () -> provider.readDiagnosticReport(new IdType("cn-report-10"), request));
    }

    @Test
    public void onlyReturnsTheCentralFrozenProjection() {
        var original = new DiagnosticReport().setStatus(DiagnosticReport.DiagnosticReportStatus.FINAL);
        when(publications.read(eq("cn-report-10"), eq("8"))).thenReturn(original);
        assertSame(original, provider.readDiagnosticReport(new IdType("cn-report-10"), request));
    }

    @Test public void scopeDeniedReturns403WithoutPayload() {
        when(publications.read(anyString(),eq("8"))).thenThrow(new AccessDeniedException("internal"));
        assertThrows(ForbiddenOperationException.class, () -> provider.readDiagnosticReport(new IdType("cn-report-10"),request));
    }

    @Test public void corruptSignatureOrAmbiguousIdentityReturns500() {
        when(publications.read(anyString(),eq("8"))).thenThrow(new IllegalStateException("private payload"));
        var error = assertThrows(InternalErrorException.class, () -> provider.readDiagnosticReport(new IdType("cn-report-10"),request));
        assertFalse(error.getMessage().contains("private payload"));
    }

    @Test public void invalidIdentifierReturns400() {
        when(publications.read(anyString(),eq("8"))).thenThrow(new IllegalArgumentException());
        assertThrows(InvalidRequestException.class, () -> provider.readDiagnosticReport(new IdType("bad"),request));
    }

    @Test
    public void searchRequiresExplicitReportNumberAndRejectsLegacyIncludes() {
        assertThrows(InvalidRequestException.class, () -> provider.searchDiagnosticReports(null, request));
        request.addParameter("identifier", "BG001");
        request.addParameter("_include", "*");
        assertThrows(InvalidRequestException.class, () -> provider.searchDiagnosticReports(null, request));
        verifyZeroInteractions(publications);
    }

    @Test
    public void searchUsesQualifiedFormalIdentityOnly() {
        request.addParameter("identifier", "https://lis.example.test/report-number|BG001");
        when(publications.search(eq("BG001"), isNull(), eq("8"), eq(100)))
                .thenReturn(List.of(new DiagnosticReport().setStatus(DiagnosticReport.DiagnosticReportStatus.FINAL)));
        Bundle response = provider.searchDiagnosticReports(null, request);
        assertEquals(1, response.getTotal());
        assertEquals(Bundle.BundleType.SEARCHSET, response.getType());
    }

    @Test
    public void actualFhirServletUsesPublishedReadAndIdentitySearch() throws Exception {
        var report = new DiagnosticReport();
        report.setId("cn-report-10");
        report.setStatus(DiagnosticReport.DiagnosticReportStatus.FINAL);
        when(publications.read(eq("cn-report-10"), eq("8"))).thenReturn(report);
        when(publications.search(eq("BG001"), isNull(), eq("8"), eq(100))).thenReturn(List.of(report));
        RestfulServer servlet = new RestfulServer(FhirContext.forR4());
        servlet.setResourceProviders(provider);
        servlet.init(new MockServletConfig(new MockServletContext()));
        try {
            MockHttpServletRequest get = http("/DiagnosticReport/cn-report-10");
            MockHttpServletResponse response = new MockHttpServletResponse();
            servlet.service(get, response);
            assertEquals(response.getContentAsString(), 200, response.getStatus());
            assertTrue(response.getContentAsString().contains("cn-report-10"));
            get = http("/DiagnosticReport");
            get.addParameter("identifier", "BG001");
            get.setQueryString("identifier=BG001");
            response = new MockHttpServletResponse();
            servlet.service(get, response);
            assertEquals(response.getContentAsString(), 200, response.getStatus());
            assertTrue(response.getContentAsString().contains("searchset"));
        } finally {
            servlet.destroy();
        }
    }

    private void signedIn(MockHttpServletRequest request) {
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(8);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
    }

    private MockHttpServletRequest http(String path) {
        var get = new MockHttpServletRequest("GET", "/fhir" + path);
        get.setServletPath("/fhir");
        get.setPathInfo(path);
        get.addHeader("Accept", "application/fhir+json");
        signedIn(get);
        return get;
    }
}
