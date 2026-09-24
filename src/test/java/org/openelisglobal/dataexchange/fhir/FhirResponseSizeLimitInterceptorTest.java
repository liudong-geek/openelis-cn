package org.openelisglobal.dataexchange.fhir;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.uhn.fhir.rest.client.apache.ApacheHttpRequest;
import ca.uhn.fhir.rest.client.api.IHttpResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.apache.http.HttpVersion;
import org.apache.http.client.HttpClient;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.entity.InputStreamEntity;
import org.apache.http.message.BasicHttpResponse;
import org.apache.http.message.BasicStatusLine;
import org.apache.http.util.EntityUtils;
import org.junit.Test;

public class FhirResponseSizeLimitInterceptorTest {

    @Test
    public void rejectsDeclaredResponseLengthBeforeHapiParsesIt() {
        BasicHttpResponse apacheResponse = response();
        apacheResponse.setEntity(new ByteArrayEntity(new byte[5]));
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(4);

        IOException error = assertThrows(IOException.class,
                () -> interceptor.interceptResponse(hapiResponse(apacheResponse)));

        org.junit.Assert.assertEquals(FhirResponseSizeLimitInterceptor.RESPONSE_TOO_LARGE, error.getMessage());
    }

    @Test
    public void capsUnknownLengthStreamingResponses() throws Exception {
        BasicHttpResponse apacheResponse = response();
        apacheResponse.setEntity(new InputStreamEntity(new ByteArrayInputStream(new byte[] { 1, 2, 3, 4, 5 }), -1));
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(4);
        interceptor.interceptResponse(hapiResponse(apacheResponse));

        assertThrows(IOException.class, () -> EntityUtils.toByteArray(apacheResponse.getEntity()));
    }

    @Test
    public void allowsAResponseAtTheConfiguredBoundary() throws Exception {
        BasicHttpResponse apacheResponse = response();
        apacheResponse.setEntity(new InputStreamEntity(new ByteArrayInputStream(new byte[] { 1, 2, 3, 4 }), -1));
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(4);
        interceptor.interceptResponse(hapiResponse(apacheResponse));

        assertArrayEquals(new byte[] { 1, 2, 3, 4 }, EntityUtils.toByteArray(apacheResponse.getEntity()));
    }

    @Test
    public void cumulativeBudgetRejectsASecondPageThatExceedsTheSearchLimit() throws Exception {
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(4);
        BasicHttpResponse firstPage = streamingResponse(new byte[] { 1, 2, 3 });
        interceptor.interceptResponse(hapiResponse(firstPage));
        assertArrayEquals(new byte[] { 1, 2, 3 }, EntityUtils.toByteArray(firstPage.getEntity()));

        BasicHttpResponse secondPage = streamingResponse(new byte[] { 4, 5 });
        interceptor.interceptResponse(hapiResponse(secondPage));

        IOException error = assertThrows(IOException.class, () -> EntityUtils.toByteArray(secondPage.getEntity()));
        assertEquals(FhirResponseSizeLimitInterceptor.RESPONSE_TOO_LARGE, error.getMessage());
    }

    @Test
    public void cumulativeBudgetAllowsMultiplePagesAtTheExactBoundary() throws Exception {
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(4);
        BasicHttpResponse firstPage = streamingResponse(new byte[] { 1, 2 });
        interceptor.interceptResponse(hapiResponse(firstPage));
        assertArrayEquals(new byte[] { 1, 2 }, EntityUtils.toByteArray(firstPage.getEntity()));

        BasicHttpResponse secondPage = streamingResponse(new byte[] { 3, 4 });
        interceptor.interceptResponse(hapiResponse(secondPage));
        assertArrayEquals(new byte[] { 3, 4 }, EntityUtils.toByteArray(secondPage.getEntity()));
    }

    @Test
    public void appliesFiniteTimeoutsAndDisablesRedirectsOnEveryApacheRequest() {
        HttpGet apacheRequest = new HttpGet("https://registry.example/Patient");
        ApacheHttpRequest hapiRequest = new ApacheHttpRequest(mock(HttpClient.class), apacheRequest);
        FhirResponseSizeLimitInterceptor interceptor = new FhirResponseSizeLimitInterceptor(1024, 1234);

        interceptor.interceptRequest(hapiRequest);

        RequestConfig config = apacheRequest.getConfig();
        assertNotNull(config);
        assertEquals(1234, config.getConnectTimeout());
        assertEquals(1234, config.getConnectionRequestTimeout());
        assertEquals(1234, config.getSocketTimeout());
        assertFalse(config.isRedirectsEnabled());
    }

    @Test
    public void rejectsNonPositiveTimeouts() {
        assertThrows(IllegalArgumentException.class, () -> new FhirResponseSizeLimitInterceptor(1024, 0));
    }

    private static BasicHttpResponse response() {
        return new BasicHttpResponse(new BasicStatusLine(HttpVersion.HTTP_1_1, 200, "OK"));
    }

    private static BasicHttpResponse streamingResponse(byte[] body) {
        BasicHttpResponse response = response();
        response.setEntity(new InputStreamEntity(new ByteArrayInputStream(body), -1));
        return response;
    }

    private static IHttpResponse hapiResponse(BasicHttpResponse apacheResponse) {
        IHttpResponse response = mock(IHttpResponse.class);
        when(response.getResponse()).thenReturn(apacheResponse);
        return response;
    }
}
