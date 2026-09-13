package org.openelisglobal.sample.service;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SpecimenReceiptCommand;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.BeanUtils;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Writes only physical receipt time through the existing audited specimen
 * service.
 */
@Service
public class SpecimenReceiptService {
    private final SpecimenReceiptDAO dao;
    private final OrderEntryActorGuard actors;
    private final SampleItemService items;
    private final UserService users;
    private final ReferenceTablesService references;
    private final DefaultConfigurationProperties configuration;

    public SpecimenReceiptService(SpecimenReceiptDAO dao, OrderEntryActorGuard actors, SampleItemService items,
            UserService users, ReferenceTablesService references, DefaultConfigurationProperties configuration) {
        this.dao = dao;
        this.actors = actors;
        this.items = items;
        this.users = users;
        this.references = references;
        this.configuration = configuration;
    }

    public record TubeReceipt(String requestId, String sampleItemId, String collectionDate, String receivedDate,
            boolean replayed) {
    }

    public record Result(boolean success, String sampleId, String labNo, String patientId, List<TubeReceipt> tubes) {
    }

    private record Pending(SpecimenReceiptCommand.Tube command, SampleItem baseline) {
    }

    @Transactional(rollbackFor = Exception.class, timeout = 45)
    public Result receive(JsonNode body, HttpServletRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw conflict();
        }
        dao.requireCleanContext();
        var actor = actors.bind(request);
        var input = SpecimenReceiptCommand.fromJson(body);
        var sample = dao.lockOrder(input.sampleId());
        String domain = configuration.getPropertyValue("domain.human");
        if (sample == null || !input.sampleId().equals(sample.getId())
                || !input.labNo().equals(sample.getAccessionNumber()) || domain == null || domain.isBlank()
                || !domain.equals(sample.getDomain()) || sample.getReceivedTimestamp() == null) {
            throw conflict();
        }
        String orderState = dao.statusName(sample.getStatusId(), "ORDER");
        if (!"Test Entered".equals(orderState) && !"Testing Started".equals(orderState)) {
            throw conflict();
        }
        if (!List.of(input.patientId()).equals(dao.clinicalPatientIds(input.sampleId()))) {
            throw conflict();
        }

