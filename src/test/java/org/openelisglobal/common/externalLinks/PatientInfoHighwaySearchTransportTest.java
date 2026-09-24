package org.openelisglobal.common.externalLinks;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import org.apache.http.HttpVersion;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.BasicHttpEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.message.BasicHeader;
import org.apache.http.message.BasicStatusLine;
import org.apache.http.util.EntityUtils;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.test.util.ReflectionTestUtils;

public class PatientInfoHighwaySearchTransportTest {

    @Test
    public void oversizedSoapFaultIsRejectedBeforeSaajParsing() throws Exception {
        int limit = 192;
        String fault = soapEnvelope("<soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>"
                + "x".repeat(1024) + "</faultstring></soapenv:Fault>");
        CountingInputStream body = new CountingInputStream(fault.getBytes(StandardCharsets.UTF_8));
        CloseableHttpClient client = clientResponding(500, body, -1);
        PatientInfoHighwaySearch search = configuredSearch(client, limit);

        assertEquals(Integer.valueOf(502), search.runExternalSearch().get());
        assertEquals(limit + 1, body.getBytesRead());
    }

    @Test
    public void malformedSuccessfulSoapResponseCompletesAsBadGateway() throws Exception {
        byte[] malformed = "<not-soap/>".getBytes(StandardCharsets.UTF_8);
        PatientInfoHighwaySearch search = configuredSearch(
                clientResponding(200, new CountingInputStream(malformed), malformed.length), 4096);

        assertEquals(Integer.valueOf(502), search.runExternalSearch().get());
    }

    @Test
    public void soapDoctypeIsRejectedBeforeSaajParsing() throws Exception {
        String response = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<!DOCTYPE soapenv:Envelope [<!ENTITY xxe SYSTEM \"file:///definitely-not-readable\">]>"
                + "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">"
                + "<soapenv:Body><soapenv:Fault><faultcode>&xxe;</faultcode></soapenv:Fault>"
                + "</soapenv:Body></soapenv:Envelope>";
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        PatientInfoHighwaySearch search = configuredSearch(
                clientResponding(200, new CountingInputStream(bytes), bytes.length), 4096);

        assertEquals(Integer.valueOf(502), search.runExternalSearch().get());
    }

    @Test
    public void socketTimeoutCompletesAsBadGateway() throws Exception {
        CloseableHttpClient client = mock(CloseableHttpClient.class);
        when(client.execute(any(HttpPost.class))).thenThrow(new SocketTimeoutException("read timed out"));
        PatientInfoHighwaySearch search = configuredSearch(client, 4096);

        assertEquals(Integer.valueOf(502), search.runExternalSearch().get());
    }

    @Test
    public void configuresConnectionPoolAndReadTimeouts() {
        PatientInfoHighwaySearch search = configuredSearch(mock(CloseableHttpClient.class), 4096);

        assertEquals(1000, search.createRequestConfig().getConnectTimeout());
        assertEquals(1000, search.createRequestConfig().getConnectionRequestTimeout());
        assertEquals(1000, search.createRequestConfig().getSocketTimeout());
        assertFalse(search.createRequestConfig().isRedirectsEnabled());
    }

    @Test
    public void invalidTimeoutFailsConfigurationValidation() {
        PatientInfoHighwaySearch search = configuredSearch(mock(CloseableHttpClient.class), 4096);
        ReflectionTestUtils.setField(search, "timeout", 0);

        assertThrows(IllegalArgumentException.class, search::validateConfiguration);
    }

    @Test
    public void httpTransportKeepsSoap11ActionAndRequestEnvelope() throws Exception {
        String response = soapEnvelope(
                "<ns3:queryResponse xmlns:ns3=\"http://ws.server.mhaccess.crimsonlogic.com/\"><return/>"
                        + "</ns3:queryResponse>");
        CloseableHttpClient client = clientResponding(200,
                new CountingInputStream(response.getBytes(StandardCharsets.UTF_8)), -1);
        PatientInfoHighwaySearch search = configuredSearch(client, 4096);

        assertEquals(Integer.valueOf(200), search.runExternalSearch().get());

        ArgumentCaptor<HttpPost> request = ArgumentCaptor.forClass(HttpPost.class);
        verify(client).execute(request.capture());
        assertEquals("query", request.getValue().getFirstHeader("SOAPAction").getValue());
        assertTrue(request.getValue().getFirstHeader("Content-Type").getValue().startsWith("text/xml"));
        String requestXml = EntityUtils.toString(request.getValue().getEntity(), StandardCharsets.UTF_8);
        assertTrue(requestXml.contains("http://schemas.xmlsoap.org/soap/envelope/"));
        assertTrue(requestXml.contains("<ws:query"));
    }

    private PatientInfoHighwaySearch configuredSearch(CloseableHttpClient client, int maxResponseBytes) {
        PatientInfoHighwaySearch search = new PatientInfoHighwaySearch() {
            @Override
            protected CloseableHttpClient createHttpClient() {
                return client;
            }
        };
        ReflectionTestUtils.setField(search, "timeout", 1000);
        ReflectionTestUtils.setField(search, "maxResponseBytes", maxResponseBytes);
        ReflectionTestUtils.setField(search, "externalPatientSearchExecutor", new TaskExecutorAdapter(Runnable::run));
        search.setSearchCriteria("Li", null, null, null, null, null);
        search.setConnectionCredentials("https://infohighway.example/service", "user", "secret");
        return search;
    }

    private CloseableHttpClient clientResponding(int status, CountingInputStream body, long contentLength)
            throws Exception {
        CloseableHttpClient client = mock(CloseableHttpClient.class);
        CloseableHttpResponse response = mock(CloseableHttpResponse.class);
        BasicHttpEntity entity = new BasicHttpEntity();
        entity.setContent(body);
        entity.setContentLength(contentLength);
        when(response.getEntity()).thenReturn(entity);
        when(response.getStatusLine()).thenReturn(new BasicStatusLine(HttpVersion.HTTP_1_1, status, "upstream"));
        when(response.getAllHeaders())
                .thenReturn(new BasicHeader[] { new BasicHeader("Content-Type", "text/xml; charset=utf-8") });
        when(client.execute(any(HttpPost.class))).thenReturn(response);
        return client;
    }

    private String soapEnvelope(String body) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">" + "<soapenv:Body>"
                + body + "</soapenv:Body></soapenv:Envelope>";
    }

    private static final class CountingInputStream extends ByteArrayInputStream {

        private int bytesRead;

        private CountingInputStream(byte[] bytes) {
            super(bytes);
        }

        @Override
        public synchronized int read(byte[] buffer, int offset, int length) {
            int read = super.read(buffer, offset, length);
            if (read > 0) {
                bytesRead += read;
            }
            return read;
        }

        @Override
        public synchronized int read() {
            int value = super.read();
            if (value != -1) {
                bytesRead++;
            }
            return value;
        }

        private int getBytesRead() {
            return bytesRead;
        }
    }
}
