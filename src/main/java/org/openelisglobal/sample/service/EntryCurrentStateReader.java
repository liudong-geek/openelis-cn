package org.openelisglobal.sample.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.analysis.dao.AnalysisDAO;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.samplehuman.dao.SampleHumanDAO;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Builds current facts inside the entry recovery transaction; never grants
 * permission to resume writes.
 */
@Service
public class EntryCurrentStateReader {
    @Autowired
    private SampleService samples;
    @Autowired
    private SampleHumanDAO patientLinks;
    @Autowired
    private PatientService patients;
    @Autowired
    private SampleTypeRequestDAO requests;
    @Autowired
    private SampleItemDAO items;
    @Autowired
    private AnalysisDAO analyses;
    @Autowired
    private StatusOfSampleService statuses;
    @Autowired
    private UserService users;
    @Autowired
    private DefaultConfigurationProperties configuration;
    @Autowired
    private org.openelisglobal.typeofsample.service.TypeOfSampleService sampleTypes;
    @Autowired
    private org.openelisglobal.test.service.TestService tests;
    @Autowired
    private org.openelisglobal.panel.service.PanelService panels;
    @Autowired
    private org.openelisglobal.unitofmeasure.service.UnitOfMeasureService units;
    @Autowired
    private org.openelisglobal.qachecklist.service.QaChecklistReviewReader qaReviews;
    @Autowired
    private SpecimenIntakeDecisionReader intakeDecisions;

    public record PatientView(String id, String nationalId, String firstName, String lastName, String gender,
            String birthDate) {
    }

    public record RequestView(String id, int sortOrder, String typeOfSampleId, Double requestedQuantity,
            String unitOfMeasureId, List<String> testIds, List<String> panelIds, String status, String sampleItemId,
            String createdAt, String lastUpdated) {
    }

    public record AnalysisView(String id, String testId, String statusId, String lastUpdated) {
    }

    public record SpecimenView(String id, String requestId, String sortOrder, String typeOfSampleId, Double quantity,
            String unitOfMeasureId, String statusId, boolean voided, boolean rejected, String collectionDate,
            String receivedDate, String collector, String lastUpdated, List<AnalysisView> analyses) {
    }

    public record MasterDataView(String kind, String id, String name, boolean active) {
    }

    public record CollectionContext(int version, String dateFormat, String timeZone, String laboratoryNow,
            Boolean consentGiven, String consentFormReference, String consentRecordedAt, String consentRecordedBy,
            List<MasterDataView> masterData) {
    }

