package org.openelisglobal.sample.form;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.sample.exception.EntrySubmissionException;

/**
 * A receipt is an explicit physical tube operation, never an order form update.
 */
public record SpecimenReceiptCommand(String sampleId, String labNo, String patientId, List<Tube> tubes) {
    public record Tube(String requestId, String sampleItemId, Instant collectionDate, Instant receivedDate) {
    }

    public static SpecimenReceiptCommand fromJson(JsonNode body) {
        fields(body, Set.of("sampleId", "labNo", "patientId", "tubes"));
        String sample = id(body.get("sampleId")), patient = id(body.get("patientId"));
        JsonNode lab = body.get("labNo"), rows = body.get("tubes");
        if (lab == null || !lab.isTextual() || !lab.textValue().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}")
                || rows == null || !rows.isArray() || rows.isEmpty() || rows.size() > 100) {
            throw invalid();
        }
        Set<String> requests = new HashSet<>(), items = new HashSet<>();
        List<Tube> tubes = new ArrayList<>();
        for (JsonNode row : rows) {
            fields(row, Set.of("requestId", "sampleItemId", "collectionDate", "receivedDate"));
            String request = id(row.get("requestId")), item = id(row.get("sampleItemId"));
            if (!requests.add(request) || !items.add(item)) {
                throw invalid();
            }
            Instant collected = time(row.get("collectionDate")), received = time(row.get("receivedDate"));
            if (received.isBefore(collected)) {
                throw invalid();
            }
            tubes.add(new Tube(request, item, collected, received));
        }
        return new SpecimenReceiptCommand(sample, lab.textValue(), patient, List.copyOf(tubes));
    }

    private static void fields(JsonNode node, Set<String> names) {
        if (node == null || !node.isObject() || node.size() != names.size()) {
            throw invalid();
        }
        node.fieldNames().forEachRemaining(name -> {
            if (!names.contains(name)) {
                throw invalid();
            }
        });
    }

    private static String id(JsonNode node) {
        if (node == null || !node.isTextual() || !node.textValue().matches("[1-9][0-9]{0,9}")) {
            throw invalid();
        }
        try {
            if (Integer.parseInt(node.textValue()) <= 0) {
                throw invalid();
            }
        } catch (NumberFormatException badId) {
            throw invalid();
        }
        return node.textValue();
    }

    private static Instant time(JsonNode node) {
        if (node == null || !node.isTextual() || !node.textValue()
                .matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z")) {
            throw invalid();
        }
        try {
            // Strict calendar parsing rejects normalized leap seconds and 24:00.
            var local = java.time.LocalDateTime.parse(node.textValue().substring(0, node.textValue().length() - 1));
            Instant value = local.toInstant(java.time.ZoneOffset.UTC);
            if (!value.isAfter(Instant.EPOCH)) {
                throw invalid();
            }
            return value;
        } catch (java.time.DateTimeException badTime) {
            throw invalid();
        }
    }

    public static EntrySubmissionException invalid() {
        return new EntrySubmissionException(400, "SPECIMEN_RECEIPT_INVALID", "请明确选择已采集标本，并填写有效的签收时间。");
    }
}
