package org.openelisglobal.sample.form;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;

/**
 * Frozen pre-decision facts for one actual tube, not a current eligibility
 * token.
 */
public record SpecimenIntakeEvidence(int schema, String sampleVersion, String requestVersion, String itemVersion,
        String typeOfSampleId, String collectionDate, String receivedDate, List<Analysis> analyses) {

    private static final ObjectMapper JSON = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS);

    public record Analysis(String id, String testId, String version) {
        public Analysis {
            requireId(id);
            requireId(testId);
            time(version);
        }
    }

    public SpecimenIntakeEvidence {
        if (schema != 1) {
            throw invalid();
        }
        time(sampleVersion);
        time(requestVersion);
        time(itemVersion);
        requireId(typeOfSampleId);
        if (time(receivedDate).isBefore(time(collectionDate)) || analyses == null || analyses.isEmpty()
                || analyses.size() > 5000) {
            throw invalid();
        }
        var ids = new HashSet<String>();
        for (var analysis : analyses) {
            if (analysis == null || !ids.add(analysis.id())) {
                throw invalid();
            }
        }
        analyses = analyses.stream().sorted(Comparator.comparingInt(a -> Integer.parseInt(a.id()))).toList();
    }

    public String encode() {
        try {
            return JSON.writeValueAsString(this);
        } catch (java.io.IOException e) {
            throw invalid();
        }
    }

    public static SpecimenIntakeEvidence decode(String json) {
        if (json == null || json.length() > 1024 * 1024) {
            throw invalid();
        }
        try {
            // Exact JSON round-trip also rejects numeric-to-string coercion and missing
            // fields.
            var tree = JSON.readTree(json);
            var value = JSON.treeToValue(tree, SpecimenIntakeEvidence.class);
            if (value == null || !tree.equals(JSON.readTree(value.encode()))) {
                throw invalid();
            }
            return value;
        } catch (java.io.IOException | RuntimeException e) {
            throw invalid();
        }
    }

    public static String digest(String json) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String requireId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,9}")) {
            throw invalid();
        }
        try {
            if (Integer.parseInt(value) <= 0) {
                throw invalid();
            }
        } catch (NumberFormatException e) {
            throw invalid();
        }
        return value;
    }

    public static Instant time(String value) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z")) {
            throw invalid();
        }
        try {
            var instant = LocalDateTime.parse(value.substring(0, value.length() - 1)).toInstant(ZoneOffset.UTC);
            if (!instant.isAfter(Instant.EPOCH)) {
                throw invalid();
            }
            return instant;
        } catch (java.time.DateTimeException e) {
            throw invalid();
        }
    }

    /**
     * Preserve a JDBC value read from PostgreSQL {@code TIMESTAMP WITHOUT TIME
     * ZONE}. The driver has already interpreted that wall clock using the
     * connection time zone; converting it to {@link LocalDateTime} and then
     * assigning UTC would add the local offset a second time.
     */
    public static String wallClockTime(Timestamp value) {
        if (value == null) {
            throw invalid();
        }
        return value.toInstant().toString();
    }

    /** Build a JDBC value for a {@code TIMESTAMP WITHOUT TIME ZONE} column. */
    public static Timestamp wallClockTimestamp(String value) {
        return Timestamp.from(time(value));
    }

    /**
     * Preserve a JDBC value read from {@code TIMESTAMP WITH TIME ZONE} as an
     * instant.
     */
    public static String instantTime(Timestamp value) {
        if (value == null) {
            throw invalid();
        }
        return value.toInstant().toString();
    }

    public static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid specimen intake evidence");
    }
}
