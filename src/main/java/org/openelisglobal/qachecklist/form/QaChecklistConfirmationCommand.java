package org.openelisglobal.qachecklist.form;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;

/** Explicit acknowledgement of the entire displayed current tube set. */
public record QaChecklistConfirmationCommand(Integer sampleId, String confirmationId, String expectedFactsDigest,
        String expectedChecklistVersion, List<String> specimenIds, Map<String, Boolean> verifiedItems) {
    public QaChecklistConfirmationCommand {
        specimenIds = List.copyOf(specimenIds);
        verifiedItems = Map.copyOf(verifiedItems);
    }

    public static QaChecklistConfirmationCommand parse(JsonNode body) {
        Set<String> fields = Set.of("sampleId", "confirmationId", "expectedFactsDigest", "expectedChecklistVersion",
                "specimenIds", "verifiedItems");
        if (body == null || !body.isObject() || body.size() != fields.size()) {
            throw invalid();
        }
        body.fieldNames().forEachRemaining(key -> {
            if (!fields.contains(key)) {
                throw invalid();
            }
        });
        String sample = id(body.get("sampleId"));
        String confirmation = text(body.get("confirmationId"));
        try {
            if (!UUID.fromString(confirmation).toString().equals(confirmation)) {
                throw invalid();
            }
        } catch (IllegalArgumentException e) {
            throw invalid();
        }
        String digest = text(body.get("expectedFactsDigest"));
        if (!digest.matches("[a-f0-9]{64}")) {
            throw invalid();
        }
        var versionNode = body.get("expectedChecklistVersion");
        if (versionNode == null) {
            throw invalid();
        }
        String version = versionNode.isNull() ? null : text(versionNode);
        if (version != null) {
            try {
                if (!version.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z")
                        || !Instant.parse(version).toString().equals(version)) {
                    throw invalid();
                }
            } catch (java.time.DateTimeException e) {
                throw invalid();
            }
        }
        var ids = body.get("specimenIds");
        if (ids == null || !ids.isArray() || ids.isEmpty() || ids.size() > 100) {
            throw invalid();
        }
        List<String> specimens = new ArrayList<>();
        for (var node : ids) {
            String itemId = id(node);
            if (specimens.contains(itemId)) {
                throw invalid();
            }
            specimens.add(itemId);
        }
        var items = body.get("verifiedItems");
        if (items == null || !items.isObject() || items.isEmpty() || items.size() > 100) {
            throw invalid();
        }
        Map<String, Boolean> checks = new LinkedHashMap<>();
        items.fields().forEachRemaining(entry -> {
            if (entry.getKey().isBlank() || entry.getKey().length() > 255 || !entry.getValue().isBoolean()
                    || !entry.getValue().booleanValue()) {
                throw invalid();
            }
            checks.put(entry.getKey(), true);
        });
        return new QaChecklistConfirmationCommand(Integer.valueOf(sample), confirmation, digest, version,
                specimens.stream().sorted().toList(), checks);
    }

    private static String id(JsonNode node) {
        String value = text(node);
        try {
            if (!value.matches("[1-9][0-9]{0,9}") || Integer.parseInt(value) <= 0) {
                throw invalid();
            }
        } catch (NumberFormatException e) {
            throw invalid();
        }
        return value;
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isTextual()) {
            throw invalid();
        }
        return node.textValue();
    }

    public static QaChecklistValidationException invalid() {
        return new QaChecklistValidationException(400, "QA_CONFIRMATION_INVALID", "qa.checklist.confirmationInvalid");
    }
}
