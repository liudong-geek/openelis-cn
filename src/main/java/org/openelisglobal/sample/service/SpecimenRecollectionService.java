package org.openelisglobal.sample.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.dao.SpecimenRecollectionDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.form.SpecimenRecollectionCommand;
import org.openelisglobal.sample.form.SpecimenRecollectionReceipt;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Creates one new uncollected request from one explicitly rejected tube. */
@Service
public class SpecimenRecollectionService {
    private final SpecimenReceiptDAO graph;
    private final SpecimenRecollectionDAO recollections;
    private final OrderEntryActorGuard actors;
    private final UserService users;
    private final AuditTrailService audit;
    private final DefaultConfigurationProperties configuration;
    private final Clock clock;

    public SpecimenRecollectionService(SpecimenReceiptDAO graph, SpecimenRecollectionDAO recollections,
            OrderEntryActorGuard actors, UserService users, AuditTrailService audit,
            DefaultConfigurationProperties configuration) {
        this(graph, recollections, actors, users, audit, configuration, Clock.systemUTC());
    }

    SpecimenRecollectionService(SpecimenReceiptDAO graph, SpecimenRecollectionDAO recollections,
            OrderEntryActorGuard actors, UserService users, AuditTrailService audit,
            DefaultConfigurationProperties configuration, Clock clock) {
        this.graph = graph;
        this.recollections = recollections;
        this.actors = actors;
        this.users = users;
        this.audit = audit;
        this.configuration = configuration;
        this.clock = clock;
    }