    public record Snapshot(int version, boolean readOnly, String sampleId, String labNo, String workflowType,
            String orderStatusId, String lastUpdated, PatientView patient, List<RequestView> requestedSpecimens,
            List<SpecimenView> physicalSpecimens, CollectionContext collectionContext,
            org.openelisglobal.qachecklist.service.QaChecklistReviewReader.Review qaReview,
            List<SpecimenIntakeDecisionReader.Tube> specimenDecisions,
            SpecimenIntakeDecisionReader.Reasons intakeReasons) {
        public Snapshot(int version, boolean readOnly, String sampleId, String labNo, String workflowType,
                String orderStatusId, String lastUpdated, PatientView patient, List<RequestView> requestedSpecimens,
                List<SpecimenView> physicalSpecimens, CollectionContext collectionContext,
                org.openelisglobal.qachecklist.service.QaChecklistReviewReader.Review qaReview,
                List<SpecimenIntakeDecisionReader.Tube> specimenDecisions) {
            this(version, readOnly, sampleId, labNo, workflowType, orderStatusId, lastUpdated, patient,
                    requestedSpecimens, physicalSpecimens, collectionContext, qaReview, specimenDecisions, null);
        }

        public Snapshot(int version, boolean readOnly, String sampleId, String labNo, String workflowType,
                String orderStatusId, String lastUpdated, PatientView patient, List<RequestView> requestedSpecimens,
                List<SpecimenView> physicalSpecimens, CollectionContext collectionContext,
                org.openelisglobal.qachecklist.service.QaChecklistReviewReader.Review qaReview) {
            this(version, readOnly, sampleId, labNo, workflowType, orderStatusId, lastUpdated, patient,
                    requestedSpecimens, physicalSpecimens, collectionContext, qaReview, List.of());
        }

        public Snapshot(int version, boolean readOnly, String sampleId, String labNo, String workflowType,
                String orderStatusId, String lastUpdated, PatientView patient, List<RequestView> requestedSpecimens,
                List<SpecimenView> physicalSpecimens, CollectionContext collectionContext) {
            this(version, readOnly, sampleId, labNo, workflowType, orderStatusId, lastUpdated, patient,
                    requestedSpecimens, physicalSpecimens, collectionContext, null);
        }

        public Snapshot(int version, boolean readOnly, String sampleId, String labNo, String workflowType,
                String orderStatusId, String lastUpdated, PatientView patient, List<RequestView> requestedSpecimens,
                List<SpecimenView> physicalSpecimens) {
            this(version, readOnly, sampleId, labNo, workflowType, orderStatusId, lastUpdated, patient,
                    requestedSpecimens, physicalSpecimens, null);
        }
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public Snapshot read(JsonNode original, String actorId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw new IllegalStateException("Current entry state requires the recovery read boundary");
        }
        // The caller has already validated and authorized this immutable receipt.
        String sampleId = requiredId(original.path("sampleId").asText());
        requiredId(actorId);
        var sample = samples.get(sampleId);
        String workflow = original.path("workflowType").asText();
        if (!Set.of("clinical", "environmental").contains(workflow)) {
            throw conflict();
        }
        String domain = configuration
                .getPropertyValue("environmental".equals(workflow) ? "domain.environmental" : "domain.human");
        if (sample == null || !sampleId.equals(sample.getId()) || domain == null || domain.isBlank()
                || !domain.equals(sample.getDomain()) || sample.getAccessionNumber() == null
                || !sample.getAccessionNumber().equals(original.path("labNo").asText())) {
            throw conflict();
        }
        String orderStatus = status(sample.getStatusId(), "ORDER");
        PatientView patient = patient(original, sampleId, workflow);

        var rows = requests.getRequestsBySampleId(sampleId);
        var physicalRows = items.getSampleItemsBySampleId(sampleId); // DAO intentionally includes voided items.
        if (rows == null || rows.isEmpty() || physicalRows == null) {
            throw conflict();
        }
        Map<String, SampleItem> physical = new LinkedHashMap<>();
        for (var item : physicalRows) {
            if (item == null || item.getSample() == null || !sampleId.equals(item.getSample().getId())
                    || physical.putIfAbsent(requiredId(item.getId()), item) != null) {
                throw conflict();
            }
            // Aliquots are legitimate but not yet supported by this recovery contract.
            if (item.getParentSampleItem() != null) {
                throw unsupported();
            }
        }
        Map<String, RequestView> logical = new LinkedHashMap<>();
        Map<String, String> itemToRequest = new HashMap<>();
        Set<String> allTests = new HashSet<>();
        for (JsonNode row : original.path("requestedSpecimens")) {
            allTests.addAll(ids(row.path("requestedTests").asText(), true));
        }
        for (SampleTypeRequest row : rows) {
            if (row == null || row.getId() == null || row.getId() <= 0 || row.getSample() == null
                    || !sampleId.equals(row.getSample().getId()) || row.getStatus() == null
                    || row.getSortOrder() == null || row.getSortOrder() < 0 || row.getTypeOfSample() == null) {
                throw conflict();
            }
            String typeId = requiredId(row.getTypeOfSample().getId());
            String itemId = row.getSampleItem() == null ? null : requiredId(row.getSampleItem().getId());
            if (row.getStatus() == SampleTypeRequest.Status.COLLECTED) {
                SampleItem actual = itemId == null ? null : physical.get(itemId);
                if (actual == null || actual.getTypeOfSample() == null
                        || !typeId.equals(actual.getTypeOfSample().getId())
                        || itemToRequest.putIfAbsent(itemId, row.getId().toString()) != null) {
                    throw conflict();
                }
            } else if (itemId != null) {
                throw conflict();
            }
            List<String> tests = ids(row.getRequestedTests(), true);
            allTests.addAll(tests);
            var view = new RequestView(row.getId().toString(), row.getSortOrder(), typeId,
                    quantity(row.getRequestedQuantity(), false),
                    row.getUnitOfMeasure() == null ? null : requiredId(row.getUnitOfMeasure().getId()), tests,
                    ids(row.getRequestedPanels(), false), row.getStatus().name(), itemId, time(row.getCreatedDate()),
                    time(row.getLastupdated()));
            if (logical.putIfAbsent(view.id(), view) != null) {
                throw conflict();
            }
        }
        Set<String> originalIds = new HashSet<>();
        for (JsonNode row : original.path("requestedSpecimens")) {
            String id = requiredId(row.path("id").asText());
            if (!originalIds.add(id) || !logical.containsKey(id)) {
                throw conflict();
            }
        }
        if (originalIds.isEmpty()) {
            throw conflict();
        }
        // An unlinked physical item may be legacy/extra work. Never silently omit it.
        if (!itemToRequest.keySet().equals(physical.keySet())) {
            throw unsupported();
        }

        List<SpecimenView> specimens = new ArrayList<>();
        List<org.openelisglobal.analysis.valueholder.Analysis> qaAnalyses = new ArrayList<>();
        Set<String> analysisIds = new HashSet<>();
        for (var item : physical.values()) {
            String itemId = item.getId();
            String requestId = itemToRequest.get(itemId);
            List<AnalysisView> itemAnalyses = new ArrayList<>();
            Set<String> physicalTests = new HashSet<>();
            var actualAnalyses = analyses.getAnalysesBySampleItem(item); // All statuses, including canceled.
            if (actualAnalyses == null) {
                throw conflict();
            }
            for (var analysis : actualAnalyses) {
                if (analysis == null || !analysisIds.add(requiredId(analysis.getId()))
                        || analysis.getSampleItem() == null || !itemId.equals(analysis.getSampleItem().getId())
                        || analysis.getTest() == null) {
                    throw conflict();
                }
                String testId = requiredId(analysis.getTest().getId());
                physicalTests.add(testId);
                allTests.add(testId);
                qaAnalyses.add(analysis);
                itemAnalyses.add(new AnalysisView(analysis.getId(), testId, status(analysis.getStatusId(), "ANALYSIS"),
                        time(analysis.getLastupdated())));
            }
            if (!physicalTests.containsAll(logical.get(requestId).testIds())) {
                throw conflict();
            }
            itemAnalyses.sort(Comparator.comparing(AnalysisView::id));
            specimens.add(new SpecimenView(itemId, requestId, item.getSortOrder(),
                    requiredId(item.getTypeOfSample().getId()), quantity(item.getQuantity(), true),
                    item.getUnitOfMeasure() == null ? null : requiredId(item.getUnitOfMeasure().getId()),
                    status(item.getStatusId(), "SAMPLE"), item.isVoided(), item.isRejected(),
                    time(item.getCollectionDate()), time(item.getReceivedDate()), item.getCollector(),
                    time(item.getLastupdated()), List.copyOf(itemAnalyses)));
        }
        Set<String> allowed = new HashSet<>();
        var grants = users.getAllDisplayUserTestsByLabUnit(actorId, Constants.ROLE_RECEPTION);
        if (grants != null) {
            for (var grant : grants) {
                if (grant != null) {
                    allowed.add(grant.getId());
                }
            }
        }
        if (!allowed.containsAll(allTests)) {
            throw new AccessDeniedException("当前登记权限不足，无法查看该申请的完整标本状态。");
        }
        List<RequestView> ordered = logical.values().stream()
                .sorted(Comparator.comparingInt(RequestView::sortOrder).thenComparing(RequestView::id)).toList();
        specimens.sort(Comparator.comparing(SpecimenView::requestId));
        return new Snapshot(1, true, sampleId, sample.getAccessionNumber(), workflow, orderStatus,
                time(sample.getLastupdated()), patient, ordered, List.copyOf(specimens),
                collectionContext(sample, ordered, specimens),
                qaReviews.read(sample, patient == null ? null : patient.id(), rows, physicalRows, qaAnalyses),
                intakeDecisions.read(sampleId, sample.getAccessionNumber(), patient == null ? null : patient.id(),
                        specimens, actorId, qaAnalyses),
                patient == null ? null : intakeDecisions.reasons());
    }

