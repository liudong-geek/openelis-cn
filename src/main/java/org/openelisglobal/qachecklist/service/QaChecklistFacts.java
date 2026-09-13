package org.openelisglobal.qachecklist.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO.Prerequisites;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * Explicit, canonical scalar facts. Never serialize a Hibernate entity graph.
 */
public final class QaChecklistFacts {
    private static final ObjectMapper JSON = new ObjectMapper();
    public static final String SCOPE = "ALL_CURRENT_TUBES_CHECKLIST";

    private QaChecklistFacts() {
    }

    public record Basis(String json, String digest, List<String> specimenIds) {
        public Basis {
            specimenIds = List.copyOf(specimenIds);
        }

        public JsonNode content() {
            try {
                return JSON.readTree(json);
            } catch (Exception e) {
                throw conflict();
            }
        }
    }

    /** Freeze both values and versions, including valid-to-valid changes. */
    public static String graph(Sample sample, List<SampleTypeRequest> requests, List<SampleItem> items,
            List<Analysis> analyses) {
        var root = JSON.createObjectNode();
        root.set("order",
                row(sample.getId(), sample.getAccessionNumber(), sample.getDomain(), sample.getStatusId(),
                        time(sample.getReceivedTimestamp()), time(sample.getLastupdated()), sample.getStorageSkipped(),
                        sample.getConsentGiven(), sample.getConsentFormReference(), time(sample.getConsentRecordedAt()),
                        sample.getConsentRecordedBy()));
        var planned = root.putArray("requests");
        requests.stream().sorted(Comparator.comparing(SampleTypeRequest::getId))
                .forEach(value -> planned.add(row(value.getId(), value.getSample().getId(), value.getStatus(),
                        value.getSortOrder(), value.getSampleItem() == null ? null : value.getSampleItem().getId(),
                        value.getTypeOfSample() == null ? null : value.getTypeOfSample().getId(),
                        value.getTypeOfSample() == null ? null : value.getTypeOfSample().isActive(),
                        value.getTypeOfSample() == null ? null : time(value.getTypeOfSample().getLastupdated()),
                        value.getTypeOfSample() == null ? null
                                : localized(value.getTypeOfSample().getLocalization(),
                                        value.getTypeOfSample().getDescription()),
                        value.getRequestedTests(), value.getRequestedPanels(), value.getRequestedQuantity(),
                        value.getUnitOfMeasure() == null ? null : value.getUnitOfMeasure().getId(),
                        time(value.getCreatedDate()), time(value.getLastupdated()))));
        var physical = root.putArray("specimens");
        items.stream().sorted(Comparator.comparing(SampleItem::getId))
                .forEach(value -> physical.add(row(value.getId(), value.getSample().getId(), value.getSortOrder(),
                        value.getTypeOfSample().getId(), value.getTypeOfSample().isActive(),
                        time(value.getTypeOfSample().getLastupdated()),
                        localized(value.getTypeOfSample().getLocalization(), value.getTypeOfSample().getDescription()),
                        value.getQuantity(), value.getUnitOfMeasure() == null ? null : value.getUnitOfMeasure().getId(),
                        value.getStatusId(), value.isVoided(), value.isRejected(),
                        value.getParentSampleItem() == null ? null : value.getParentSampleItem().getId(),
                        time(value.getCollectionDate()), time(value.getReceivedDate()), value.getCollector(),
                        time(value.getLastupdated()))));
        var testing = root.putArray("analyses");
        analyses.stream().sorted(Comparator.comparing(Analysis::getId))
                .forEach(value -> testing.add(row(value.getId(), value.getSampleItem().getId(), value.getTest().getId(),
                        value.getTest().isActive(), time(value.getTest().getLastupdated()),
                        localized(value.getTest().getLocalizedTestName(), value.getTest().getDescription()),
                        value.getTest().getOrderable(), value.getStatusId(), time(value.getStartedDate()),
                        time(value.getCompletedDate()), time(value.getLastupdated()))));
        return root.toString();
    }