    private record Source(Sample sample, SampleTypeRequest request, SampleItem item, SpecimenIntakeDecision decision,
            List<SampleTypeRequest> requests, List<Analysis> analyses, Set<String> tests) {
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.SERIALIZABLE, timeout = 45)
    public ObjectNode create(JsonNode body, HttpServletRequest request) {
        requireWriteTransaction();
        graph.requireCleanContext();
        var actor = actors.bind(request);
        var input = SpecimenRecollectionCommand.parse(body);
        var claims = recollections.lockClaims(input.operationId(), input.sourceSampleItemId());
        if (claims == null || claims.size() > 1)
            throw conflict();
        if (!claims.isEmpty()) {
            var existing = claims.get(0);
            validateReplay(existing, input, actor.userId());
            requirePermission(actor.userId(), receiptTests(existing));
            actors.requireUnchanged(request, actor);
            return replay(existing);
        }

        Source source = source(input);
        requirePermission(actor.userId(), source.tests());
        var auditRows = recollections.lockAuditReferences();
        String frozenAudit = auditState(auditRows);
        int sortOrder = source.requests().stream().map(SampleTypeRequest::getSortOrder).filter(Objects::nonNull)
                .max(Integer::compareTo).orElse(0) + 1;
        if (sortOrder < 1 || sortOrder > 99999)
            throw conflict();

        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        var replacement = copyRequest(source.request(), source.sample(), sortOrder, actor.userId(), now);
        if (recollections.insertRequest(replacement) != replacement)
            throw conflict();
        recollections.flush();
        if (replacement.getId() == null || replacement.getLastupdated() == null)
            throw conflict();

        ObjectNode receipt = SpecimenRecollectionReceipt.create(input, replacement, actor.userId(), now);
        var row = SpecimenRecollection.record(input.operationId(), input.sampleId(), input.labNo(), input.patientId(),
                input.sourceRequestId(), input.sourceSampleItemId(), source.decision().getId(),
                replacement.getId().toString(), actor.userId(), input.expectedEvidenceDigest(), receipt.toString(),
                Clock.fixed(now, ZoneOffset.UTC));
        row.setLastupdated(Timestamp.from(now));
        if (recollections.insert(row) != row)
            throw conflict();
        audit.saveNewHistory(replacement, actor.userId(), "sample_type_request");
        audit.saveNewHistory(row, actor.userId(), "specimen_recollection");
        recollections.flush();
        if (row.getId() == null)
            throw conflict();

        Runnable verify = () -> {
            actors.requireUnchanged(request, actor);
            recollections.requireManaged(
                    List.of(source.sample(), source.request(), source.item(), source.decision(), replacement, row));
            validateSource(source, input);
            validateReplay(row, input, actor.userId());
            if (replacement.getStatus() != SampleTypeRequest.Status.REQUESTED || replacement.getSampleItem() != null
                    || replacement.getId() == null || !replacement.getId().toString().equals(row.getRequestId())
                    || !frozenAudit.equals(auditState(recollections.auditReferences())))
                throw conflict();
            requirePermission(actor.userId(), source.tests());
        };
        verify.run();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                verify.run();
            }
        });
        return receipt;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 30)
    public ObjectNode recover(String operationId, HttpServletRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw conflict();
        }
        String operation = uuid(operationId);
        var actor = actors.bind(request);
        var row = recollections.findOperation(operation);
        if (row == null)
            throw notFound();
        try {
            row.validateRecord();
        } catch (RuntimeException invalid) {
            throw conflict();
        }
        if (!actor.userId().equals(row.getCreatedBy()))
            throw new AccessDeniedException("重采记录属于其他操作人。");
        requirePermission(actor.userId(), receiptTests(row));
        actors.requireUnchanged(request, actor);
        return replay(row);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 30)
    public ObjectNode recoverSource(String sampleId, String sourceSampleItemId, HttpServletRequest request) {
        requireReadTransaction();
        String sample = id(sampleId), source = id(sourceSampleItemId);
        var actor = actors.bind(request);
        var rows = recollections.findForSources(List.of(source));
        if (rows == null || rows.size() > 1)
            throw conflict();
        if (rows.isEmpty())
            throw notFound();
        var row = rows.get(0);
        try {
            row.validateRecord();
        } catch (RuntimeException invalid) {
            throw conflict();
        }
        if (!sample.equals(row.getSampleId()) || !source.equals(row.getSourceSampleItemId()))
            throw conflict();
        requirePermission(actor.userId(), receiptTests(row));
        actors.requireUnchanged(request, actor);
        return replay(row);
    }

    private Source source(SpecimenRecollectionCommand input) {
        Sample sample = graph.lockOrder(input.sampleId());
        var requests = graph.lockRequests(input.sampleId());
        var items = graph.lockItems(input.sampleId());
        var analyses = graph.lockAnalyses(input.sampleId());
        var decision = recollections.lockDecision(input.sourceDecisionOperationId());
        String domain = configuration.getPropertyValue("domain.human");
        if (sample == null || requests == null || items == null || analyses == null || decision == null
                || !input.labNo().equals(sample.getAccessionNumber()) || domain == null || domain.isBlank()
                || !domain.equals(sample.getDomain()) || sample.getReceivedTimestamp() == null
                || !List.of(input.patientId()).equals(graph.clinicalPatientIds(input.sampleId())))
            throw conflict();
        var sourceRequest = requests.stream()
                .filter(value -> value != null && value.getId() != null
                        && input.sourceRequestId().equals(value.getId().toString()))
                .findFirst().orElseThrow(SpecimenRecollectionService::conflict);
        var sourceItem = items.stream()
                .filter(value -> value != null && input.sourceSampleItemId().equals(value.getId())).findFirst()
                .orElseThrow(SpecimenRecollectionService::conflict);
        Set<String> tests = tests(sourceRequest, analyses, sourceItem);
        var result = new Source(sample, sourceRequest, sourceItem, decision, List.copyOf(requests),
                List.copyOf(analyses), tests);
        validateSource(result, input);
        return result;
    }

    private void validateSource(Source source, SpecimenRecollectionCommand input) {
        var request = source.request();
        var item = source.item();
        var decision = source.decision();
        try {
            decision.validateRecord();
        } catch (RuntimeException invalid) {
            throw conflict();
        }
        if (!input.sampleId().equals(source.sample().getId()) || request.getSample() != source.sample()
                || request.getStatus() != SampleTypeRequest.Status.COLLECTED || request.getSampleItem() != item
                || item.getSample() != source.sample() || item.getTypeOfSample() == null
                || request.getTypeOfSample() == null || item.getTypeOfSample() != request.getTypeOfSample()
                || item.isVoided() || !item.isRejected()
                || decision.getDecision() != SpecimenIntakeDecision.Decision.REJECTED || decision.getId() == null
                || !input.sourceDecisionOperationId().equals(decision.getOperationId())
                || !input.sampleId().equals(decision.getSampleId()) || !input.labNo().equals(decision.getLabNo())
                || !input.patientId().equals(decision.getPatientId())
                || !input.sourceRequestId().equals(decision.getRequestId())
                || !input.sourceSampleItemId().equals(decision.getSampleItemId())
                || !input.expectedEvidenceDigest().equals(decision.getEvidenceDigest()) || decision.reason() == null
                || !Objects.equals(item.getRejectReasonId(), decision.reason().id())) {
            throw conflict();
        }
    }

    private Set<String> tests(SampleTypeRequest request, List<Analysis> analyses, SampleItem item) {
        Set<String> requested = new HashSet<>(SpecimenRecollectionReceipt.ids(request.getRequestedTests(), false));
        Set<String> actual = new HashSet<>();
        for (Analysis analysis : analyses) {
            if (analysis != null && analysis.getSampleItem() == item && analysis.getTest() != null) {
                actual.add(SpecimenIntakeEvidence.requireId(analysis.getTest().getId()));
            }
        }
        if (requested.isEmpty() || !actual.containsAll(requested))
            throw conflict();
        return Set.copyOf(requested);
    }

    private SampleTypeRequest copyRequest(SampleTypeRequest source, Sample sample, int sortOrder, String actor,
            Instant now) {
        var value = new SampleTypeRequest();
        value.setSample(sample);
        value.setTypeOfSample(source.getTypeOfSample());
        value.setSortOrder(sortOrder);
        value.setRequestedQuantity(source.getRequestedQuantity());
        value.setUnitOfMeasure(source.getUnitOfMeasure());
        value.setRequestedTests(source.getRequestedTests());
        value.setRequestedPanels(source.getRequestedPanels());
        value.setStatus(SampleTypeRequest.Status.REQUESTED);
        value.setSampleItem(null);
        value.setCreatedDate(Timestamp.from(now));
        value.setLastupdated(Timestamp.from(now));
        value.setSysUserId(actor);
        return value;
    }

    private void validateReplay(SpecimenRecollection row, SpecimenRecollectionCommand input, String actor) {
        try {
            row.validateRecord();
            var receipt = SpecimenRecollectionReceipt.read(row);
            if (!input.sourceDecisionOperationId().equals(receipt.path("sourceDecisionOperationId").asText()))
                throw conflict();
        } catch (RuntimeException invalid) {
            throw conflict();
        }
        if (!input.operationId().equals(row.getOperationId()) || !input.sampleId().equals(row.getSampleId())
                || !input.labNo().equals(row.getLabNo()) || !input.patientId().equals(row.getPatientId())
                || !input.sourceRequestId().equals(row.getSourceRequestId())
                || !input.sourceSampleItemId().equals(row.getSourceSampleItemId())
                || !input.expectedEvidenceDigest().equals(row.getEvidenceDigest())
                || !actor.equals(row.getCreatedBy())) {
            throw conflict();
        }
    }

    private Set<String> receiptTests(SpecimenRecollection row) {
        var receipt = SpecimenRecollectionReceipt.read(row);
        var tests = new HashSet<String>();
        receipt.path("request").path("testIds")
                .forEach(value -> tests.add(SpecimenIntakeEvidence.requireId(value.asText())));
        if (tests.isEmpty())
            throw conflict();
        return tests;
    }

    private ObjectNode replay(SpecimenRecollection row) {
        return SpecimenRecollectionReceipt.read(row).deepCopy().put("replayed", true);
    }

    private void requirePermission(String actor, Set<String> tests) {
        var grants = users.getAllDisplayUserTestsByLabUnit(actor, Constants.ROLE_RECEPTION);
        var allowed = new HashSet<String>();
        if (grants != null)
            grants.stream().filter(Objects::nonNull).forEach(value -> allowed.add(value.getId()));
        if (tests.isEmpty() || !allowed.containsAll(tests)) {
            throw new AccessDeniedException("当前岗位没有该标本全部项目的重采权限。");
        }
    }

    private String auditState(List<ReferenceTables> rows) {
        if (rows == null || rows.size() != 2)
            throw auditUnavailable();
        var names = new HashSet<String>();
        var values = new ArrayList<String>();
        for (ReferenceTables row : rows) {
            String name = row == null || row.getTableName() == null ? ""
                    : row.getTableName().trim().toLowerCase(Locale.ROOT);
            if (!Set.of("sample_type_request", "specimen_recollection").contains(name) || !names.add(name)
                    || !"Y".equals(row.getKeepHistory()))
                throw auditUnavailable();
            values.add(row.getId() + ":" + name + ":" + row.getLastupdated() + ":" + row.getIsHl7Encoded());
        }
        values.sort(String::compareTo);
        return values.toString();
    }

    private void requireWriteTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel()))
            throw conflict();
    }

    private void requireReadTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel()))
            throw conflict();
    }

    private static String id(String value) {
        try {
            return SpecimenIntakeEvidence.requireId(value);
        } catch (IllegalArgumentException invalid) {
            throw new EntrySubmissionException(400, "RECOLLECTION_INVALID", "重采标本标识无效，请重新核对。");
        }
    }

    private static String uuid(String value) {
        try {
            if (value == null || !value.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                    || !java.util.UUID.fromString(value).toString().equals(value))
                throw new IllegalArgumentException();
            return value;
        } catch (IllegalArgumentException invalid) {
            throw new EntrySubmissionException(400, "RECOLLECTION_INVALID", "重采操作标识无效，请重新核对。");
        }
    }

    public static EntrySubmissionException conflict() {
        return new EntrySubmissionException(409, "RECOLLECTION_CONFLICT", "标本拒收事实或申请内容已变化，请重新查询后核对，不能重复创建重采申请。");
    }

    private static EntrySubmissionException notFound() {
        return new EntrySubmissionException(404, "RECOLLECTION_NOT_FOUND", "未找到这次重采保存记录，请返回申请后重新核对。");
    }

    private static EntrySubmissionException auditUnavailable() {
        return new EntrySubmissionException(409, "RECOLLECTION_AUDIT_UNAVAILABLE", "重采审计配置未就绪，暂不能保存。");
    }
}
