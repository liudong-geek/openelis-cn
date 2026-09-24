package org.openelisglobal.dataexchange.fhir;

import ca.uhn.fhir.rest.client.apache.ApacheHttpRequest;
import ca.uhn.fhir.rest.client.api.IClientInterceptor;
import ca.uhn.fhir.rest.client.api.IHttpRequest;
import ca.uhn.fhir.rest.client.api.IHttpResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.http.HttpEntity;
import org.apache.http.HttpResponse;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.entity.HttpEntityWrapper;

/**
 * Applies bounded transport settings and limits cumulative decompressed bytes
 * before HAPI materializes resources for one FHIR client search.
 */
public final class FhirResponseSizeLimitInterceptor implements IClientInterceptor {

    static final int MAX_CONFIGURED_RESPONSE_BYTES = 64 * 1024 * 1024;
    static final int DEFAULT_TIMEOUT_MILLIS = 5_000;
    static final String RESPONSE_TOO_LARGE = "FHIR response exceeded the configured byte limit";

    private final int maxResponseBytes;
    private final int timeoutMillis;
    private final AtomicLong cumulativeBytesRead = new AtomicLong();

    public FhirResponseSizeLimitInterceptor(int maxResponseBytes) {
        this(maxResponseBytes, DEFAULT_TIMEOUT_MILLIS);
    }

    public FhirResponseSizeLimitInterceptor(int maxResponseBytes, int timeoutMillis) {
        if (maxResponseBytes < 1 || maxResponseBytes > MAX_CONFIGURED_RESPONSE_BYTES) {
            throw new IllegalArgumentException(
                    "FHIR response byte limit must be between 1 and " + MAX_CONFIGURED_RESPONSE_BYTES);
        }
        if (timeoutMillis < 1) {
            throw new IllegalArgumentException("FHIR patient search timeout must be positive");
        }
        this.maxResponseBytes = maxResponseBytes;
        this.timeoutMillis = timeoutMillis;
    }

    @Override
    public void interceptRequest(IHttpRequest request) {
        if (!(request instanceof ApacheHttpRequest apacheRequest)) {
            throw new IllegalStateException("Bounded FHIR patient search requires the configured Apache HTTP client");
        }
        RequestConfig requestConfig = RequestConfig.custom().setConnectTimeout(timeoutMillis)
                .setConnectionRequestTimeout(timeoutMillis).setSocketTimeout(timeoutMillis).setRedirectsEnabled(false)
                .build();
        apacheRequest.getApacheRequest().setConfig(requestConfig);
    }

    @Override
    public void interceptResponse(IHttpResponse response) throws IOException {
        Object rawResponse = response.getResponse();
        if (!(rawResponse instanceof HttpResponse apacheResponse)) {
            throw new IOException("FHIR response byte limit requires the configured Apache HTTP client");
        }
        HttpEntity entity = apacheResponse.getEntity();
        if (entity == null) {
            return;
        }
        long declaredLength = entity.getContentLength();
        long remainingBytes = maxResponseBytes - cumulativeBytesRead.get();
        if (remainingBytes < 0 || declaredLength > remainingBytes) {
            throw tooLarge();
        }
        apacheResponse.setEntity(new BoundedHttpEntity(entity, maxResponseBytes, cumulativeBytesRead));
    }

    private static IOException tooLarge() {
        return new IOException(RESPONSE_TOO_LARGE);
    }

    private static final class BoundedHttpEntity extends HttpEntityWrapper {

        private final int maxResponseBytes;
        private final AtomicLong cumulativeBytesRead;

        private BoundedHttpEntity(HttpEntity wrappedEntity, int maxResponseBytes, AtomicLong cumulativeBytesRead) {
            super(wrappedEntity);
            this.maxResponseBytes = maxResponseBytes;
            this.cumulativeBytesRead = cumulativeBytesRead;
        }

        @Override
        public InputStream getContent() throws IOException {
            return new BoundedInputStream(wrappedEntity.getContent(), maxResponseBytes, cumulativeBytesRead);
        }

        @Override
        public void writeTo(OutputStream output) throws IOException {
            Objects.requireNonNull(output, "output");
            try (InputStream input = getContent()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
            }
        }
    }

    private static final class BoundedInputStream extends InputStream {

        private final InputStream delegate;
        private final int maxResponseBytes;
        private final AtomicLong cumulativeBytesRead;

        private BoundedInputStream(InputStream delegate, int maxResponseBytes, AtomicLong cumulativeBytesRead) {
            this.delegate = Objects.requireNonNull(delegate, "delegate");
            this.maxResponseBytes = maxResponseBytes;
            this.cumulativeBytesRead = cumulativeBytesRead;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value != -1) {
                recordBytes(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            Objects.checkFromIndexSize(offset, length, buffer.length);
            if (length == 0) {
                return 0;
            }
            long bytesRead = cumulativeBytesRead.get();
            if (bytesRead > maxResponseBytes) {
                throw tooLarge();
            }
            long probeLength = Math.min(length, (long) maxResponseBytes - bytesRead + 1L);
            int read = delegate.read(buffer, offset, (int) probeLength);
            if (read > 0) {
                recordBytes(read);
            }
            return read;
        }

        @Override
        public long skip(long requested) throws IOException {
            if (requested <= 0) {
                return 0;
            }
            long skipped = 0;
            byte[] buffer = new byte[(int) Math.min(8192L, requested)];
            while (skipped < requested) {
                int read = read(buffer, 0, (int) Math.min(buffer.length, requested - skipped));
                if (read == -1) {
                    break;
                }
                skipped += read;
            }
            return skipped;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(delegate.available(),
                    Math.max(0L, (long) maxResponseBytes - cumulativeBytesRead.get()));
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }

        private void recordBytes(int count) throws IOException {
            if (cumulativeBytesRead.addAndGet(count) > maxResponseBytes) {
                throw tooLarge();
            }
        }
    }
}
