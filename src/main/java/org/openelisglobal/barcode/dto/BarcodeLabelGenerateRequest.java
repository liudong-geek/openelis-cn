package org.openelisglobal.barcode.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;

/** Strict binding prevents Jackson scalar coercion and unsupported override options. */
public record BarcodeLabelGenerateRequest(String orderId, String labNumber, List<RequestedLabel> labels) {
    public record RequestedLabel(String type, String sampleItemId, int quantity) {
    }

    public static BarcodeLabelGenerateRequest fromJson(JsonNode body) {
        fields(body, Set.of("orderId", "labNumber", "labels"));
        String orderId = id(body.get("orderId"));
        JsonNode lab = body.get("labNumber");
        if (lab == null || !lab.isTextual()) {
            throw invalid("BARCODE_REQUEST_INVALID");
        }
        JsonNode items = body.get("labels");
        if (items == null || !items.isArray() || items.isEmpty() || items.size() > 100) {
            throw invalid("BARCODE_REQUEST_INVALID");
        }
        List<RequestedLabel> labels = new ArrayList<>();
        for (JsonNode item : items) {
            fields(item, Set.of("type", "sampleItemId", "quantity"));
            JsonNode type = item.get("type");
            JsonNode quantity = item.get("quantity");
            if (type == null || !type.isTextual() || quantity == null || !quantity.isIntegralNumber()
                    || !quantity.canConvertToInt()) {
                throw invalid("BARCODE_REQUEST_INVALID");
            }
            JsonNode specimen = item.get("sampleItemId");
            String specimenId = specimen == null || specimen.isNull() ? null : id(specimen);
            labels.add(new RequestedLabel(type.textValue(), specimenId, quantity.intValue()));
        }
        BarcodeLabelGenerateRequest request = new BarcodeLabelGenerateRequest(orderId, lab.textValue(), labels);
        request.validate(100);
        return request;
    }

    public void validate(int maximumQuantity) {
        if (!positiveId(orderId) || labNumber == null || !labNumber.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}")
                || labels == null || labels.isEmpty() || labels.size() > 100) {
            throw invalid("BARCODE_REQUEST_INVALID");
        }
        Set<String> unique = new HashSet<>();
        long total = 0;
        for (RequestedLabel item : labels) {
            if (item == null || !("order".equals(item.type()) && item.sampleItemId() == null
                    || "specimen".equals(item.type()) && positiveId(item.sampleItemId()))
                    || !unique.add(item.type() + ":" + item.sampleItemId())) {
                throw invalid("BARCODE_REQUEST_INVALID");
            }
            total += item.quantity();
            if (item.quantity() < 1 || item.quantity() > maximumQuantity || total > maximumQuantity) {
                throw invalid("BARCODE_QUANTITY_INVALID");
            }
        }
    }

    public static boolean positiveId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,9}")) {
            return false;
        }
        try {
            return Integer.parseInt(value) > 0;
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    private static String id(JsonNode node) {
        String value = node != null && node.isTextual() ? node.textValue()
                : node != null && node.isIntegralNumber() ? node.asText() : null;
        if (!positiveId(value)) {
            throw invalid("BARCODE_REQUEST_INVALID");
        }
        return value;
    }

    private static void fields(JsonNode node, Set<String> allowed) {
        if (node == null || !node.isObject()) {
            throw invalid("BARCODE_REQUEST_INVALID");
        }
        node.fieldNames().forEachRemaining(name -> {
            if (!allowed.contains(name)) {
                throw invalid("BARCODE_REQUEST_INVALID");
            }
        });
    }

    private static BarcodeLabelGenerationException invalid(String code) {
        return new BarcodeLabelGenerationException(400, code);
    }
}
