package org.openelisglobal.workplan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.HexFormat;
import java.util.stream.Collectors;
import org.openelisglobal.analysis.dao.AnalysisDAO;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.QAService;
import org.openelisglobal.common.services.QAService.QAObservationType;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.StringUtil;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.observationhistory.service.ObservationHistoryServiceImpl.ObservationType;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleqaevent.service.SampleQaEventService;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.service.TestServiceImpl;
import org.openelisglobal.workplan.form.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkplanQueryServiceImpl implements WorkplanQueryService {
    private final AnalysisDAO dao;
    private final WorkplanQueryAuthorizationService authorization;
    private final IStatusService statuses;
    private final StatusOfSampleService statusObjects;
    private final TestService tests;
    private final PanelService panels;
    private final PanelItemService panelItems;
    private final TestSectionService sections;
    private final PatientService patients;
    private final SampleHumanService humans;
    private final ObservationHistoryService observations;
    private final SampleQaEventService qaEvents;

    public WorkplanQueryServiceImpl(AnalysisDAO dao, WorkplanQueryAuthorizationService authorization,
            IStatusService statuses, StatusOfSampleService statusObjects, TestService tests, PanelService panels,
            PanelItemService panelItems, TestSectionService sections, PatientService patients,
            SampleHumanService humans, ObservationHistoryService observations, SampleQaEventService qaEvents) {
        this.dao = dao;
        this.authorization = authorization;
        this.statuses = statuses;
        this.statusObjects = statusObjects;
        this.tests = tests;
        this.panels = panels;
        this.panelItems = panelItems;
        this.sections = sections;
        this.patients = patients;
        this.humans = humans;
        this.observations = observations;
        this.qaEvents = qaEvents;
    }

    private record Scope(Set<String> tests, String section, OrderPriority priority, String title) {
    }

    private record Statuses(List<String> ids, Set<String> active) {
    }

    private Statuses currentStatuses() {
        List<String> ids = new ArrayList<>();
        Set<String> active = new HashSet<>();
        for (var semantic : List.of(AnalysisStatus.NotStarted, AnalysisStatus.BiologistRejected,
                AnalysisStatus.TechnicalRejected, AnalysisStatus.NonConforming_depricated)) {
            String id = statuses.getStatusID(semantic);
            StatusOfSample status = id == null ? null : statusObjects.get(id);
            if (status == null || !Objects.equals(status.getId(), id) || !"ANALYSIS".equals(status.getStatusType()))
                throw new IllegalStateException("workplan.statusConfigurationUnavailable");
            ids.add(id);
            if ("Y".equals(status.getIsActive()))
                active.add(id);
        }
        return new Statuses(List.copyOf(ids), Set.copyOf(active));
    }

    private Scope scope(WorkplanQueryRequest q, Set<String> allowed) {
        Set<String> visible = new HashSet<>(allowed);
        String section = null;
        OrderPriority priority = null;
        String title;
        switch (q.type()) {
        case "test": {
            var test = tests.get(q.filterId());
            if (test == null)
                throw new IllegalArgumentException("workplan.invalidQuery");
            visible.retainAll(Set.of(test.getId()));
            title = testName(test);
            break;
        }
        case "panel": {
            var panel = panels.get(q.filterId());
            if (panel == null)
                throw new IllegalArgumentException("workplan.invalidQuery");
            var items = panelItems.getPanelItemsForPanel(panel.getId());
            if (items == null)
                throw new IllegalStateException("workplan.queryUnavailable");
            visible.retainAll(items.stream().filter(i -> i.getTest() != null).map(i -> i.getTest().getId())
                    .collect(Collectors.toSet()));
            title = panel.getLocalizedName();
            break;
        }
        case "unit": {
            var unit = sections.get(q.filterId());
            if (unit == null)
                throw new IllegalArgumentException("workplan.invalidQuery");
            section = unit.getId();
            var unitTests = sections.getTestsInSection(section);
            if (unitTests == null)
                throw new IllegalStateException("workplan.queryUnavailable");
            visible.retainAll(unitTests.stream().map(t -> t.getId()).collect(Collectors.toSet()));
            title = sections.getUserLocalizedTesSectionName(unit);
            break;
        }
        case "priority": {
            priority = OrderPriority.valueOf(q.filterId());
            title = priority.name();
            break;
        }
        default:
            throw new IllegalArgumentException("workplan.invalidQuery");
        }
        return new Scope(Set.copyOf(visible), section, priority, title == null ? "" : title);
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public WorkplanQueryResponse query(HttpServletRequest request, WorkplanQueryRequest query) {
        var q = WorkplanQueryRequest.of(query.type(), query.filterId(), Integer.toString(query.page()),
                Integer.toString(query.pageSize()));
        String actor = authorization.requireRead(request, q.type());
        Set<String> allowed = authorization.allowedTestIds(actor);
        Scope scope = scope(q, allowed);
        Statuses status = currentStatuses();
        boolean mayPrint = authorization.canPrint(request, actor, q.type());
        long count = dao.countWorkplanAnalyses(status.ids, scope.tests, scope.section, scope.priority);
        long pages = Math.max(1, (count + q.pageSize() - 1) / q.pageSize());
        if (q.page() > pages)
            throw new IllegalArgumentException("workplan.invalidQuery");
        var analyses = dao.getWorkplanAnalyses(status.ids, scope.tests, scope.section, scope.priority,
                (q.page() - 1) * q.pageSize(), q.pageSize());
        if (analyses == null)
            throw new IllegalStateException("workplan.queryUnavailable");
        List<WorkplanQueryRow> rows = new ArrayList<>();
        String lastSample = null;
        int group = 0;
        for (var analysis : analyses) {
            String sample = analysis.getSampleItem() == null || analysis.getSampleItem().getSample() == null ? null
                    : analysis.getSampleItem().getSample().getId();
            if (!Objects.equals(lastSample, sample)) {
                group++;
                lastSample = sample;
            }
            rows.add(display(analysis, status.active, mayPrint, group));
        }
        return new WorkplanQueryResponse("2", actor, q,
                new WorkplanQueryResponse.EffectiveScope("Results",
                        scope.tests.stream().sorted(Comparator.comparingLong(Long::parseLong)).toList()),
                new WorkplanQueryResponse.Paging(Integer.toString(q.page()), Long.toString(pages), count, q.pageSize()),
                List.copyOf(rows), scope.title, mayPrint, pageSnapshot(q, actor, scope.tests, rows));
    }

    private String pageSnapshot(WorkplanQueryRequest q, String actor, Set<String> tests, List<WorkplanQueryRow> rows) {
        var identities = rows.stream().map(r -> Arrays.asList(r.analysisId(), r.sampleId(), r.sampleItemId(),
                r.testId(), r.accessionNumber(), r.statusId(), r.lastupdated())).toList();
        var canonical = List.of(q.type(), q.filterId(), q.page(), q.pageSize(), actor,
                tests.stream().sorted(Comparator.comparingLong(Long::parseLong)).toList(), identities);
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(new ObjectMapper().writeValueAsBytes(canonical)));
        } catch (Exception e) {
            throw new IllegalStateException("workplan.queryUnavailable", e);
        }
    }

    protected String testName(org.openelisglobal.test.valueholder.Test test) {
        return TestServiceImpl.getUserLocalizedTestName(test);
    }

    protected boolean nonconforming(Analysis analysis) {
        boolean result = QAService.isAnalysisParentNonConforming(analysis);
        if (FormFields.getInstance().useField(Field.QaEventsBySection) && analysis.getTestSection() != null) {
            var events = qaEvents.getSampleQaEventsBySample(analysis.getSampleItem().getSample());
            if (events == null)
                throw new IllegalStateException("workplan.queryUnavailable");
            result = result || events.stream().anyMatch(
                    event -> Objects.equals(new QAService(event).getObservationValue(QAObservationType.SECTION),
                            analysis.getTestSection().getNameKey()));
        }
        return result;
    }

    protected WorkplanQueryRow display(Analysis a, Set<String> active, boolean mayPrint, int group) {
        var item = a.getSampleItem();
        var sample = item == null ? null : item.getSample();
        var test = a.getTest();
        String sampleId = sample == null ? null : sample.getId(), itemId = item == null ? null : item.getId(),
                testId = test == null ? null : test.getId();
        String accession = sample == null ? null : sample.getAccessionNumber(),
                version = a.getLastupdated() == null ? null : a.getLastupdated().toInstant().toString();
        boolean complete = numeric(a.getId()) && numeric(sampleId) && numeric(itemId) && numeric(testId)
                && numeric(a.getStatusId()) && accession != null && !accession.isBlank() && version != null;
        String reason = !complete ? "INCOMPLETE_ANALYSIS_IDENTITY"
                : !active.contains(a.getStatusId()) ? "INACTIVE_STATUS" : !mayPrint ? "PRINT_PERMISSION_DENIED" : null;
        String patientInfo = "", patientName = "", nextVisit = "", received = "";
        if (sample != null) {
            received = sample.getReceivedDateForDisplay()
                    + (FormFields.getInstance().useField(Field.SampleEntryUseReceptionHour)
                            ? " " + sample.getReceivedTimeForDisplay()
                            : "");
            nextVisit = Objects.toString(observations.getValueForSample(ObservationType.NEXT_VISIT_DATE, sampleId), "");
            var config = ConfigurationProperties.getInstance();
            if (config.isPropertyValueEqual(Property.SUBJECT_ON_WORKPLAN, "true")
                    || config.isPropertyValueEqual(Property.configurationName, "Haiti LNSP")) {
                var patient = humans.getPatientForSample(sample);
                if (patient != null) {
                    if (config.isPropertyValueEqual(Property.SUBJECT_ON_WORKPLAN, "true"))
                        patientInfo = Objects.toString(patients.getSubjectNumber(patient), "");
                    if (config.isPropertyValueEqual(Property.configurationName, "Haiti LNSP"))
                        patientName = StringUtil
                                .buildDelimitedStringFromList(
                                        Arrays.asList(Objects.toString(patients.getLastName(patient), "").toUpperCase(),
                                                Objects.toString(patients.getNationalId(patient), ""),
                                                Objects.toString(observations.getValueForSample(
                                                        ObservationType.REFERRERS_PATIENT_ID, sampleId), "")),
                                        " / ", true);
                }
            }
        }
        return new WorkplanQueryRow(a.getId(), sampleId, itemId, testId, accession, a.getStatusId(), version,
                a.getTestSection() == null ? null : a.getTestSection().getId(), Objects.toString(received, ""),
                test == null ? "" : testName(test), patientInfo, patientName, nextVisit,
                sample != null && nonconforming(a), group, "ANALYSIS", sampleId, patientName, reason == null, reason);
    }

    private boolean numeric(String id) {
        if (id == null || !id.matches("[1-9][0-9]*"))
            return false;
        try {
            return Integer.parseInt(id) > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public WorkplanQueryResponse preparePrint(HttpServletRequest request, WorkplanPrintRequest selection) {
        if (selection == null || selection.getAnalyses() == null || selection.getAnalyses().isEmpty()
                || selection.getAnalyses().size() > 100 || selection.getPageSnapshot() == null
                || !selection.getPageSnapshot().matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("workplan.invalidPrintSelection");
        Set<String> ids = new HashSet<>();
        for (var identity : selection.getAnalyses()) {
            if (identity == null || !numeric(identity.getAnalysisId()) || !numeric(identity.getSampleId())
                    || !numeric(identity.getSampleItemId()) || !numeric(identity.getTestId())
                    || !numeric(identity.getStatusId()) || identity.getAccessionNumber() == null
                    || identity.getAccessionNumber().isBlank() || identity.getAccessionNumber().length() > 60
                    || identity.getLastupdated() == null || !ids.add(identity.getAnalysisId()))
                throw new IllegalArgumentException("workplan.invalidPrintSelection");
            try {
                if (!Instant.parse(identity.getLastupdated()).toString().equals(identity.getLastupdated()))
                    throw new IllegalArgumentException();
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("workplan.invalidPrintSelection");
            }
        }
        var q = selection.query();
        String actor = authorization.requireRead(request, q.type());
        if (!authorization.canPrint(request, actor, q.type()))
            throw new AccessDeniedException("workplan.permissionDenied");
        Set<String> allowed = authorization.allowedTestIds(actor);
        var selectedCurrent = dao.getWorkplanAnalysesByIds(ids);
        if (selectedCurrent == null)
            throw new IllegalStateException("workplan.queryUnavailable");
        if (selectedCurrent.stream().anyMatch(a -> a.getTest() == null || !allowed.contains(a.getTest().getId())))
            throw new AccessDeniedException("workplan.permissionDenied");
        WorkplanQueryResponse page;
        try {
            page = query(request, q);
        } catch (IllegalArgumentException e) {
            throw changed();
        }
        if (!Objects.equals(selection.getPageSnapshot(), page.pageSnapshot()))
            throw changed();
        Map<String, WorkplanQueryRow> rows = page.workplanTests().stream()
                .collect(Collectors.toMap(WorkplanQueryRow::analysisId, r -> r));
        for (var identity : selection.getAnalyses()) {
            var r = rows.get(identity.getAnalysisId());
            if (r == null || !r.canPrint() || !Objects.equals(r.sampleId(), identity.getSampleId())
                    || !Objects.equals(r.sampleItemId(), identity.getSampleItemId())
                    || !Objects.equals(r.testId(), identity.getTestId())
                    || !Objects.equals(r.accessionNumber(), identity.getAccessionNumber())
                    || !Objects.equals(r.statusId(), identity.getStatusId())
                    || !Objects.equals(r.lastupdated(), identity.getLastupdated()))
                throw changed();
        }
        return new WorkplanQueryResponse(page.queryVersion(), page.currentUserId(), page.query(), page.effectiveScope(),
                page.paging(), page.workplanTests().stream().filter(r -> ids.contains(r.analysisId())).toList(),
                page.reportTitle(), page.canPrint(), page.pageSnapshot());
    }

    private ResponseStatusException changed() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "workplan.selectionChanged");
    }
}
