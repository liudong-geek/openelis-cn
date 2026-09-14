package org.openelisglobal.sample.form;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Reason;

/** One explicit operation belongs to one real tube; never a bulk order save. */
public record SpecimenIntakeDecisionCommand(String operationId, String sampleId, String labNo, String patientId,
        String requestId, String sampleItemId, Decision decision, Reason reason, String expectedEvidenceDigest) {
    public static SpecimenIntakeDecisionCommand parse(JsonNode body) {
        try {
            fields(body, Set.of("version", "operationId", "sampleId", "labNo", "patientId", "requestId", "sampleItemId",
                    "decision", "reason", "expectedEvidenceDigest"));
            if (!body.path("version").isIntegralNumber() || !body.path("version").canConvertToInt()
                    || body.path("version").intValue() != 1) {
                throw invalid();
            }
            String operation = text(body.get("operationId")), lab = text(body.get("labNo"));
            String digest = text(body.get("expectedEvidenceDigest"));
            if (!operation.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                    || !lab.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}") || !digest.matches("[a-f0-9]{64}")) {
                throw invalid();
            }
            Decision decision = Decision.valueOf(text(body.get("decision")));
            Reason reason = null;
            if (decision == Decision.REJECTED) {
                var value = body.get("reason");
                fields(value, Set.of("namespace", "id", "version", "label"));
                reason = new Reason(text(value.get("namespace")), text(value.get("id")), text(value.get("version")),
                        text(value.get("label")));
                // The existing QA_EVENT list has no reliable intake-reason eligibility
                // contract.
                if (!"DICTIONARY:resultRejectionReasons".equals(reason.namespace())) {
                    throw invalid();
                }
            } else if (!body.path("reason").isNull()) {
                throw invalid();
            }
            return new SpecimenIntakeDecisionCommand(operation, id(body.get("sampleId")), lab,
                    id(body.get("patientId")), id(body.get("requestId")), id(body.get("sampleItemId")), decision,
                    reason, digest);
        } catch (IllegalArgumentException e) {
            throw invalid();
        }
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

    private static String id(JsonNode value) {
        return SpecimenIntakeEvidence.requireId(text(value));
    }

    private static String text(JsonNode value) {
        if (value == null || !value.isTextual()) {
            throw invalid();
        }
        return value.textValue();
    }

    public static EntrySubmissionException invalid() {
        return new EntrySubmissionException(400, "SPECIMEN_DECISION_INVALID", "请核对所选标本、验收结论及拒收原因后重新确认。");
    }
}
