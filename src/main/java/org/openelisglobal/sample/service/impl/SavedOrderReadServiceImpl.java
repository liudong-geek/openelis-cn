package org.openelisglobal.sample.service.impl;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.TableIdService;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.observationhistory.service.ObservationHistoryServiceImpl.ObservationType;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.form.SavedOrderReadRequest;
import org.openelisglobal.sample.form.SavedOrderReadResponse;
import org.openelisglobal.sample.form.SavedOrderReadResponse.*;
import org.openelisglobal.sample.service.OrderDashboardAccess;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.service.SavedOrderReadAccess;
import org.openelisglobal.sample.service.SavedOrderReadException;
import org.openelisglobal.sample.service.SavedOrderReadService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.test.service.TestService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Compile the complete detached view inside one read-only transaction. */
@Service
public class SavedOrderReadServiceImpl implements SavedOrderReadService {
    private final SavedOrderReadDAO dao;
    private final SavedOrderReadAccess access;
    private final SampleService samples;
    private final TableIdService tables;
    private final ObservationHistoryService observations;
    private final TestService tests;
    private final PanelService panels;
    private final StatusOfSampleService statusDefinitions;
    private final IStatusService statuses;

    public SavedOrderReadServiceImpl(SavedOrderReadDAO dao, SavedOrderReadAccess access, SampleService samples,
            TableIdService tables, ObservationHistoryService observations, TestService tests, PanelService panels,
            StatusOfSampleService statusDefinitions, IStatusService statuses) {
        this.dao = dao;
        this.access = access;
        this.samples = samples;
        this.tables = tables;
        this.observations = observations;
        this.tests = tests;
        this.panels = panels;
        this.statusDefinitions = statusDefinitions;
        this.statuses = statuses;
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public SavedOrderReadResponse read(SavedOrderReadRequest query, HttpServletRequest request) {
        if (query == null)
            throw new IllegalArgumentException("INVALID_SAVED_ORDER_QUERY");
        var scope = access.bind(request);
        var graph = dao.loadExact(query.labNumber())
                .orElseThrow(() -> new SavedOrderReadException(404, "SAVED_ORDER_NOT_FOUND"));
        requireIdentities(graph, query);
        requireScope(graph, scope);
        List<String> warnings = new ArrayList<>();
        var patient = patient(graph, scope.masked(), warnings);
        var itemViews = new ArrayList<SpecimenView>();
        for (var item : graph.items()) {
            List<String> rowWarnings = new ArrayList<>();
            var state = status(item.getStatusId(), "SAMPLE", rowWarnings);
            if (item.getTypeOfSample() == null)
                rowWarnings.add("SPECIMEN_TYPE_UNAVAILABLE");
            List<AnalysisView> analysisViews = new ArrayList<>();
            for (var analysis : graph.analyses())
                if (item.getId().equals(analysis.getSampleItem().getId())) {
                    List<String> analysisWarnings = new ArrayList<>();
                    var analysisState = status(analysis.getStatusId(), "ANALYSIS", analysisWarnings);
                    var test = analysis.getTest();
                    var panel = analysis.getPanel();
                    analysisViews.add(new AnalysisView(analysis.getId(), test.getId(), test.getLocalizedName(),
                            analysis.getTestSection().getId(), panel == null ? null : panel.getId(),
                            panel == null ? null : panel.getPanelName(), analysis.getStatusId(), analysisState.code(),
                            analysisState.name(), "ANALYSIS", instant(analysis.getLastupdated()),
                            List.copyOf(analysisWarnings)));
                    warnings.addAll(analysisWarnings);
                }
            String code = item.getExternalId();
            if (code == null || code.isBlank()) {
                code = null;
                rowWarnings.add("BARCODE_UNVERIFIED");
            }
            var type = item.getTypeOfSample();
            var unit = item.getUnitOfMeasure();
            itemViews.add(new SpecimenView(item.getId(), item.getSortOrder(), code, type == null ? null : type.getId(),
                    type == null ? null : type.getLocalizedName(), item.getStatusId(), state.code(), state.name(),
                    "SAMPLE", instant(item.getLastupdated()), date(item.getCollectionDate()),
                    time(item.getCollectionDate()), date(item.getReceivedDate()), time(item.getReceivedDate()),
                    item.getQuantity(), unit == null ? null : unit.getId(),
                    unit == null ? null : unit.getUnitOfMeasureName(), item.getCollector(),
                    Boolean.TRUE.equals(item.isVoided()), Boolean.TRUE.equals(item.isRejected()),
                    List.copyOf(analysisViews), List.copyOf(rowWarnings)));
            warnings.addAll(rowWarnings);
        }
        List<RequestView> requestViews = new ArrayList<>();
        Map<String, TestView> testViews = new LinkedHashMap<>();
        Map<String, PanelView> panelViews = new LinkedHashMap<>();
        for (var r : graph.requests()) {
            List<String> rowWarnings = new ArrayList<>();
            List<TestView> requestedTests = new ArrayList<>();
            for (String id : csv(r.getRequestedTests(), rowWarnings)) {
                // Cancelled history remains visible without exposing an out-of-scope test name.
                if (!scope.testIds().contains(id)) {
                    rowWarnings.add("REQUEST_TEST_DATA_UNAVAILABLE");
                    requestedTests.add(new TestView(id, null));
                    continue;
                }
                if (!testViews.containsKey(id)) {
                    var test = tests.get(id);
                    testViews.put(id, new TestView(id, test == null ? null : test.getLocalizedName()));
                }
                var test = testViews.get(id);
                if (test.testName() == null)
                    rowWarnings.add("REQUEST_TEST_DATA_UNAVAILABLE");
                requestedTests.add(test);
            }
            boolean redactPanels = r.getStatus() == SampleTypeRequest.Status.CANCELLED && (r.getRequestedTests() == null
                    || r.getRequestedTests().isBlank() || rowWarnings.contains("REQUEST_DETAILS_UNAVAILABLE")
                    || rowWarnings.contains("REQUEST_TEST_DATA_UNAVAILABLE"));
            List<PanelView> requestedPanels = new ArrayList<>();
            for (String id : csv(r.getRequestedPanels(), rowWarnings)) {
                if (redactPanels) {
                    rowWarnings.add("REQUEST_PANEL_DATA_UNAVAILABLE");
                    requestedPanels.add(new PanelView(id, null));
                    continue;
                }
                if (!panelViews.containsKey(id)) {
                    var panel = panels.get(id);
                    panelViews.put(id, new PanelView(id, panel == null ? null : panel.getPanelName()));
                }
                var panel = panelViews.get(id);
                if (panel.panelName() == null)
                    rowWarnings.add("REQUEST_PANEL_DATA_UNAVAILABLE");
                requestedPanels.add(panel);
            }
            var type = r.getTypeOfSample();
            var unit = r.getUnitOfMeasure();
            if (type == null)
                rowWarnings.add("SPECIMEN_TYPE_UNAVAILABLE");
            if (r.getStatus() == null)
                rowWarnings.add("REQUEST_STATE_UNAVAILABLE");
            if (r.getStatus() == SampleTypeRequest.Status.COLLECTED && r.getSampleItem() == null)
                rowWarnings.add("REQUEST_SPECIMEN_UNAVAILABLE");
            if (r.getSampleItem() != null && (r.getTypeOfSample() == null || r.getSampleItem().getTypeOfSample() == null
                    || !r.getTypeOfSample().getId().equals(r.getSampleItem().getTypeOfSample().getId())))
                rowWarnings.add("REQUEST_SPECIMEN_UNAVAILABLE");
            requestViews.add(new RequestView(r.getId().toString(),
                    r.getSampleItem() == null ? null : r.getSampleItem().getId(), r.getSortOrder(),
                    type == null ? null : type.getId(), type == null ? null : type.getLocalizedName(),
                    r.getStatus() == null ? null : r.getStatus().name(), instant(r.getLastupdated()),
                    r.getRequestedQuantity(), unit == null ? null : unit.getId(),
                    unit == null ? null : unit.getUnitOfMeasureName(), List.copyOf(requestedTests),
                    List.copyOf(requestedPanels), rowWarnings.stream().distinct().toList()));
            warnings.addAll(rowWarnings);
        }
        var metadata = metadata(graph, warnings);
        // Do not issue an editable projection if its authority changed while compiling.
        dao.refreshReadContext();
        access.requireUnchanged(request, scope);
        boolean incomplete = warnings.stream().anyMatch(Set.of("PATIENT_DATA_UNAVAILABLE", "STATUS_UNAVAILABLE",
                "SPECIMEN_TYPE_UNAVAILABLE", "REQUEST_STATE_UNAVAILABLE", "REQUEST_SPECIMEN_UNAVAILABLE")::contains);
        boolean canModify = !incomplete && access.canModify(request, scope.actor().userId());
        access.requireUnchanged(request, scope);
        return new SavedOrderReadResponse("2", scope.actor().userId(), query, graph.sample().getId(), query.labNumber(),
                true, canModify, canModify,
                canModify ? null : incomplete ? "INCOMPLETE_ORDER_DATA" : "MODIFY_PERMISSION_DENIED",
                warnings.stream().distinct().toList(), patient, java.util.Collections.unmodifiableMap(metadata),
                List.copyOf(itemViews), List.copyOf(requestViews));
    }

    private void requireIdentities(SavedOrderReadDAO.Graph graph, SavedOrderReadRequest query) {
        var sample = graph.sample();
        if (sample == null || !id(sample.getId()) || !query.labNumber().equals(sample.getAccessionNumber()))
            throw identity();
        if (graph.patients().size() > 1 || graph.patients().stream().anyMatch(p -> p == null || !id(p.getId())))
            throw identity();
        Set<String> itemIds = new HashSet<>(), analysisIds = new HashSet<>(), requestIds = new HashSet<>();
        for (var item : graph.items())
            if (item == null || !id(item.getId()) || !itemIds.add(item.getId()) || item.getSample() == null
                    || !sample.getId().equals(item.getSample().getId()))
                throw identity();
        for (var a : graph.analyses())
            if (a == null || !id(a.getId()) || !analysisIds.add(a.getId()) || a.getSampleItem() == null
                    || !itemIds.contains(a.getSampleItem().getId()) || a.getSampleItem().getSample() == null
                    || !sample.getId().equals(a.getSampleItem().getSample().getId()))
                throw identity();
        for (var r : graph.requests())
            if (r == null || r.getId() == null || r.getId() < 1 || !requestIds.add(r.getId().toString())
                    || r.getSample() == null || !sample.getId().equals(r.getSample().getId())
                    || r.getSampleItem() != null
                            && (!itemIds.contains(r.getSampleItem().getId()) || r.getSampleItem().getSample() == null
                                    || !sample.getId().equals(r.getSampleItem().getSample().getId())))
                throw identity();
    }

    private void requireScope(SavedOrderReadDAO.Graph graph, OrderDashboardAccess.Scope scope) {
        if (scope.testIds().isEmpty() || scope.sectionIds().isEmpty())
            throw denied();
        for (var a : graph.analyses())
            if (a.getTest() == null || !scope.testIds().contains(a.getTest().getId()) || a.getTestSection() == null
                    || !scope.sectionIds().contains(a.getTestSection().getId()))
                throw denied();
        boolean activeRequest = false;
        for (var r : graph.requests())
            if (r.getStatus() != SampleTypeRequest.Status.CANCELLED) {
                activeRequest = true;
                if (r.getStatus() == null || r.getRequestedTests() == null || r.getRequestedTests().isBlank())
                    throw denied();
                for (String id : r.getRequestedTests().replace(" ", "").split(",", -1))
                    if (!id(id) || !scope.testIds().contains(id))
                        throw denied();
            }
        if (graph.analyses().isEmpty() && !activeRequest)
            throw denied();
    }

    private PatientView patient(SavedOrderReadDAO.Graph graph, boolean masked, List<String> warnings) {
        if (graph.patients().size() != 1 || !id(graph.patients().get(0).getId())
                || graph.patients().get(0).getPerson() == null) {
            warnings.add("PATIENT_DATA_UNAVAILABLE");
            return null;
        }
        var p = graph.patients().get(0);
        var person = p.getPerson();
        if (masked) {
            warnings.add("PATIENT_DATA_REDACTED");
            return new PatientView(p.getId(), null, null, null, null, null, null, null, null, null, null,
                    instant(p.getLastupdated()));
        }
        return new PatientView(p.getId(), person.getFirstName(), person.getLastName(), person.getMiddleName(),
                p.getGender(),
                p.getBirthDate() == null ? null : p.getBirthDate().toLocalDateTime().toLocalDate().toString(),
                p.getNationalId(), p.getExternalId(), person.getStreetAddress(), person.getPrimaryPhone(),
                person.getEmail(), instant(p.getLastupdated()));
    }

    private Map<String, Object> metadata(SavedOrderReadDAO.Graph graph, List<String> warnings) {
        Sample sample = graph.sample();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("requestDate", observations.getRawValueForSample(ObservationType.REQUEST_DATE, sample.getId()));
        result.put("collectionDate", sample.getCollectionDateForDisplay());
        result.put("receivedDateForDisplay", sample.getReceivedDateForDisplay());
        result.put("receivedTime", sample.getReceivedTimeForDisplay());
        result.put("priority", sample.getPriority() == null ? null : sample.getPriority().name());
        result.put("lastupdated", instant(sample.getLastupdated()));
        result.put("program", observations.getRawValueForSample(ObservationType.PROGRAM, sample.getId()));
        result.put("paymentOptionSelection",
                observations.getRawValueForSample(ObservationType.PAYMENT_STATUS, sample.getId()));
        result.put("billingReferenceNumber",
                observations.getRawValueForSample(ObservationType.BILLING_REFERENCE_NUMBER, sample.getId()));
        var site = samples.getOrganizationRequester(sample, tables.REFERRING_ORG_TYPE_ID);
        var department = samples.getOrganizationRequester(sample, tables.REFERRING_ORG_DEPARTMENT_TYPE_ID);
        result.put("referringSiteId", site == null ? null : site.getId());
        result.put("referringSiteName", site == null ? null : site.getOrganizationName());
        result.put("referringSiteCode", site == null ? null : site.getShortName());
        result.put("referringSiteDepartmentId", department == null ? null : department.getId());
        result.put("referringSiteDepartmentName", department == null ? null : department.getOrganizationName());
        if (graph.providers().size() == 1 && graph.providers().get(0).getPerson() != null) {
            var provider = graph.providers().get(0);
            var person = provider.getPerson();
            result.put("providerId", provider.getId());
            result.put("providerPersonId", person.getId());
            result.put("providerFirstName", person.getFirstName());
            result.put("providerLastName", person.getLastName());
            result.put("providerWorkPhone", person.getWorkPhone());
            result.put("providerEmail", person.getEmail());
            result.put("providerFax", person.getFax());
        } else if (!graph.providers().isEmpty())
            warnings.add("PROVIDER_DATA_UNAVAILABLE");
        return result;
    }

    private record State(String code, String name) {
    }

    private State status(String id, String type, List<String> warnings) {
        var definition = id == null ? null : statusDefinitions.get(id);
        var code = "SAMPLE".equals(type) ? statuses.getSampleStatusForID(id) : statuses.getAnalysisStatusForID(id);
        if (definition == null || !type.equals(definition.getStatusType()) || code == null) {
            warnings.add("STATUS_UNAVAILABLE");
            return new State(null, null);
        }
        return new State(code.name(), statuses.getStatusNameFromId(id));
    }

    private List<String> csv(String csv, List<String> warnings) {
        if (csv == null || csv.isBlank())
            return List.of();
        List<String> ids = new ArrayList<>();
        for (String token : csv.split(",", -1)) {
            String id = token.trim();
            if (id(id)) {
                if (!ids.contains(id))
                    ids.add(id);
            } else
                warnings.add("REQUEST_DETAILS_UNAVAILABLE");
        }
        return ids;
    }

    private boolean id(String id) {
        return id != null && id.matches("[1-9][0-9]*");
    }

    private String instant(Timestamp value) {
        return value == null ? null : value.toInstant().toString();
    }

    private String date(Timestamp value) {
        return value == null ? null : DateUtil.convertTimestampToStringDate(value);
    }

    private String time(Timestamp value) {
        return value == null ? null : DateUtil.convertTimestampToStringTime(value);
    }

    private SavedOrderReadException identity() {
        return new SavedOrderReadException(409, "INCONSISTENT_ORDER_IDENTITY");
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("SAVED_ORDER_PERMISSION_DENIED");
    }
}
