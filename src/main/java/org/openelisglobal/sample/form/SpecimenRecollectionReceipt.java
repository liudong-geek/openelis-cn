package org.openelisglobal.sample.form;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.sample.service.EntryCurrentStateReader.RequestView;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * Stable first-create receipt, independent of the replacement request's later
 * lifecycle.
 */
public final class SpecimenRecollectionReceipt {
    private static final ObjectMapper JSON = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    private static final Set<String> FIELDS = Set.of("success", "version", "replayed", "operationId", "sampleId",
            "labNo", "patientId", "sourceRequestId", "sourceSampleItemId", "sourceDecisionOperationId",
            "evidenceDigest", "createdBy", "createdAt", "request");
    private static final Set<String> REQUEST_FIELDS = Set.of("id", "sortOrder", "typeOfSampleId", "requestedQuantity",
            "unitOfMeasureId", "testIds", "panelIds", "status", "sampleItemId", "createdAt", "lastUpdated");

    private SpecimenRecollectionReceipt() {
    }

    public static ObjectNode create(SpecimenRecollectionCommand command, SampleTypeRequest request, String actor,
            Instant now) {
        var result = JSON.createObjectNode().put("success", true).put("version", 1).put("replayed", false)
                .put("operationId", command.operationId()).put("sampleId", command.sampleId())
                .put("labNo", command.labNo()).put("patientId", command.patientId())
                .put("sourceRequestId", command.sourceRequestId())
                .put("sourceSampleItemId", command.sourceSampleItemId())
                .put("sourceDecisionOperationId", command.sourceDecisionOperationId())
                .put("evidenceDigest", command.expectedEvidenceDigest()).put("createdBy", actor)
                .put("createdAt", now.toString());
        var view = new RequestView(request.getId().toString(), request.getSortOrder(),
                request.getTypeOfSample().getId(), request.getRequestedQuantity(),
                request.getUnitOfMeasure() == null ? null : request.getUnitOfMeasure().getId(),
                ids(request.getRequestedTests(), false), ids(request.getRequestedPanels(), true), "REQUESTED", null,
                time(request.getCreatedDate()), time(request.getLastupdated()));
        result.set("request", JSON.valueToTree(view));
        return result;
    }

    public static ObjectNode read(SpecimenRecollection row) {
        try {
            row.validateRecord();
            var value = JSON.readTree(row.getReceiptJson());
            if (value == null || !value.isObject() || value.size() != FIELDS.size())
                throw invalid();
            var names = new HashSet<String>();
            value.fieldNames().forEachRemaining(names::add);
            if (!FIELDS.equals(names) || !value.path("success").isBoolean() || !value.path("success").booleanValue()
                    || !value.path("replayed").isBoolean() || value.path("replayed").booleanValue()
                    || !value.path("version").isIntegralNumber() || !value.path("version").canConvertToInt()
                    || value.path("version").intValue() != 1)
                throw invalid();
            equal(value, "operationId", row.getOperationId());
            equal(value, "sampleId", row.getSampleId());
            equal(value, "labNo", row.getLabNo());
            equal(value, "patientId", row.getPatientId());
            equal(value, "sourceRequestId", row.getSourceRequestId());
            equal(value, "sourceSampleItemId", row.getSourceSampleItemId());
            equal(value, "evidenceDigest", row.getEvidenceDigest());
            equal(value, "createdBy", row.getCreatedBy());
            equal(value, "createdAt", row.getCreatedAt().toString());
            String sourceOperation = text(value.path("sourceDecisionOperationId"));
            if (!sourceOperation.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))
                throw invalid();
            var request = value.path("request");
            if (!request.isObject() || request.size() != REQUEST_FIELDS.size())
                throw invalid();
            names.clear();
            request.fieldNames().forEachRemaining(names::add);
            if (!names.equals(REQUEST_FIELDS))
                throw invalid();
            equal(request, "id", row.getRequestId());
            equal(request, "status", "REQUESTED");
            if (!request.path("sampleItemId").isNull() || !request.path("sortOrder").isIntegralNumber()
                    || !request.path("sortOrder").canConvertToInt() || request.path("sortOrder").intValue() < 1
                    || !request.path("requestedQuantity").isNumber()
                    || !Double.isFinite(request.path("requestedQuantity").doubleValue())
                    || request.path("requestedQuantity").doubleValue() <= 0)
                throw invalid();
            SpecimenIntakeEvidence.requireId(text(request.path("typeOfSampleId")));
            if (!request.path("unitOfMeasureId").isNull())
                SpecimenIntakeEvidence.requireId(text(request.path("unitOfMeasureId")));
            arrayIds(request.path("testIds"), false);
            arrayIds(request.path("panelIds"), true);
            if (SpecimenIntakeEvidence.time(text(request.path("createdAt"))).isAfter(row.getCreatedAt())
                    || SpecimenIntakeEvidence.time(text(request.path("lastUpdated"))).isAfter(row.getCreatedAt()))
                throw invalid();
            return (ObjectNode) value;
        } catch (Exception invalid) {
            throw invalid();
        }
    }

    public static List<String> ids(String csv, boolean empty) {
        if (csv == null || csv.isBlank()) {
            if (empty)
                return List.of();
            throw invalid();
        }
        var values = Arrays.stream(csv.split(",", -1)).map(String::trim).map(SpecimenIntakeEvidence::requireId)
                .toList();
        if (values.size() > 5000 || new HashSet<>(values).size() != values.size())
            throw invalid();
        return values.stream().sorted(java.util.Comparator.comparingLong(Long::parseLong)).toList();
    }

    private static void arrayIds(JsonNode value, boolean empty) {
        if (!value.isArray() || value.size() > 5000 || (!empty && value.isEmpty()))
            throw invalid();
        var ids = new HashSet<String>();
        for (var item : value)
            if (!ids.add(SpecimenIntakeEvidence.requireId(text(item))))
                throw invalid();
    }

    private static void equal(JsonNode value, String field, String expected) {
        if (!expected.equals(text(value.path(field))))
            throw invalid();
    }

    private static String text(JsonNode value) {
        if (!value.isTextual())
            throw invalid();
        return value.textValue();
    }

    private static String time(Timestamp value) {
        if (value == null)
            throw invalid();
        return value.toInstant().toString();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid replacement receipt");
    }
}
