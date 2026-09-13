package org.openelisglobal.qachecklist.service;

import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.openelisglobal.common.dao.BaseDAO;
import org.openelisglobal.common.service.BaseObjectServiceImpl;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO.Prerequisites;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO;
import org.openelisglobal.qachecklist.dao.SampleQaChecklistDAO;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SampleQaChecklistServiceImpl extends BaseObjectServiceImpl<SampleQaChecklist, Integer>
        implements SampleQaChecklistService {

    @Autowired
    private SampleQaChecklistDAO sampleQaChecklistDAO;

    @Autowired
    private DictionaryService dictionaryService;

    @Autowired
    private QaChecklistWriteGuard writeGuard;

    @Autowired
    private org.openelisglobal.sample.service.SampleService sampleService;

    @Autowired
    private QaChecklistPrerequisiteDAO qaChecklistPrerequisiteDAO;

    public SampleQaChecklistServiceImpl() {
        super(SampleQaChecklist.class);
    }

    @Override
    protected BaseDAO<SampleQaChecklist, Integer> getBaseObjectDAO() {
        return sampleQaChecklistDAO;
    }

    @Override
    @Transactional(readOnly = true)
    public SampleQaChecklist findBySampleId(Integer sampleId) {
        return sampleQaChecklistDAO.findBySampleId(sampleId);
    }

    @Override
    @Transactional(readOnly = true)
    public SampleQaChecklist findBySampleId(String sampleId) {
        return sampleQaChecklistDAO.findBySampleId(sampleId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Dictionary> getActiveChecklistItems() {
        // Get all dictionary entries for the QAChecklistItem category
        List<Dictionary> allItems = dictionaryService
                .getDictionaryEntrysByCategoryNameLocalizedSort(QA_CHECKLIST_CATEGORY_NAME);

        if (allItems == null) {
            return List.of();
        }
        if (allItems.stream().anyMatch(java.util.Objects::isNull)) {
            throw rejected(409, "QA_CONFIGURATION_INVALID", "configurationInvalid", null);
        }

        // Filter to only active items and sort by sort_order
        return allItems.stream().filter(d -> "Y".equals(d.getIsActive())).sorted((a, b) -> {
            Integer orderA = a.getSortOrder() != null ? a.getSortOrder() : 999;
            Integer orderB = b.getSortOrder() != null ? b.getSortOrder() : 999;
            return orderA.compareTo(orderB);
        }).collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class, timeout = 45)
    public SampleQaChecklist saveOrUpdateChecklist(Integer sampleId, Map<String, Boolean> verifiedItems,
            Integer userId) {
        if (userId == null || userId <= 0) {
            throw rejected(401, "QA_AUTH_REQUIRED", "authRequired", null);
        }
        if (sampleId == null || sampleId <= 0) {
            throw rejected(400, "QA_SAMPLE_ID_INVALID", "sampleIdInvalid", null);
        }
        validateItemTypes(verifiedItems);
        var preflight = writeGuard.begin(sampleId, userId);
        return savePreparedChecklist(sampleId, verifiedItems, userId, preflight);
    }

    @Override
    @Transactional(rollbackFor = Exception.class, timeout = 45)
    public SampleQaChecklist saveFromRequest(Integer sampleId, String labNumber, Map<String, Boolean> verifiedItems,
            Integer userId, jakarta.servlet.http.HttpServletRequest request) {
        QaChecklistWriteGuard.requireRequestContext(request);
        validateItemTypes(verifiedItems);
        var initial = writeGuard.begin(sampleId, userId);
        if (sampleId == null && labNumber == null) {
            throw rejected(400, "QA_IDENTIFIER_REQUIRED", "identifierRequired", null);
        }
        if (sampleId != null && sampleService.getMatch("id", sampleId.toString()).isEmpty()) {
            throw rejected(404, "QA_SAMPLE_NOT_FOUND", "sampleNotFound", null);
        }
        Integer resolved = sampleId;
        if (labNumber != null) {
            if (labNumber.isBlank() || !labNumber.equals(labNumber.trim())) {
                throw rejected(400, "QA_LAB_NUMBER_INVALID", "labNumberInvalid", null);
            }
            var sample = sampleService.getSampleByAccessionNumber(labNumber);
            if (sample == null) {
                throw rejected(404, "QA_SAMPLE_NOT_FOUND", "sampleNotFound", null);
            }
            try {
                resolved = Integer.valueOf(sample.getId());
                if (resolved <= 0) {
                    throw new NumberFormatException();
                }
            } catch (RuntimeException e) {
                throw rejected(409, "QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
            }
            if (sampleId != null && !sampleId.equals(resolved)) {
                throw rejected(409, "QA_IDENTIFIER_MISMATCH", "identifierMismatch", null);
            }
        }
        QaChecklistWriteGuard.requireRequestContext(request);
        org.springframework.transaction.support.TransactionSynchronizationManager
                .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void beforeCommit(boolean readOnly) {
                        QaChecklistWriteGuard.requireRequestContext(request);
                    }
                });
        return savePreparedChecklist(resolved, verifiedItems, userId,
                new QaChecklistWriteGuard.Preflight(resolved, initial.actor(), initial.request()));
    }

    private SampleQaChecklist savePreparedChecklist(Integer sampleId, Map<String, Boolean> verifiedItems,
            Integer userId, QaChecklistWriteGuard.Preflight preflight) {
        var currentConfiguration = getActiveChecklistItems();
        var configurationSignature = QaChecklistSnapshot.configurationSignature(currentConfiguration);
        verifiedItems = QaChecklistSnapshot.normalize(currentConfiguration, verifiedItems);
        Runnable checkFacts = writeGuard.verify(preflight,
                verifiedItems.values().stream().allMatch(Boolean.TRUE::equals));
        Runnable recheck = () -> {
            checkFacts.run();
            if (!configurationSignature.equals(QaChecklistSnapshot.configurationSignature(getActiveChecklistItems()))) {
                throw new org.openelisglobal.qachecklist.exception.QaChecklistValidationException(409,
                        "QA_CONFIGURATION_CHANGED", "qa.checklist.configurationChanged");
            }
        };
        Map<String, Boolean> normalizedItems = new LinkedHashMap<>(verifiedItems);
        Prerequisites prerequisites = qaChecklistPrerequisiteDAO.findPrerequisites(sampleId);
        if (prerequisites == null) {
            throw rejected(404, "QA_SAMPLE_NOT_FOUND", "sampleNotFound", null);
        }
        if (prerequisites.disposed()) {
            throw rejected(409, "QA_SAMPLE_DISPOSED", "sampleDisposed", null);
        }
        if (prerequisites.rejected()) {
            throw rejected(409, "QA_SAMPLE_REJECTED", "sampleRejected", null);
        }
        if (prerequisites.statusConflict()) {
            throw rejected(409, "QA_INTAKE_STATUS_CONFLICT", "intakeStatusConflict", null);
        }
        if (prerequisites.noActiveTests()) {
            throw rejected(409, "QA_NO_ACTIVE_TESTS", "noActiveTests", null);
        }
        boolean allVerified = normalizedItems.values().stream().allMatch(Boolean.TRUE::equals);
        if (allVerified) {
            requireIntakePrerequisites(prerequisites);
        }
        Runnable allRecheck = () -> {
            recheck.run();
            if (!prerequisites.equals(qaChecklistPrerequisiteDAO.findPrerequisites(sampleId))) {
                throw rejected(409, "QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
            }
        };
        org.springframework.transaction.support.TransactionSynchronizationManager
                .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void beforeCommit(boolean readOnly) {
                        if (readOnly) {
                            throw rejected(409, "QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
                        }
                        allRecheck.run();
                    }
                });

        // All validation precedes modifying a managed checklist. A failed check
        // must not leave dirty state in the caller's transaction.
        SampleQaChecklist checklist = sampleQaChecklistDAO.findBySampleId(sampleId);

        if (checklist == null) {
            checklist = new SampleQaChecklist();
            checklist.setSampleId(sampleId);
        } else {
            if (!sampleId.equals(checklist.getSampleId())) {
                throw rejected(409, "QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
            }
            var detached = new SampleQaChecklist();
            org.springframework.beans.BeanUtils.copyProperties(checklist, detached);
            checklist = detached;
        }

        // Rechecking a mutable checklist is a new action. Without a persisted
        // tube/configuration version, equal ticks cannot prove an old review.
        checklist.setVerifiedItems(normalizedItems);
        checklist.setAllRequiredVerified(allVerified);
        checklist.setSysUserId(userId.toString());

        // This table is a mutable current snapshot, not an immutable audit event.
        // Keep completion reviewer/time together; an incomplete draft has neither.
        if (!allVerified) {
            checklist.setVerifiedDate(null);
            checklist.setVerifiedByUserId(null);
        } else {
            checklist.setVerifiedDate(new Timestamp(System.currentTimeMillis()));
            checklist.setVerifiedByUserId(userId);
        }

        SampleQaChecklist saved = save(checklist);
        if (saved == null || !sampleId.equals(saved.getSampleId()) || !normalizedItems.equals(saved.getVerifiedItems())
                || !Boolean.valueOf(allVerified).equals(saved.getAllRequiredVerified())) {
            throw rejected(409, "QA_CURRENT_FACTS_CONFLICT", "currentFactsConflict", null);
        }
        allRecheck.run();
        return saved;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean areAllItemsVerified(Integer sampleId) {
        SampleQaChecklist checklist = sampleQaChecklistDAO.findBySampleId(sampleId);
        if (checklist == null) {
            return false;
        }
        return Boolean.TRUE.equals(checklist.getAllRequiredVerified());
    }

    private void validateItemTypes(Map<String, Boolean> verifiedItems) {
        if (verifiedItems == null) {
            throw rejected(400, "QA_ITEMS_INVALID", "itemsInvalid", null);
        }
        // The service can also be called from Java without Jackson's type checks.
        for (Map.Entry<?, ?> item : verifiedItems.entrySet()) {
            if (!(item.getKey() instanceof String key) || key.isBlank() || !(item.getValue() instanceof Boolean)) {
                throw rejected(400, "QA_ITEMS_INVALID", "itemsInvalid", null);
            }
        }
    }

    private void requireIntakePrerequisites(Prerequisites prerequisites) {
        if (!prerequisites.registered()) {
            throw rejected(409, "QA_REGISTRATION_REQUIRED", "registrationRequired", "enter");
        }
        if (!prerequisites.collected()) {
            throw rejected(409, "QA_COLLECTION_REQUIRED", "collectionRequired", "collect");
        }
        if (!prerequisites.stored()) {
            throw rejected(409, "QA_STORAGE_REQUIRED", "storageRequired", "label");
        }
    }

    private QaChecklistValidationException rejected(int status, String code, String key, String blockedStep) {
        return new QaChecklistValidationException(status, code, "qa.checklist." + key, blockedStep);
    }
}
