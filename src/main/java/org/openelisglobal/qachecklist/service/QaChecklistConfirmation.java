package org.openelisglobal.qachecklist.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.openelisglobal.qachecklist.form.QaChecklistConfirmationCommand;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;

/**
 * Existing mutable checklist confirmation. Not an immutable clinical acceptance
 * event.
 */
public final class QaChecklistConfirmation {
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private QaChecklistConfirmation() {
    }

    public static String encode(QaChecklistConfirmationCommand command, QaChecklistFacts.Basis facts,
            SampleQaChecklist row) {
        var context = JSON.createObjectNode();
        context.put("schema", 1).put("scope", QaChecklistFacts.SCOPE);
        ObjectNode request = JSON.valueToTree(command);
        request.put("sampleId", command.sampleId().toString());
        context.set("request", request);
        context.set("facts", facts.content());
        context.put("reviewerId", row.getVerifiedByUserId());
        context.put("reviewedAt", QaChecklistFacts.time(row.getVerifiedDate()));
        return context.toString();
    }

    public static JsonNode validated(SampleQaChecklist row) {
        if (row == null || row.getConfirmationId() == null || row.getConfirmedContextJson() == null
                || row.getConfirmedContextJson().length() > 2 * 1024 * 1024
                || !Boolean.TRUE.equals(row.getAllRequiredVerified()) || row.getVerifiedByUserId() == null
                || row.getVerifiedByUserId() <= 0 || row.getVerifiedDate() == null) {
            return null;
        }
        try {
            var context = JSON.readTree(row.getConfirmedContextJson());
            if (!context.isObject() || context.size() != 6 || !context.path("schema").isIntegralNumber()
                    || !context.path("schema").canConvertToInt() || context.path("schema").intValue() != 1
                    || !QaChecklistFacts.SCOPE.equals(context.path("scope").textValue())) {
                return null;
            }
            var command = QaChecklistConfirmationCommand.parse(context.get("request"));
            if (!row.getConfirmationId().equals(command.confirmationId())
                    || !row.getSampleId().equals(command.sampleId()) || !context.path("reviewerId").isIntegralNumber()
                    || !context.path("reviewerId").canConvertToInt()
                    || !row.getVerifiedByUserId().equals(context.path("reviewerId").intValue())
                    || !QaChecklistFacts.time(row.getVerifiedDate()).equals(context.path("reviewedAt").textValue())
                    || !command.verifiedItems().equals(row.getVerifiedItems())
                    || !JSON.valueToTree(command.verifiedItems()).equals(JSON.readTree(row.getVerifiedItemsJson()))
                    || !context.path("facts").isObject() || !command.expectedFactsDigest()
                            .equals(QaChecklistFacts.digest(context.path("facts").toString()))) {
                return null;
            }
            return context;
        } catch (RuntimeException | java.io.IOException e) {
            return null;
        }
    }

    public static String state(SampleQaChecklist row, QaChecklistFacts.Basis facts) {
        if (row == null || row.getConfirmationId() == null && row.getConfirmedContextJson() == null) {
            return "NOT_CONFIRMED";
        }
        var context = validated(row);
        if (context == null) {
            return "INVALID_CONFIRMATION";
        }
        return facts != null && context.path("facts").equals(facts.content()) && QaChecklistConfirmationCommand
                .parse(context.get("request")).specimenIds().equals(facts.specimenIds()) ? "MATCHED_CONFIRMATION"
                        : "STALE_CONFIRMATION";
    }

    public static boolean sameRequest(SampleQaChecklist row, QaChecklistConfirmationCommand command,
            QaChecklistFacts.Basis facts, Integer userId) {
        var context = validated(row);
        return context != null && row.getVerifiedByUserId().equals(userId)
                && QaChecklistConfirmationCommand.parse(context.get("request")).equals(command)
                && "MATCHED_CONFIRMATION".equals(state(row, facts));
    }
}