    // Facts from the same read transaction, not a capability token. Historical
    // inactive/missing names remain visible; the collection writer revalidates.
    private CollectionContext collectionContext(org.openelisglobal.sample.valueholder.Sample sample,
            List<RequestView> requested, List<SpecimenView> physical) {
        Map<String, MasterDataView> data = new LinkedHashMap<>();
        for (var request : requested) {
            master(data, "TYPE", request.typeOfSampleId());
            request.testIds().forEach(id -> master(data, "TEST", id));
            request.panelIds().forEach(id -> master(data, "PANEL", id));
            master(data, "UNIT", request.unitOfMeasureId());
        }
        master(data, "ORDER_STATUS", sample.getStatusId());
        for (var item : physical) {
            master(data, "TYPE", item.typeOfSampleId());
            master(data, "UNIT", item.unitOfMeasureId());
            master(data, "SAMPLE_STATUS", item.statusId());
            for (var analysis : item.analyses()) {
                master(data, "TEST", analysis.testId());
                master(data, "ANALYSIS_STATUS", analysis.statusId());
            }
        }
        String locale = configuration
                .getPropertyValue(org.openelisglobal.common.util.ConfigurationProperties.Property.DEFAULT_DATE_LOCALE);
        String format = locale == null || locale.isBlank() ? null
                : org.openelisglobal.common.util.DateUtil
                        .getDateFormatForLocale(java.util.Locale.forLanguageTag(locale.replace('_', '-')));
        var zone = java.util.TimeZone.getDefault().toZoneId();
        return new CollectionContext(1, format, zone.getId(),
                java.time.ZonedDateTime.now(zone)
                        .format(java.time.format.DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm")),
                sample.getConsentGiven(), sample.getConsentFormReference(), time(sample.getConsentRecordedAt()),
                sample.getConsentRecordedBy(), List.copyOf(data.values()));
    }

    private void master(Map<String, MasterDataView> data, String kind, String id) {
        if (id == null || data.containsKey(kind + ":" + id)) {
            return;
        }
        String name = null;
        boolean active = false;
        switch (kind) {
        case "TYPE": {
            var value = sampleTypes.getMatch("id", id).orElse(null);
            if (value != null) {
                if (!id.equals(value.getId())) {
                    throw conflict();
                }
                name = localized(value.getLocalization(), value.getDescription());
                active = value.isActive();
            }
            break;
        }
        case "TEST": {
            var value = tests.getMatch("id", id).orElse(null);
            if (value != null) {
                if (!id.equals(value.getId())) {
                    throw conflict();
                }
                name = localized(value.getLocalizedTestName(), value.getDescription());
                active = value.isActive() && Boolean.TRUE.equals(value.getOrderable());
            }
            break;
        }
        case "PANEL": {
            var value = panels.getPanelById(id);
            if (value != null) {
                if (!id.equals(value.getId())) {
                    throw conflict();
                }
                name = localized(value.getLocalization(), value.getPanelName());
                active = "Y".equals(value.getIsActive());
            }
            break;
        }
        case "UNIT": {
            var value = units.getUnitOfMeasureById(id);
            if (value != null) {
                if (!id.equals(value.getId())) {
                    throw conflict();
                }
                name = value.getUnitOfMeasureName();
                active = "Y".equals(value.getIsActive());
            }
            break;
        }
        default: {
            var value = statuses.get(id);
            if (value == null || !id.equals(value.getId()) || !kind.equals(value.getStatusType() + "_STATUS")) {
                throw conflict();
            }
            name = value.getStatusOfSampleName();
            active = "Y".equals(value.getIsActive());
        }
        }
        data.put(kind + ":" + id,
                new MasterDataView(kind, id, name == null || name.isBlank() ? null : name.trim(), active));
    }

    private static String localized(org.openelisglobal.localization.valueholder.Localization localization,
            String fallback) {
        String name = localization == null ? null : localization.getLocalizedValue();
        return name == null || name.isBlank() ? fallback : name;
    }

    private PatientView patient(JsonNode original, String sampleId, String workflow) {
        var links = patientLinks.getAllMatching("sampleId", sampleId);
        if (links == null || links.size() > 1) {
            throw conflict();
        }
        for (var link : links) {
            if (link == null || !sampleId.equals(link.getSampleId())) {
                throw conflict();
            }
            requiredId(link.getId());
        }
        if ("environmental".equals(workflow)) {
            if (original.has("patientId") || (!links.isEmpty() && links.get(0).getPatientId() != null
                    && !links.get(0).getPatientId().isBlank())) {
                throw conflict();
            }
            return null;
        }
        String expected = requiredId(original.path("patientId").asText());
        if (links.size() != 1 || !expected.equals(links.get(0).getPatientId())) {
            throw conflict();
        }
        var patient = patients.get(expected);
        if (patient == null || !expected.equals(patient.getId()) || patient.getPerson() == null) {
            throw conflict();
        }
        requiredId(patient.getPerson().getId());
        return new PatientView(expected, patient.getNationalId(), patient.getPerson().getFirstName(),
                patient.getPerson().getLastName(), patient.getGender(), patient.getBirthDate() == null ? null
                        : patient.getBirthDate().toLocalDateTime().toLocalDate().toString());
    }

    private String status(String id, String type) {
        var status = statuses.get(requiredId(id));
        if (status == null || !id.equals(status.getId()) || !type.equals(status.getStatusType())) {
            throw conflict();
        }
        return id;
    }

    private static String requiredId(String value) {
        if (value == null || !value.matches("[1-9][0-9]*")) {
            throw conflict();
        }
        return value;
    }

    private static Double quantity(Double value, boolean zeroAllowed) {
        if (value == null || !Double.isFinite(value) || value < 0 || (!zeroAllowed && value == 0)) {
            throw conflict();
        }
        return value;
    }

    private static List<String> ids(String value, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) {
                throw conflict();
            }
            return List.of();
        }
        Set<String> unique = new HashSet<>();
        for (String id : value.split(",", -1)) {
            if (!unique.add(requiredId(id.trim()))) {
                throw conflict();
            }
        }
        return unique.stream().sorted().toList();
    }

    private static String time(Timestamp value) {
        return value == null ? null : value.toInstant().toString();
    }

    private static EntrySubmissionException conflict() {
        return new EntrySubmissionException(409, "ENTRY_CURRENT_STATE_CONFLICT",
                "当前申请或标本记录不完整或关联已变化，请保留保存核对码并联系管理员核对，不要重新开单。");
    }

    private static EntrySubmissionException unsupported() {
        return new EntrySubmissionException(409, "ENTRY_CURRENT_STATE_UNSUPPORTED",
                "该申请包含额外标本或分装记录，暂不支持自动恢复，请联系管理员核对，不要重新开单。");
    }
}
