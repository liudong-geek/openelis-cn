package org.openelisglobal.sample.form;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.openelisglobal.sample.exception.EntrySubmissionException;

/**
 * A new collection request for one explicitly rejected tube; no result or
 * old-tube mutations.
 */
public record SpecimenRecollectionCommand(String operationId, String sampleId, String labNo, String patientId,
        String sourceRequestId, String sourceSampleItemId, String sourceDecisionOperationId,
        String expectedEvidenceDigest) {

    private static final Set<String> FIELDS = Set.of("version", "operationId", "sampleId", "labNo", "patientId",
            "sourceRequestId", "sourceSampleItemId", "sourceDecisionOperationId", "expectedEvidenceDigest");

    public static SpecimenRecollectionCommand parse(JsonNode body) {
        if (body == null || !body.isObject() || body.size() != FIELDS.size() || !body.path("version").isIntegralNumber()
                || !body.path("version").canConvertToInt() || body.path("version").intValue() != 1) {
            throw invalid();
        }
        Set<String> names = new HashSet<>();
        body.fieldNames().forEachRemaining(names::add);
        if (!names.equals(FIELDS)) {
            throw invalid();
        }
        for (String field : FIELDS) {
            if (!field.equals("version") && !body.path(field).isTextual()) {
                throw invalid();
            }
        }
        var command = new SpecimenRecollectionCommand(body.path("operationId").textValue(),
                body.path("sampleId").textValue(), body.path("labNo").textValue(), body.path("patientId").textValue(),
                body.path("sourceRequestId").textValue(), body.path("sourceSampleItemId").textValue(),
                body.path("sourceDecisionOperationId").textValue(), body.path("expectedEvidenceDigest").textValue());
        try {
            for (String id : new String[] { command.sampleId, command.patientId, command.sourceRequestId,
                    command.sourceSampleItemId }) {
                SpecimenIntakeEvidence.requireId(id);
            }
            if (!command.sourceDecisionOperationId.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                    || !UUID.fromString(command.sourceDecisionOperationId).toString()
                            .equals(command.sourceDecisionOperationId)
                    || !command.operationId.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                    || !UUID.fromString(command.operationId).toString().equals(command.operationId)
                    || !command.labNo.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}")
                    || !command.expectedEvidenceDigest.matches("[a-f0-9]{64}")) {
                throw invalid();
            }
            return command;
        } catch (IllegalArgumentException malformed) {
            throw invalid();
        }
    }

    private static EntrySubmissionException invalid() {
        return new EntrySubmissionException(400, "RECOLLECTION_INVALID", "order.recollection.invalid");
    }
}
