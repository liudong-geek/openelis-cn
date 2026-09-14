package org.openelisglobal.sample.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.dictionarycategory.valueholder.DictionaryCategory;
import org.openelisglobal.qachecklist.service.QaChecklistFacts;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionWriteDAO;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SpecimenIntakeDecisionCommand;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Reason;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.BeanUtils;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Records a first human decision. Never releases results or reports. */
@Service
public class SpecimenIntakeDecisionService {
    private final SpecimenReceiptDAO graphDao;
    private final SpecimenIntakeDecisionWriteDAO decisions;
    private final OrderEntryActorGuard actors;
    private final SampleItemService items;
    private final UserService users;
    private final AuditTrailService audit;
    private final DefaultConfigurationProperties configuration;

    public SpecimenIntakeDecisionService(SpecimenReceiptDAO graphDao, SpecimenIntakeDecisionWriteDAO decisions,
            OrderEntryActorGuard actors, SampleItemService items, UserService users, AuditTrailService audit,
            DefaultConfigurationProperties configuration) {
        this.graphDao = graphDao;
        this.decisions = decisions;
        this.actors = actors;
        this.items = items;
        this.users = users;
        this.audit = audit;
        this.configuration = configuration;
    }

    public record Result(boolean success, boolean replayed, String sampleId, String labNo, String patientId,
            String requestId, String sampleItemId, String operationId, String recordedDecision, Reason reason,
            String decidedBy, String decidedAt, boolean currentAcceptanceVerified) {
    }

    private record Graph(Sample sample, SampleTypeRequest planned, SampleItem item, List<Analysis> analyses,
            SpecimenReceiptDAO.Membership membership, String domain) {
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.SERIALIZABLE, timeout = 45)
    public Result decide(JsonNode body, HttpServletRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw conflict();
        }
        graphDao.requireCleanContext();
        var actor = actors.bind(request);
        var input = SpecimenIntakeDecisionCommand.parse(body);
        var graph = lockGraph(input);
        Set<String> permittedTests = targetTests(graph);
        requirePermission(actor.userId(), permittedTests);
        var claims = decisions.lockClaims(input.operationId(), input.sampleItemId());
        if (claims == null || claims.size() > 1) {
            throw conflict();
        }
        if (!claims.isEmpty()) {
            var row = claims.get(0);
            validateReplay(row, input, actor.userId());
            if (!row.evidence().typeOfSampleId().equals(graph.item().getTypeOfSample().getId())) {
                throw conflict();
            }
            row.evidence().analyses().forEach(value -> permittedTests.add(value.testId()));
            requirePermission(actor.userId(), permittedTests);
            String frozen = fingerprint(graph, graph.item());
            Runnable verify = () -> {
                verifyGraph(graph, graph.item(), input, actor, request, permittedTests, frozen);
                decisions.requireManaged(List.of(row));
                validateReplay(row, input, actor.userId());
                if (!row.evidence().typeOfSampleId().equals(graph.item().getTypeOfSample().getId())) {
                    throw conflict();
                }
            };
            verify.run();
            register(verify);
            return result(row, true);
        }