        Map<String, SampleTypeRequest> requests = new HashMap<>();
        Set<String> linkedItems = new HashSet<>();
        var requestRows = dao.lockRequests(input.sampleId());
        var itemRows = dao.lockItems(input.sampleId());
        var analyses = dao.lockAnalyses(input.sampleId());
        if (requestRows == null || itemRows == null || analyses == null) {
            throw conflict();
        }
        for (var row : requestRows) {
            if (row == null || row.getId() == null || row.getSample() == null
                    || !input.sampleId().equals(row.getSample().getId())
                    || requests.putIfAbsent(row.getId().toString(), row) != null
                    || (row.getSampleItem() != null && !linkedItems.add(row.getSampleItem().getId()))) {
                throw conflict();
            }
        }
        Map<String, SampleItem> physical = new HashMap<>();
        for (var row : itemRows) {
            if (row == null || row.getId() == null || row.getSample() == null
                    || !input.sampleId().equals(row.getSample().getId())
                    || physical.putIfAbsent(row.getId(), row) != null) {
                throw conflict();
            }
        }
        List<Pending> pending = new ArrayList<>();
        Set<String> permissionTests = new HashSet<>();
        Instant now = Instant.now();
        for (var tube : input.tubes()) {
            var planned = requests.get(tube.requestId());
            var item = physical.get(tube.sampleItemId());
            if (planned == null || item == null || planned.getStatus() != SampleTypeRequest.Status.COLLECTED
                    || planned.getSampleItem() == null || !item.getId().equals(planned.getSampleItem().getId())
                    || planned.getTypeOfSample() == null || item.getTypeOfSample() == null
                    || !item.getTypeOfSample().getId().equals(planned.getTypeOfSample().getId())
                    || item.getParentSampleItem() != null || item.isVoided() || item.isRejected()
                    || !"SampleEntered".equals(dao.statusName(item.getStatusId(), "SAMPLE"))
                    || item.getCollectionDate() == null
                    || !tube.collectionDate().equals(item.getCollectionDate().toInstant())
                    || tube.receivedDate().isAfter(now)) {
                throw conflict();
            }
            if (item.getReceivedDate() == null
                    && (item.getLastupdated() == null || !item.getTypeOfSample().isActive())) {
                throw conflict();
            }
            Set<String> actualTests = new HashSet<>(), analysisIds = new HashSet<>();
            for (var analysis : analyses) {
                if (analysis == null || analysis.getId() == null || analysis.getSampleItem() == null) {
                    throw conflict();
                }
                if (!item.getId().equals(analysis.getSampleItem().getId())) {
                    continue;
                }
                if (!analysisIds.add(analysis.getId()) || analysis.getTest() == null
                        || analysis.getTest().getId() == null
                        || !"Not Tested".equals(dao.statusName(analysis.getStatusId(), "ANALYSIS"))
                        || (item.getReceivedDate() == null && !analysis.getTest().isActive())) {
                    throw conflict();
                }
                actualTests.add(analysis.getTest().getId());
            }
            Set<String> plannedTests = testIds(planned.getRequestedTests());
            if (actualTests.isEmpty() || !actualTests.containsAll(plannedTests)) {
                throw conflict();
            }
            permissionTests.addAll(actualTests);
            permissionTests.addAll(plannedTests);
            if (item.getReceivedDate() != null && !tube.receivedDate().equals(item.getReceivedDate().toInstant())) {
                throw new EntrySubmissionException(409, "SPECIMEN_ALREADY_RECEIVED", "该标本已有签收记录，请核对原记录，不可覆盖签收时间。");
            }
            pending.add(new Pending(tube, item));
        }
        requirePermission(actor.userId(), permissionTests);
        var audit = references.getReferenceTableByName("SAMPLE_ITEM");
        if (audit == null || !"Y".equals(audit.getKeepHistory())) {
            throw new EntrySubmissionException(409, "SPECIMEN_RECEIPT_AUDIT_UNAVAILABLE", "标本审计配置未就绪，暂不能签收。");
        }
        Set<String> commitTests = Set.copyOf(permissionTests);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                requirePermission(actor.userId(), commitTests);
            }
        });
        List<TubeReceipt> result = new ArrayList<>();
        for (var row : pending) {
            var item = row.baseline();
            boolean replayed = item.getReceivedDate() != null;
            if (!replayed) {
                var updated = new SampleItem();
                // Never mutate the managed baseline: the existing audit needs its old receipt
                // value.
                BeanUtils.copyProperties(item, updated);
                updated.setReceivedDate(Timestamp.from(row.command().receivedDate()));
                updated.setSysUserId(actor.userId());
                var saved = items.update(updated);
                if (saved == null || !item.getId().equals(saved.getId()) || saved.getReceivedDate() == null
                        || !row.command().receivedDate().equals(saved.getReceivedDate().toInstant())) {
                    throw conflict();
                }
            }
            result.add(new TubeReceipt(row.command().requestId(), item.getId(),
                    row.command().collectionDate().toString(), row.command().receivedDate().toString(), replayed));
        }
        dao.flush();
        actors.requireUnchanged(request, actor);
        requirePermission(actor.userId(), permissionTests);
        return new Result(true, input.sampleId(), input.labNo(), input.patientId(), List.copyOf(result));
    }

    private Set<String> testIds(String csv) {
        Set<String> result = new HashSet<>();
        if (csv == null || csv.isBlank()) {
            throw conflict();
        }
        for (String part : csv.split(",", -1)) {
            String id = part.trim();
            if (!id.matches("[1-9][0-9]*") || !result.add(id)) {
                throw conflict();
            }
        }
        return result;
    }

    private void requirePermission(String actorId, Set<String> tests) {
        Set<String> allowed = new HashSet<>();
        var grants = users.getAllDisplayUserTestsByLabUnit(actorId, Constants.ROLE_RECEPTION);
        if (grants != null) {
            grants.stream().filter(java.util.Objects::nonNull).forEach(test -> allowed.add(test.getId()));
        }
        if (tests.isEmpty() || !allowed.containsAll(tests)) {
            throw new AccessDeniedException("当前标本登记权限不足，请重新核对权限后签收。");
        }
    }

    private static EntrySubmissionException conflict() {
        return new EntrySubmissionException(409, "SPECIMEN_RECEIPT_STATE_CHANGED", "申请或标本状态已变化，请重新核对已采集标本后签收。");
    }
}
