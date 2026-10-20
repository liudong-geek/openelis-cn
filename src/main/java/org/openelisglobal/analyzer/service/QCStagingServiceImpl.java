package org.openelisglobal.analyzer.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.TreeMap;
import org.openelisglobal.analyzerresults.dao.AnalyzerResultsDAO;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QCStagingServiceImpl implements QCStagingService {
    private static final Set<String> STATUSES = Set.of("PENDING", "NOT_PROCESSED", "UNKNOWN", "CREATED",
            "LEGACY_REVIEW", "OPEN", "ALL");
    private static final ObjectMapper JSON = new ObjectMapper();
    private final AnalyzerResultsDAO dao;
    private final QCResultProcessingService processor;
    private final AuditTrailService audit;

    public QCStagingServiceImpl(AnalyzerResultsDAO dao, QCResultProcessingService processor, AuditTrailService audit) {
        this.dao = dao;
        this.processor = processor;
        this.audit = audit;
    }

    @Override
    @Transactional
    public String stage(AnalyzerResults original, String userId) {
        if (!original.getIsControl() || blank(original.getQcRawObservation())) {
            throw new IllegalArgumentException("A QC original is required");
        }
        requireUser(userId);
        QCSource source = source(original);
        if (!blank(original.getAnalyzerId())) {
            dao.lockQCAnalyzer(original.getAnalyzerId());
        }
        AnalyzerResults existing = dao.findQCBySourceKey(original.getAnalyzerId(), source.key());
        if (existing != null) {
            // A duplicate receipt does not mutate the submitted or already processed
            // original.
            original.setId(null);
            return null;
        }
        boolean correction = source.correction()
                || source.identity() != null && dao.hasQCSourceIdentity(source.identity());
        original.setQcSourceKey(source.key());
        original.setQcSourceIdentity(source.identity());
        original.setQcProcessingStatus(correction ? "NOT_PROCESSED" : "PENDING");
        original.setQcProcessingReason(correction ? "QC_CORRECTION_REQUIRES_REVIEW" : null);
        if (correction) {
            original.setReadOnly(true);
        }
        original.setQcResultId(null);
        original.setQcProcessedAt(null);
        original.setQcProcessedBy(null);
        original.setSysUserId(userId);
        original.setLastupdatedFields();
        String id = dao.insert(original);
        original.setId(id);
        Map<String, String> changes = auditState(original, "current");
        changes.put("qcOperation", "STAGED");
        changes.put("qcSourceKey", original.getQcSourceKey());
        audit.saveNamedChanges(id, "ANALYZER_RESULTS", userId, changes);
        return id;
    }

    @Override
    @Transactional
    public QCProcessingResult process(String id, String userId) {
        requireUser(userId);
        AnalyzerResults row = requireControl(dao.lockQCStaging(id));
        if (!blank(row.getQcResultId())) {
            return QCProcessingResult.created(row.getQcResultId());
        }
        if (legacy(row)) {
            return QCProcessingResult.notProcessed("QC_LEGACY_REVIEW_REQUIRED");
        }
        if ("CREATED".equals(row.getQcProcessingStatus())) {
            throw new IllegalStateException("QC outcome requires verification");
        }
        String reason = eligibilityReason(row);
        QCProcessingResult outcome;
        if (reason != null) {
            outcome = QCProcessingResult.notProcessed(reason);
        } else {
            BigDecimal value;
            try {
                value = new BigDecimal(row.getResult());
            } catch (NumberFormatException | NullPointerException invalid) {
                return saveOutcome(row, QCProcessingResult.notProcessed("QC_NON_NUMERIC_RESULT"), userId);
            }
            // Exceptions leave this transaction. The caller may then mark UNKNOWN in a
            // separate transaction, which first checks for a committed result link.
            outcome = processor.processQCResult(row.getAnalyzerId(), row.getTestId(), row.getAccessionNumber(),
                    row.getLotNumber(), row.getControlLevel(), value, row.getUnits(),
                    row.getCompleteDate() == null ? null
                            : row.getCompleteDate().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime());
        }
        return saveOutcome(row, outcome, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public QCProcessingResult readOutcome(String id) {
        return outcome(requireControl(dao.get(id).orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public QCProcessingResult markUnknown(String id, String userId) {
        requireUser(userId);
        AnalyzerResults row = requireControl(dao.lockQCStaging(id));
        if (!blank(row.getQcResultId())) {
            return QCProcessingResult.created(row.getQcResultId());
        }
        if (legacy(row)) {
            return QCProcessingResult.notProcessed("QC_LEGACY_REVIEW_REQUIRED");
        }
        return saveOutcome(row, QCProcessingResult.unknown(), userId);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> list(String status, int limit, int offset) {
        String selected = blank(status) ? "OPEN" : status.trim();
        if (!STATUSES.contains(selected) || offset < 0) {
            throw new IllegalArgumentException("Invalid QC query");
        }
        int size = Math.max(1, Math.min(100, limit));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", dao.findQCStaging(selected, size, offset).stream().map(row -> toMap(row, false)).toList());
        result.put("total", dao.countQCStaging(selected));
        result.put("limit", size);
        result.put("offset", offset);
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> get(String id) {
        return toMap(requireControl(dao.get(id).orElse(null)), true);
    }

    private QCProcessingResult saveOutcome(AnalyzerResults row, QCProcessingResult outcome, String userId) {
        if (outcome == null || outcome.status() == QCProcessingResult.Status.DUPLICATE_SKIPPED) {
            throw new IllegalStateException("Invalid QC processing receipt");
        }
        Map<String, String> changes = auditState(row, "previous");
        row.setQcProcessingStatus(outcome.status().name());
        row.setQcProcessingReason(outcome.reasonCode());
        row.setQcResultId(outcome.qcResultId());
        row.setQcProcessedAt(Timestamp.from(Instant.now()));
        row.setQcProcessedBy(userId);
        row.setSysUserId(userId);
        row.setLastupdatedFields();
        dao.update(row);
        changes.putAll(auditState(row, "current"));
        changes.put("qcOperation", "PROCESSING_OUTCOME");
        audit.saveNamedChanges(row.getId(), "ANALYZER_RESULTS", userId, changes);
        return outcome;
    }

    private Map<String, String> auditState(AnalyzerResults row, String prefix) {
        // Explicit metadata avoids copying the instrument payload or measured value
        // into logs.
        Map<String, String> state = new LinkedHashMap<>();
        state.put(prefix + "Status", row.getQcProcessingStatus());
        state.put(prefix + "Reason", row.getQcProcessingReason());
        state.put(prefix + "ResultId", row.getQcResultId());
        state.put(prefix + "ProcessedAt", instant(row.getQcProcessedAt()));
        state.put(prefix + "ProcessedBy", row.getQcProcessedBy());
        return state;
    }

    private QCProcessingResult outcome(AnalyzerResults row) {
        if (!blank(row.getQcResultId())) {
            return QCProcessingResult.created(row.getQcResultId());
        }
        if (legacy(row)) {
            return QCProcessingResult.notProcessed("QC_LEGACY_REVIEW_REQUIRED");
        }
        if ("UNKNOWN".equals(row.getQcProcessingStatus()) || "CREATED".equals(row.getQcProcessingStatus())) {
            return QCProcessingResult.unknown();
        }
        return QCProcessingResult.notProcessed(
                blank(row.getQcProcessingReason()) ? "QC_PROCESSING_PENDING" : row.getQcProcessingReason());
    }

    private Map<String, Object> toMap(AnalyzerResults row, boolean details) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.getId());
        result.put("isControl", row.getIsControl());
        result.put("analyzerId", row.getAnalyzerId());
        result.put("accessionNumber", row.getAccessionNumber());
        result.put("testId", row.getTestId());
        result.put("testName", row.getTestName());
        result.put("result", row.getResult());
        result.put("units", row.getUnits());
        result.put("lotNumber", row.getLotNumber());
        result.put("controlLevel", row.getControlLevel());
        result.put("qcProcessingStatus", legacy(row) ? "LEGACY_REVIEW" : row.getQcProcessingStatus());
        result.put("qcProcessingReason", row.getQcProcessingReason());
        result.put("qcResultId", row.getQcResultId());
        result.put("qcProcessedAt", instant(row.getQcProcessedAt()));
        result.put("qcProcessedBy", row.getQcProcessedBy());
        result.put("completeDate", instant(row.getCompleteDate()));
        result.put("lastupdated", instant(row.getLastupdated()));
        result.put("canRetry",
                !legacy(row) && blank(row.getQcResultId())
                        && (List.of("PENDING", "NOT_PROCESSED").contains(row.getQcProcessingStatus())
                                || details && "UNKNOWN".equals(row.getQcProcessingStatus())));
        if (details) {
            result.put("qcRawObservation", row.getQcRawObservation());
            result.put("qcSourceKey", row.getQcSourceKey());
            result.put("importIssueReason", row.getImportIssueReason());
        }
        return result;
    }

    private String eligibilityReason(AnalyzerResults row) {
        if (blank(row.getAnalyzerId())) {
            return "QC_ANALYZER_NOT_RESOLVED";
        }
        if (blank(row.getTestId()) || "-1".equals(row.getTestId())) {
            return "QC_TEST_NOT_MAPPED";
        }
        if (row.getDuplicateAnalyzerResultId() != null
                || "QC_CORRECTION_REQUIRES_REVIEW".equals(row.getQcProcessingReason())) {
            return "QC_CORRECTION_REQUIRES_REVIEW";
        }
        if (row.isReadOnly() || row.getImportIssueReason() != null) {
            return "QC_CONFIGURATION_REQUIRED";
        }
        return null;
    }

    private QCSource source(AnalyzerResults original) {
        try {
            JsonNode observation = JSON.readTree(original.getQcRawObservation());
            if (observation == null || !observation.isObject()
                    || !"Observation".equals(observation.path("resourceType").asText())) {
                throw new IllegalArgumentException("QC source must be an Observation");
            }
            ObjectNode identity = JSON.createObjectNode();
            identity.put("analyzerId", original.getAnalyzerId());
            identity.put("accessionNumber", original.getAccessionNumber());
            identity.set("observation", canonical(observation));
            String key = digest(identity);
            String eventIdentity = null;
            if (!blank(original.getAnalyzerId()) && !blank(observation.path("id").asText(null))
                    && !blank(observation.path("effectiveDateTime").asText(null))) {
                ObjectNode event = JSON.createObjectNode();
                event.put("analyzerId", original.getAnalyzerId());
                event.set("id", observation.get("id"));
                event.set("effectiveDateTime", observation.get("effectiveDateTime"));
                eventIdentity = digest(event);
            }
            String status = observation.path("status").asText();
            return new QCSource(key, eventIdentity,
                    "corrected".equalsIgnoreCase(status) || "amended".equalsIgnoreCase(status));
        } catch (java.io.IOException | NoSuchAlgorithmException e) {
            throw new IllegalArgumentException("Invalid QC source", e);
        }
    }

    private record QCSource(String key, String identity, boolean correction) {
    }

    private String digest(JsonNode node) throws java.io.IOException, NoSuchAlgorithmException {
        byte[] bytes = JSON.writeValueAsString(canonical(node)).getBytes(StandardCharsets.UTF_8);
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private JsonNode canonical(JsonNode node) {
        if (node.isObject()) {
            Map<String, JsonNode> fields = new TreeMap<>();
            node.fields().forEachRemaining(field -> fields.put(field.getKey(), canonical(field.getValue())));
            ObjectNode object = JSON.createObjectNode();
            fields.forEach(object::set);
            return object;
        }
        if (node.isArray()) {
            ArrayNode array = JSON.createArrayNode();
            node.forEach(value -> array.add(canonical(value)));
            return array;
        }
        return node;
    }

    private AnalyzerResults requireControl(AnalyzerResults row) {
        if (row == null) {
            throw new NoSuchElementException("QC original not found");
        }
        if (!row.getIsControl()) {
            throw new IllegalArgumentException("Not a QC original");
        }
        return row;
    }

    private boolean legacy(AnalyzerResults row) {
        return "LEGACY_REVIEW".equals(row.getQcProcessingStatus()) || blank(row.getQcSourceKey())
                || blank(row.getQcRawObservation());
    }

    private static String instant(Timestamp time) {
        return time == null ? null : time.toInstant().toString();
    }

    private static boolean blank(String text) {
        return text == null || text.isBlank();
    }

    private static void requireUser(String userId) {
        if (blank(userId)) {
            throw new IllegalArgumentException("QC processing user is required");
        }
    }
}