        var type = decisions.lockType(graph.item().getTypeOfSample().getId());
        var tests = decisions.lockTests(permittedTests.stream().sorted().toList());
        if (type == null || type != graph.item().getTypeOfSample() || type != graph.planned().getTypeOfSample()
                || tests == null || tests.size() != permittedTests.size()) {
            throw conflict();
        }
        var actualTestIds = new HashSet<String>();
        for (var test : tests) {
            if (test == null || !actualTestIds.add(id(test.getId()))) {
                throw conflict();
            }
        }
        if (!actualTestIds.equals(permittedTests)) {
            throw conflict();
        }
        for (var analysis : graph.analyses()) {
            if (tests.stream().noneMatch(test -> test == analysis.getTest())) {
                throw conflict();
            }
        }
        var managedMasters = new ArrayList<Object>();
        managedMasters.add(type);
        managedMasters.addAll(tests);
        Dictionary reason = input.reason() == null ? null : decisions.lockReason(input.reason().id());
        DictionaryCategory category = reason == null || reason.getDictionaryCategory() == null ? null
                : decisions.lockReasonCategory(reason.getDictionaryCategory().getId());
        StatusOfSample rejectedStatus = null;
        if (input.decision() == Decision.REJECTED) {
            var statuses = decisions.lockRejectedStatuses();
            if (statuses == null || statuses.size() != 1) {
                throw conflict();
            }
            rejectedStatus = statuses.get(0);
            id(rejectedStatus.getId());
            managedMasters.add(rejectedStatus);
        }
        if (reason != null) {
            managedMasters.add(reason);
        }
        if (category != null) {
            managedMasters.add(category);
        }
        var referenceRows = decisions.lockAuditReferences();
        String frozenAudit = auditState(referenceRows);
        managedMasters.addAll(referenceRows);
        var status = rejectedStatus;
        String frozenMasters = masters(type, tests, reason, category, status, input);
        var evidence = evidence(graph);
        if (!input.expectedEvidenceDigest().equals(SpecimenIntakeEvidence.digest(evidence.encode()))) {
            throw conflict();
        }
        requireNewState(graph);
        String frozenGraph = fingerprint(graph, graph.item());
        String originalStatus = graph.item().getStatusId(), originalReason = graph.item().getRejectReasonId();
        boolean originalRejected = graph.item().isRejected();
        Runnable precheck = () -> {
            decisions.requireManaged(List.of(graph.item()));
            verifyGraph(graph, graph.item(), input, actor, request, permittedTests, frozenGraph);
            requireNewState(graph);
            verifyMasters(managedMasters, frozenMasters, frozenAudit, type, tests, reason, category, status, input);
        };
        precheck.run();
        Reason verifiedReason = input.reason() == null ? null
                : new Reason(input.reason().namespace(), reason.getId(), time(reason.getLastupdated()),
                        reason.getDictEntry());
        SpecimenIntakeDecision row;
        try {
            row = SpecimenIntakeDecision.record(input.operationId(), input.sampleId(), input.labNo(), input.patientId(),
                    input.requestId(), input.sampleItemId(), input.decision(), verifiedReason, evidence, actor.userId(),
                    Clock.systemUTC());
        } catch (IllegalArgumentException invalidFacts) {
            // This validation precedes the first insert: it is a known conflict, not an
            // uncertain commit.
            throw conflict();
        }
        var savedRow = decisions.insert(row);
        if (savedRow != row || savedRow.getId() == null) {
            throw conflict();
        }
        id(savedRow.getId());
        precheck.run();
        audit.saveNewHistory(savedRow, actor.userId(), "specimen_intake_decision");
        precheck.run();
        SampleItem savedItem = graph.item();
        if (input.decision() == Decision.REJECTED) {
            var update = copy(graph.item());
            update.setRejected(true);
            update.setRejectReasonId(verifiedReason.id());
            update.setStatusId(status.getId());
            update.setSysUserId(actor.userId());
            savedItem = items.update(update);
        }
        graphDao.flush();
        var currentItem = savedItem;
        if (currentItem == null || !input.sampleItemId().equals(currentItem.getId())
                || currentItem.getLastupdated() == null) {
            throw conflict();
        }
        String savedVersion = time(currentItem.getLastupdated());
        String persistedId = savedRow.getId(), persistedAt = savedRow.getCreatedAt().toString();
        Runnable postcheck = () -> {
            var current = decisions.currentItem(input.sampleItemId());
            if (current != currentItem || !savedVersion.equals(time(current.getLastupdated()))) {
                throw conflict();
            }
            boolean reject = input.decision() == Decision.REJECTED;
            if (current.isRejected() != reject || current.isVoided()
                    || !Objects.equals(current.getRejectReasonId(), reject ? verifiedReason.id() : originalReason)
                    || !Objects.equals(current.getStatusId(), reject ? status.getId() : originalStatus)) {
                throw conflict();
            }
            var normalized = copy(current);
            // Only our three refusal fields and its version may differ from the pre-write
            // graph.
            normalized.setRejected(originalRejected);
            normalized.setRejectReasonId(originalReason);
            normalized.setStatusId(originalStatus);
            normalized.setLastupdated(Timestamp.from(SpecimenIntakeEvidence.time(evidence.itemVersion())));
            verifyGraph(graph, normalized, input, actor, request, permittedTests, frozenGraph);
            decisions.requireManaged(List.of(current, savedRow));
            validateReplay(savedRow, input, actor.userId());
            if (!persistedId.equals(savedRow.getId()) || !persistedAt.equals(savedRow.getCreatedAt().toString())) {
                throw conflict();
            }
            verifyMasters(managedMasters, frozenMasters, frozenAudit, type, tests, reason, category, status, input);
        };
        postcheck.run();
        register(postcheck);
        return result(savedRow, false);
    }

    private Graph lockGraph(SpecimenIntakeDecisionCommand input) {
        var sample = graphDao.lockOrder(input.sampleId());
        String domain = configuration.getPropertyValue("domain.human");
        if (sample == null || !input.sampleId().equals(sample.getId())
                || !input.labNo().equals(sample.getAccessionNumber()) || domain == null || domain.isBlank()
                || !domain.equals(sample.getDomain()) || sample.getReceivedTimestamp() == null
                || !List.of(input.patientId()).equals(graphDao.clinicalPatientIds(input.sampleId()))) {
            throw conflict();
        }
        var planned = graphDao.lockRequests(input.sampleId());
        var physical = graphDao.lockItems(input.sampleId());
        var analyses = graphDao.lockAnalyses(input.sampleId());
        if (planned == null || physical == null || analyses == null) {
            throw conflict();
        }
        var requestIds = new HashSet<Integer>();
        var itemIds = new HashSet<String>();
        var analysisIds = new HashSet<String>();
        for (var row : planned) {
            if (row == null || row.getId() == null || !requestIds.add(row.getId()) || row.getSample() == null
                    || !input.sampleId().equals(row.getSample().getId())) {
                throw conflict();
            }
        }
        for (var row : physical) {
            if (row == null || !itemIds.add(id(row.getId())) || row.getSample() == null
                    || !input.sampleId().equals(row.getSample().getId())) {
                throw conflict();
            }
        }
        for (var row : analyses) {
            if (row == null || !analysisIds.add(id(row.getId())) || row.getSampleItem() == null
                    || !itemIds.contains(row.getSampleItem().getId())) {
                throw conflict();
            }
        }
        var targetRequest = planned.stream().filter(r -> input.requestId().equals(r.getId().toString())).findFirst()
                .orElseThrow(SpecimenIntakeDecisionService::conflict);
        var target = physical.stream().filter(r -> input.sampleItemId().equals(r.getId())).findFirst()
                .orElseThrow(SpecimenIntakeDecisionService::conflict);
        if (targetRequest.getStatus() != SampleTypeRequest.Status.COLLECTED || targetRequest.getSampleItem() == null
                || !target.getId().equals(targetRequest.getSampleItem().getId())
                || targetRequest.getTypeOfSample() == null || target.getTypeOfSample() == null
                || !targetRequest.getTypeOfSample().getId().equals(target.getTypeOfSample().getId())
                || target.getParentSampleItem() != null
                || planned.stream()
                        .filter(r -> r.getSampleItem() != null && target.getId().equals(r.getSampleItem().getId()))
                        .count() != 1) {
            throw conflict();
        }
        var targetAnalyses = analyses.stream().filter(r -> target.getId().equals(r.getSampleItem().getId())).toList();
        return new Graph(sample, targetRequest, target, targetAnalyses,
                new SpecimenReceiptDAO.Membership(planned.stream().map(SampleTypeRequest::getId).toList(),
                        physical.stream().map(SampleItem::getId).toList(),
                        analyses.stream().map(Analysis::getId).toList()),
                domain);
    }

    private Set<String> targetTests(Graph graph) {
        var planned = new HashSet<String>();
        String csv = graph.planned().getRequestedTests();
        if (csv == null || csv.isBlank()) {
            throw conflict();
        }
        for (String value : csv.split(",", -1)) {
            if (!planned.add(id(value.trim()))) {
                throw conflict();
            }
        }
        var actual = new HashSet<String>();
        for (var analysis : graph.analyses()) {
            if (analysis.getTest() == null) {
                throw conflict();
            }
            actual.add(id(analysis.getTest().getId()));
        }
        if (actual.isEmpty() || !actual.containsAll(planned)) {
            throw conflict();
        }
        return actual;
    }

    private SpecimenIntakeEvidence evidence(Graph graph) {
        try {
            return new SpecimenIntakeEvidence(1, time(graph.sample().getLastupdated()),
                    time(graph.planned().getLastupdated()), time(graph.item().getLastupdated()),
                    graph.item().getTypeOfSample().getId(), time(graph.item().getCollectionDate()),
                    time(graph.item().getReceivedDate()),
                    graph.analyses().stream().map(a -> new SpecimenIntakeEvidence.Analysis(a.getId(),
                            a.getTest().getId(), time(a.getLastupdated()))).toList());
        } catch (IllegalArgumentException e) {
            throw conflict();
        }
    }

    private void requireNewState(Graph graph) {
        if (!Set.of("Test Entered", "Testing Started")
                .contains(Objects.toString(graphDao.statusName(graph.sample().getStatusId(), "ORDER"), ""))
                || !"SampleEntered".equals(graphDao.statusName(graph.item().getStatusId(), "SAMPLE"))
                || graph.item().isRejected() || graph.item().isVoided() || graph.item().getRejectReasonId() != null) {
            throw conflict();
        }
        for (var analysis : graph.analyses()) {
            if (!"Not Tested".equals(graphDao.statusName(analysis.getStatusId(), "ANALYSIS"))) {
                throw conflict();
            }
        }
    }

    private void verifyGraph(Graph graph, SampleItem projected, SpecimenIntakeDecisionCommand input,
            OrderEntryActorGuard.BoundActor actor, HttpServletRequest request, Set<String> tests, String frozen) {
        actors.requireUnchanged(request, actor);
        if (!graph.domain().equals(configuration.getPropertyValue("domain.human"))
                || !List.of(input.patientId()).equals(graphDao.clinicalPatientIds(input.sampleId()))
                || !graph.membership().equals(graphDao.currentMembership(input.sampleId()))
                || !frozen.equals(fingerprint(graph, projected))) {
            throw conflict();
        }
        var managed = new ArrayList<Object>(graph.analyses());
        managed.add(graph.sample());
        managed.add(graph.planned());
        decisions.requireManaged(managed);
        requirePermission(actor.userId(), tests);
    }

    private String fingerprint(Graph graph, SampleItem item) {
        // The shared checklist graph is intentionally smaller. A first-decision write
        // must
        // also preserve all mapped scalar tube fields that it does not own.
        return new ObjectMapper().createArrayNode()
                .add(QaChecklistFacts.graph(graph.sample(), List.of(graph.planned()), List.of(item), graph.analyses()))
                .add(item.getRejectReasonId()).add(item.getSampleItemId()).add(item.getSourceOfSampleId())
                .add(item.getSourceOther()).add(item.getExternalId()).add(item.getCollectionConditions())
                .add(item.getCollectionMethod()).add(item.getSampleTemperature()).add(item.getSpecimenOrigin())
                .add(Objects.toString(item.getFhirUuid(), null)).add(item.getVoidReason())
                .add(Objects.toString(item.getRemainingQuantity(), null)).toString();
    }

    private String masters(org.openelisglobal.typeofsample.valueholder.TypeOfSample type,
            List<org.openelisglobal.test.valueholder.Test> tests, Dictionary reason, DictionaryCategory category,
            StatusOfSample rejectedStatus, SpecimenIntakeDecisionCommand input) {
        if (!type.isActive()) {
            throw conflict();
        }
        var values = new ArrayList<String>();
        values.add(id(type.getId()) + ":" + time(type.getLastupdated()));
        for (var test : tests) {
            if (!test.isActive()) {
                throw conflict();
            }
            values.add(id(test.getId()) + ":" + time(test.getLastupdated()));
        }
        if (input.reason() != null) {
            if (reason == null || category == null || reason.getDictionaryCategory() != category
                    || !"resultRejectionReasons".equals(category.getCategoryName()) || !"Y".equals(reason.getIsActive())
                    || !input.reason().id().equals(reason.getId())
                    || !input.reason().version().equals(time(reason.getLastupdated()))
                    || !input.reason().label().equals(reason.getDictEntry())) {
                throw reasonUnavailable();
            }
            values.add(id(category.getId()) + ":" + time(category.getLastupdated()));
            values.add(reason.getId() + ":" + time(reason.getLastupdated()) + ":" + reason.getDictEntry());
            if (rejectedStatus == null || !"SAMPLE".equals(rejectedStatus.getStatusType())
                    || !"Sample Rejected".equals(rejectedStatus.getStatusOfSampleName())) {
                throw conflict();
            }
            values.add(id(rejectedStatus.getId()) + ":" + time(rejectedStatus.getLastupdated()));
        }
        return values.toString();
    }

    private void verifyMasters(List<?> managed, String expected, String auditExpected,
            org.openelisglobal.typeofsample.valueholder.TypeOfSample type,
            List<org.openelisglobal.test.valueholder.Test> tests, Dictionary reason, DictionaryCategory category,
            StatusOfSample status, SpecimenIntakeDecisionCommand input) {
        decisions.requireManaged(managed);
        if (!expected.equals(masters(type, tests, reason, category, status, input))
                || !auditExpected.equals(auditState(decisions.auditReferences()))) {
            throw conflict();
        }
    }

    private String auditState(List<ReferenceTables> rows) {
        if (rows == null || rows.size() != 2) {
            throw auditUnavailable();
        }
        var names = new HashSet<String>();
        var values = new ArrayList<String>();
        for (var row : rows) {
            String name = row == null || row.getTableName() == null ? ""
                    : row.getTableName().trim().toLowerCase(Locale.ROOT);
            if (!Set.of("sample_item", "specimen_intake_decision").contains(name) || !names.add(name)
                    || !"Y".equals(row.getKeepHistory())) {
                throw auditUnavailable();
            }
            values.add(id(row.getId()) + ":" + name + ":" + time(row.getLastupdated()) + ":" + row.getIsHl7Encoded());
        }
        values.sort(String::compareTo);
        return values.toString();
    }

    private void validateReplay(SpecimenIntakeDecision row, SpecimenIntakeDecisionCommand input, String actor) {
        try {
            row.validateRecord();
        } catch (RuntimeException e) {
            throw conflict();
        }
        if (row.getId() == null || !input.operationId().equals(row.getOperationId())
                || !input.sampleId().equals(row.getSampleId()) || !input.labNo().equals(row.getLabNo())
                || !input.patientId().equals(row.getPatientId()) || !input.requestId().equals(row.getRequestId())
                || !input.sampleItemId().equals(row.getSampleItemId()) || !actor.equals(row.getCreatedBy())
                || input.decision() != row.getDecision() || !Objects.equals(input.reason(), row.reason())
                || !input.expectedEvidenceDigest().equals(row.getEvidenceDigest())) {
            throw conflict();
        }
    }

    private void requirePermission(String actor, Set<String> tests) {
        var grants = users.getAllDisplayUserTestsByLabUnit(actor, Constants.ROLE_RECEPTION);
        var allowed = new HashSet<String>();
        if (grants != null) {
            grants.stream().filter(Objects::nonNull).forEach(value -> allowed.add(value.getId()));
        }
        if (tests.isEmpty() || !allowed.containsAll(tests)) {
            throw new AccessDeniedException("当前岗位没有该标本全部项目的验收权限。");
        }
    }

    private void register(Runnable check) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                check.run();
            }
        });
    }

    private static SampleItem copy(SampleItem item) {
        var copy = new SampleItem();
        BeanUtils.copyProperties(item, copy);
        return copy;
    }

    private static String time(Timestamp value) {
        if (value == null) {
            throw conflict();
        }
        return value.toInstant().toString();
    }

    private static String id(String value) {
        try {
            return SpecimenIntakeEvidence.requireId(value);
        } catch (IllegalArgumentException e) {
            throw conflict();
        }
    }

    private Result result(SpecimenIntakeDecision row, boolean replay) {
        return new Result(true, replay, row.getSampleId(), row.getLabNo(), row.getPatientId(), row.getRequestId(),
                row.getSampleItemId(), row.getOperationId(), row.getDecision().name(), row.reason(), row.getCreatedBy(),
                row.getCreatedAt().toString(), false);
    }

    public static EntrySubmissionException conflict() {
        return new EntrySubmissionException(409, "SPECIMEN_DECISION_CONFLICT", "标本或验收依据已变化，请重新查询并核对，不能覆盖已有验收记录。");
    }

    private static EntrySubmissionException reasonUnavailable() {
        return new EntrySubmissionException(409, "SPECIMEN_DECISION_REASON_UNAVAILABLE", "拒收原因已变化或不可用，请重新选择有效原因。");
    }

    private static EntrySubmissionException auditUnavailable() {
        return new EntrySubmissionException(409, "SPECIMEN_DECISION_AUDIT_UNAVAILABLE", "标本验收审计配置未就绪，暂不能保存。");
    }
}
