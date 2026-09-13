package org.openelisglobal.qachecklist.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.service.OrderEntryActorGuard;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Guards the existing whole-application checklist; never certifies an
 * individual tube.
 */
@Service
public class QaChecklistWriteGuard {
    private final SpecimenReceiptDAO specimens;
    private final OrderEntryActorGuard actors;
    private final UserService users;
    private final DefaultConfigurationProperties configuration;

    public QaChecklistWriteGuard(SpecimenReceiptDAO specimens, OrderEntryActorGuard actors, UserService users,
            DefaultConfigurationProperties configuration) {
        this.specimens = specimens;
        this.actors = actors;
        this.users = users;
        this.configuration = configuration;
    }

    public record Preflight(Integer sampleId, OrderEntryActorGuard.BoundActor actor,
            jakarta.servlet.http.HttpServletRequest request) {
    }

    public static void requireRequestContext(jakarta.servlet.http.HttpServletRequest actual) {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)
                || actual == null || actual.getSession(false) == null
                || actual.getSession(false) != attributes.getRequest().getSession(false)) {
            throw new AccessDeniedException("验收请求与当前登录会话不一致，请重新登录。");
        }
    }

    public Preflight begin(Integer sampleId, Integer userId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw conflict();
        }
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            throw new AccessDeniedException("请重新登录后进行标本验收。");
        }
        specimens.requireCleanContext();
        var request = attributes.getRequest();
        var actor = actors.bind(request);
        if ((sampleId != null && sampleId <= 0) || userId == null || !actor.userId().equals(userId.toString())) {
            throw new AccessDeniedException("验收操作者与当前登录身份不一致，请重新登录。");
        }
        return new Preflight(sampleId, actor, request);
    }

    public Runnable verify(Preflight preflight, boolean complete) {
        var request = preflight.request();
        var actor = preflight.actor();
        actors.requireUnchanged(request, actor);
        String id = preflight.sampleId().toString();
        var sample = specimens.lockOrder(id);
        var patients = specimens.clinicalPatientIds(id);
        var domain = configuration.getPropertyValue("domain.human");
        if (sample == null || !id.equals(sample.getId()) || sample.getAccessionNumber() == null
                || !sample.getAccessionNumber().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,24}") || domain == null
                || domain.isBlank() || !domain.equals(sample.getDomain()) || sample.getReceivedTimestamp() == null
                || patients == null || patients.size() != 1 || !positive(patients.get(0))) {
            throw conflict();
        }
        var requests = specimens.lockRequests(id);
        var items = specimens.lockItems(id);
        var analyses = specimens.lockAnalyses(id);
        if (requests == null || requests.isEmpty() || items == null || analyses == null) {
            throw conflict();
        }
        String originalLab = sample.getAccessionNumber();
        Instant originalRegistration = sample.getReceivedTimestamp().toInstant();
        List<String> originalPatients = List.copyOf(patients);
        var membership = new SpecimenReceiptDAO.Membership(requests.stream().map(SampleTypeRequest::getId).toList(),
                items.stream().map(SampleItem::getId).toList(), analyses.stream().map(row -> row.getId()).toList());
        // Keep the already locked graph. Do not refresh/clear a dirty persistence
        // context after the checklist write has started.
        Runnable recheck = () -> {
            actors.requireUnchanged(request, actor);
            if (!id.equals(sample.getId()) || !originalLab.equals(sample.getAccessionNumber())
                    || !domain.equals(sample.getDomain()) || sample.getReceivedTimestamp() == null
                    || !originalRegistration.equals(sample.getReceivedTimestamp().toInstant())
                    || !originalPatients.equals(specimens.clinicalPatientIds(id))
                    || !membership.equals(specimens.currentMembership(id))) {
                throw conflict();
            }
            String state = specimens.statusName(sample.getStatusId(), "ORDER");
            if (!"Test Entered".equals(state) && !"Testing Started".equals(state)) {
                throw conflict();
            }
            Set<String> permissionTests = new HashSet<>();
            Set<Integer> requestIds = new HashSet<>();
            Set<String> linkedItems = new HashSet<>();
            var physical = new HashMap<String, SampleItem>();
            for (var item : items) {
                if (item == null || !positive(item.getId()) || item.getSample() == null
                        || !id.equals(item.getSample().getId()) || physical.putIfAbsent(item.getId(), item) != null
                        || item.isVoided() || item.isRejected() || item.getParentSampleItem() != null) {
                    throw conflict();
                }
            }
            int active = 0;
            for (var planned : requests) {
                if (planned == null || planned.getId() == null || planned.getId() <= 0
                        || !requestIds.add(planned.getId()) || planned.getSample() == null
                        || !id.equals(planned.getSample().getId())) {
                    throw conflict();
                }
                if (planned.getStatus() == SampleTypeRequest.Status.CANCELLED) {
                    if (planned.getSampleItem() != null) {
                        throw conflict();
                    }
                    continue;
                }
                active++;
                if (planned.getTypeOfSample() == null || !positive(planned.getTypeOfSample().getId())
                        || !planned.getTypeOfSample().isActive()) {
                    throw conflict();
                }
                Set<String> requestedTests = testIds(planned.getRequestedTests());
                permissionTests.addAll(requestedTests);
                if (planned.getStatus() == SampleTypeRequest.Status.REQUESTED) {
                    if (planned.getSampleItem() != null || complete) {
                        throw rejected("QA_COLLECTION_REQUIRED", "collectionRequired", "collect");
                    }
                    continue;
                }
                if (planned.getStatus() != SampleTypeRequest.Status.COLLECTED || planned.getSampleItem() == null) {
                    throw conflict();
                }
                var item = physical.get(planned.getSampleItem().getId());
                if (item == null || !linkedItems.add(item.getId()) || item.getTypeOfSample() == null
                        || !planned.getTypeOfSample().getId().equals(item.getTypeOfSample().getId())
                        || !item.getTypeOfSample().isActive() || item.getLastupdated() == null
                        || !"SampleEntered".equals(specimens.statusName(item.getStatusId(), "SAMPLE"))
                        || item.getCollectionDate() == null
                        || !item.getCollectionDate().toInstant().isAfter(Instant.EPOCH)
                        || item.getCollectionDate().toInstant().isAfter(Instant.now())) {
                    throw conflict();
                }
                if (item.getReceivedDate() == null) {
                    if (complete) {
                        throw rejected("QA_RECEIPT_REQUIRED", "receiptRequired", "collect");
                    }
                } else if (item.getReceivedDate().before(item.getCollectionDate())
                        || item.getReceivedDate().toInstant().isAfter(Instant.now())) {
                    throw conflict();
                }
                Set<String> actualTests = new HashSet<>();
                Set<String> analysisIds = new HashSet<>();
                for (var analysis : analyses) {
                    if (analysis == null || !positive(analysis.getId()) || analysis.getSampleItem() == null
                            || !physical.containsKey(analysis.getSampleItem().getId())) {
                        throw conflict();
                    }
                    if (!item.getId().equals(analysis.getSampleItem().getId())) {
                        continue;
                    }
                    if (!analysisIds.add(analysis.getId()) || analysis.getTest() == null
                            || !positive(analysis.getTest().getId()) || !analysis.getTest().isActive()
                            || !"Not Tested".equals(specimens.statusName(analysis.getStatusId(), "ANALYSIS"))) {
                        throw conflict();
                    }
                    actualTests.add(analysis.getTest().getId());
                }
                if (actualTests.isEmpty() || !actualTests.containsAll(requestedTests)) {
                    throw conflict();
                }
                permissionTests.addAll(actualTests);
            }
            if (active == 0 || !linkedItems.equals(physical.keySet())) {
                throw conflict();
            }
            requirePermission(actor.userId(), permissionTests);
        };
        recheck.run();
        return recheck;
    }

    private void requirePermission(String userId, Set<String> tests) {
        Set<String> permitted = new HashSet<>();
        var grants = users.getAllDisplayUserTestsByLabUnit(userId, Constants.ROLE_RECEPTION);
        if (grants != null) {
            grants.stream().filter(java.util.Objects::nonNull).forEach(test -> permitted.add(test.getId()));
        }
        if (tests.isEmpty() || !permitted.containsAll(tests)) {
            throw new AccessDeniedException("当前岗位没有本申请全部检验项目的标本验收权限。");
        }
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]*") && value.length() <= 10
                && Long.parseLong(value) <= Integer.MAX_VALUE;
    }

    private static Set<String> testIds(String csv) {
        Set<String> ids = new HashSet<>();
        if (csv == null || csv.isBlank()) {
            throw conflict();
        }
        for (String value : csv.split(",", -1)) {
            if (!positive(value.trim()) || !ids.add(value.trim())) {
                throw conflict();
            }
        }
        return ids;
    }

    private static QaChecklistValidationException conflict() {
        return rejected("QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
    }

    private static QaChecklistValidationException rejected(String code, String key, String step) {
        return new QaChecklistValidationException(409, code, "qa.checklist." + key, step);
    }
}