    public static Basis capture(Sample sample, Patient patient, List<SampleTypeRequest> requests,
            List<SampleItem> items, List<Analysis> analyses, List<Dictionary> configuration,
            Prerequisites prerequisites, java.util.function.BiFunction<String, String, String> statusName) {
        if (patient == null || patient.getPerson() == null || Boolean.TRUE.equals(patient.getIsMerged())
                || patient.getMergedIntoPatientId() != null || items.isEmpty() || items.size() > 100
                || !ready(prerequisites) || sample.getLastupdated() == null || patient.getLastupdated() == null
                || patient.getPerson().getLastupdated() == null) {
            throw conflict();
        }
        requireId(sample.getId());
        requireId(patient.getId());
        requireId(patient.getPerson().getId());
        String orderState = statusName.apply(sample.getStatusId(), "ORDER");
        if (!java.util.Set.of("Test Entered", "Testing Started").contains(orderState == null ? "" : orderState)) {
            throw conflict();
        }
        QaChecklistSnapshot.normalize(configuration, java.util.Map.of());
        for (var item : items) {
            requireId(item.getId());
            requireId(item.getTypeOfSample().getId());
            quantity(item.getQuantity(), true);
            if (item.getLastupdated() == null || item.getCollectionDate() == null || item.getReceivedDate() == null
                    || item.isVoided() || item.isRejected() || item.getParentSampleItem() != null
                    || !item.getTypeOfSample().isActive() || item.getTypeOfSample().getLastupdated() == null
                    || !sample.getId().equals(item.getSample().getId())
                    || !"SampleEntered".equals(statusName.apply(item.getStatusId(), "SAMPLE"))
                    || !item.getCollectionDate().toInstant().isAfter(java.time.Instant.EPOCH)
                    || item.getReceivedDate().before(item.getCollectionDate())
                    || item.getReceivedDate().toInstant().isAfter(java.time.Instant.now())) {
                throw conflict();
            }
        }
        for (var request : requests) {
            requireId(request.getId() == null ? null : request.getId().toString());
            requireId(request.getTypeOfSample().getId());
            quantity(request.getRequestedQuantity(), false);
            if (request.getSortOrder() == null || request.getSortOrder() < 0
                    || !sample.getId().equals(request.getSample().getId())) {
                throw conflict();
            }
            if (request.getLastupdated() == null || (request.getStatus() != SampleTypeRequest.Status.CANCELLED
                    && request.getStatus() != SampleTypeRequest.Status.COLLECTED)) {
                throw conflict();
            }
        }
        for (var analysis : analyses) {
            requireId(analysis.getId());
            requireId(analysis.getTest().getId());
            if (analysis.getLastupdated() == null || !analysis.getTest().isActive()
                    || analysis.getTest().getLastupdated() == null
                    || !"Not Tested".equals(statusName.apply(analysis.getStatusId(), "ANALYSIS"))) {
                throw conflict();
            }
        }
        try {
            ObjectNode root = JSON.createObjectNode();
            root.put("schema", 1).put("scope", SCOPE);
            root.set("graph", JSON.readTree(graph(sample, requests, items, analyses)));
            root.set("patient",
                    row(patient.getId(), patient.getNationalId(), patient.getGender(), time(patient.getBirthDate()),
                            time(patient.getLastupdated()), patient.getIsMerged(), patient.getMergedIntoPatientId(),
                            patient.getPerson().getId(), patient.getPerson().getFirstName(),
                            patient.getPerson().getLastName(), time(patient.getPerson().getLastupdated())));
            var configured = root.putArray("configuration");
            configuration.stream().sorted(Comparator.comparing(Dictionary::getDictEntry)).forEach(item -> {
                if (item.getId() == null || item.getLastupdated() == null) {
                    throw conflict();
                }
                var check = configured.addObject();
                check.put("id", item.getId()).put("key", item.getDictEntry()).put("label", label(item));
                check.put("sortOrder", item.getSortOrder());
                check.put("lastUpdated", time(item.getLastupdated()));
            });
            // This is the aggregate storage obligation, NOT a location attestation.
            root.set("intakePrerequisites", JSON.valueToTree(prerequisites));
            String content = root.toString();
            if (content.getBytes(StandardCharsets.UTF_8).length > 1024 * 1024) {
                throw conflict();
            }
            return new Basis(content, digest(content), items.stream().map(SampleItem::getId).sorted().toList());
        } catch (QaChecklistValidationException e) {
            throw e;
        } catch (Exception e) {
            throw conflict();
        }
    }

    public static boolean ready(Prerequisites p) {
        return p != null && p.registered() && p.collected() && p.stored() && !p.disposed() && !p.rejected()
                && !p.statusConflict() && !p.noActiveTests();
    }

    public static String label(Dictionary item) {
        String label = item.getLocalAbbreviation();
        if (label == null || label.isBlank()) {
            label = item.getLocalizedName();
        }
        if (label == null || label.isBlank()) {
            throw conflict();
        }
        return label;
    }

    public static String digest(String value) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw conflict();
        }
    }

    public static String time(Timestamp value) {
        return value == null ? null : value.toInstant().toString();
    }

    private static String localized(org.openelisglobal.localization.valueholder.Localization value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String localized = value.getLocalizedValue();
        return localized == null || localized.isBlank() ? fallback : localized;
    }

    private static void requireId(String id) {
        if (id == null || !id.matches("[1-9][0-9]{0,9}") || Long.parseLong(id) > Integer.MAX_VALUE) {
            throw conflict();
        }
    }

    private static void quantity(Double value, boolean zeroAllowed) {
        if (value == null || !Double.isFinite(value) || value < 0 || !zeroAllowed && value == 0) {
            throw conflict();
        }
    }

    private static JsonNode row(Object... values) {
        return JSON.valueToTree(values);
    }

    public static QaChecklistValidationException conflict() {
        return new QaChecklistValidationException(409, "QA_CONFIRMATION_NOT_READY",
                "qa.checklist.confirmationNotReady");
    }
}
