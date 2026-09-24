/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 */
package org.openelisglobal.common.externalLinks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class ExternalPatientResponseSizeLimiter {

    static final int DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    static final int MAX_CONFIGURED_RESPONSE_BYTES = 64 * 1024 * 1024;

    private static final int BUFFER_SIZE = 8192;

    private ExternalPatientResponseSizeLimiter() {
    }

    static String readUtf8(InputStream input, int maxResponseBytes) throws IOException {
        return new String(readBytes(input, maxResponseBytes), StandardCharsets.UTF_8);
    }

    /**
     * Reads at most the configured number of bytes and probes exactly one byte past
     * the boundary. The calculation deliberately avoids {@code max + 1}, which
     * overflows when callers use {@link Integer#MAX_VALUE}.
     */
    static byte[] readBytes(InputStream input, int maxResponseBytes) throws IOException {
        requirePositiveLimit(maxResponseBytes);
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maxResponseBytes, BUFFER_SIZE));
        byte[] buffer = new byte[BUFFER_SIZE];
        int total = 0;

        while (true) {
            int remaining = maxResponseBytes - total;
            int read = input.read(buffer, 0, remaining == 0 ? 1 : Math.min(buffer.length, remaining));
            if (read == -1) {
                return output.toByteArray();
            }
            if (read == 0) {
                int next = input.read();
                if (next == -1) {
                    return output.toByteArray();
                }
                if (remaining == 0) {
                    throw new ExternalPatientResponseTooLargeException(maxResponseBytes);
                }
                output.write(next);
                total++;
                continue;
            }
            if (read > maxResponseBytes - total) {
                throw new ExternalPatientResponseTooLargeException(maxResponseBytes);
            }
            output.write(buffer, 0, read);
            total += read;
        }
    }

    static int validateConfiguredLimit(Integer maxResponseBytes) {
        if (maxResponseBytes == null || maxResponseBytes < 1 || maxResponseBytes > MAX_CONFIGURED_RESPONSE_BYTES) {
            throw new IllegalArgumentException(
                    "External patient response byte limit must be between 1 and " + MAX_CONFIGURED_RESPONSE_BYTES);
        }
        return maxResponseBytes;
    }

    static void requireUtf8WithinLimit(String value, int maxResponseBytes) {
        requirePositiveLimit(maxResponseBytes);
        if (value == null) {
            return;
        }

        long bytes = 0;
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character <= 0x7f) {
                bytes++;
            } else if (character <= 0x7ff) {
                bytes += 2;
            } else if (Character.isHighSurrogate(character) && index + 1 < value.length()
                    && Character.isLowSurrogate(value.charAt(index + 1))) {
                bytes += 4;
                index++;
            } else {
                bytes += 3;
            }

            if (bytes > maxResponseBytes) {
                throw new ExternalPatientResponseTooLargeException(maxResponseBytes);
            }
        }
    }

    private static void requirePositiveLimit(int maxResponseBytes) {
        if (maxResponseBytes < 1) {
            throw new IllegalArgumentException("External patient response byte limit must be positive");
        }
    }
}
