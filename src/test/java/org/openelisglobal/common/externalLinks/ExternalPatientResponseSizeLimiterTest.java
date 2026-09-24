package org.openelisglobal.common.externalLinks;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class ExternalPatientResponseSizeLimiterTest {

    @Test
    public void readUtf8AcceptsResponseAtLimit() throws Exception {
        byte[] response = "患者".getBytes(StandardCharsets.UTF_8);

        String value = ExternalPatientResponseSizeLimiter.readUtf8(new ByteArrayInputStream(response), response.length);

        assertEquals("患者", value);
    }

    @Test
    public void readUtf8RejectsOnFirstByteOverLimit() {
        CountingInputStream response = new CountingInputStream("123456".getBytes(StandardCharsets.UTF_8));

        assertThrows(ExternalPatientResponseTooLargeException.class,
                () -> ExternalPatientResponseSizeLimiter.readUtf8(response, 5));
        assertEquals(6, response.getBytesRead());
    }

    @Test
    public void utf8StringCheckCountsMultibyteContentWithoutEncodingCopy() {
        ExternalPatientResponseSizeLimiter.requireUtf8WithinLimit("患者", 6);

        assertThrows(ExternalPatientResponseTooLargeException.class,
                () -> ExternalPatientResponseSizeLimiter.requireUtf8WithinLimit("患者", 5));
    }

    @Test
    public void integerMaximumLimitDoesNotOverflowTheReadLength() throws Exception {
        byte[] response = "ok".getBytes(StandardCharsets.UTF_8);

        assertEquals("ok",
                ExternalPatientResponseSizeLimiter.readUtf8(new ByteArrayInputStream(response), Integer.MAX_VALUE));
    }

    @Test
    public void configuredLimitMustBePositiveAndReasonablyBounded() {
        assertThrows(IllegalArgumentException.class,
                () -> ExternalPatientResponseSizeLimiter.validateConfiguredLimit(0));
        assertThrows(IllegalArgumentException.class,
                () -> ExternalPatientResponseSizeLimiter.validateConfiguredLimit(Integer.MAX_VALUE));
        assertEquals(1024, ExternalPatientResponseSizeLimiter.validateConfiguredLimit(1024));
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
