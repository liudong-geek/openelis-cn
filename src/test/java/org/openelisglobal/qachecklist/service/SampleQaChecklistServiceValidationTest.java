package org.openelisglobal.qachecklist.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO.Prerequisites;
import org.openelisglobal.qachecklist.dao.QaChecklistPrerequisiteDAO;
import org.openelisglobal.qachecklist.dao.SampleQaChecklistDAO;
import org.openelisglobal.qachecklist.exception.QaChecklistValidationException;
import org.openelisglobal.qachecklist.valueholder.SampleQaChecklist;
import org.springframework.test.util.ReflectionTestUtils;

/** Calls the real service command directly, without controller validation. */
public class SampleQaChecklistServiceValidationTest {
    private SampleQaChecklistDAO checklistDAO;
    private DictionaryService dictionaryService;
    private CapturingService service;
    private QaChecklistPrerequisiteDAO prerequisiteDAO;

    @Before
    public void setup() {
        checklistDAO = mock(SampleQaChecklistDAO.class);
        dictionaryService = mock(DictionaryService.class);
        service = new CapturingService();
        prerequisiteDAO = mock(QaChecklistPrerequisiteDAO.class);
        ReflectionTestUtils.setField(service, "sampleQaChecklistDAO", checklistDAO);
        ReflectionTestUtils.setField(service, "dictionaryService", dictionaryService);
        ReflectionTestUtils.setField(service, "qaChecklistPrerequisiteDAO", prerequisiteDAO);
        var guard = mock(QaChecklistWriteGuard.class);
        when(guard.verify(any(), anyBoolean())).thenReturn(() -> {
        });
        ReflectionTestUtils.setField(service, "writeGuard", guard);
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(true, true, true, false, false, false, false));
    }

    @After
    public void clearSynchronization() {
        org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    public void invalidUserIsRejectedBeforeAnyDataAccessEvenWhenCalledDirectly() {
        for (Integer user : new Integer[] { null, 0, -1 }) {
            reject(401, "QA_AUTH_REQUIRED", null, () -> service.saveOrUpdateChecklist(42, Map.of(), user));
        }
        verifyZeroInteractions(checklistDAO, dictionaryService);
        assertNull(service.persisted);
    }

    @Test
    public void nonPositiveSampleIdentifiersCannotCreateOrphanChecklists() {
        for (Integer sample : new Integer[] { null, 0, -1 }) {
            reject(400, "QA_SAMPLE_ID_INVALID", null, () -> service.saveOrUpdateChecklist(sample, Map.of(), 7));
        }
        verifyZeroInteractions(checklistDAO, dictionaryService);
        assertNull(service.persisted);
    }

    @Test
    public void unavailableConfigurationCannotBeSavedEvenAsDraft() {
        when(dictionaryService.getDictionaryEntrysByCategoryNameLocalizedSort("QAChecklistItem"))
                .thenReturn(List.of());
        reject(409, "QA_CONFIGURATION_INVALID", null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        assertNull(service.persisted);
    }

    @Test
    public void unknownKeysAreConfigurationConflictInsteadOfBeingSilentlyStored() {
        configure("patient", "specimen");
        reject(409, "QA_CONFIGURATION_CHANGED", null,
                () -> service.saveOrUpdateChecklist(42, Map.of("retired-item", true), 7));
        assertNull(service.persisted);
    }

    @Test
    public void nullOrNonBooleanItemValuesCannotBypassControllerValidation() {
        reject(400, "QA_ITEMS_INVALID", null, () -> service.saveOrUpdateChecklist(42, null, 7));
        Map<String, Boolean> missingValue = new HashMap<>();
        missingValue.put("patient", null);
        reject(400, "QA_ITEMS_INVALID", null, () -> service.saveOrUpdateChecklist(42, missingValue, 7));
        missingValue.clear();
        missingValue.put(null, true);
        reject(400, "QA_ITEMS_INVALID", null, () -> service.saveOrUpdateChecklist(42, missingValue, 7));
        @SuppressWarnings({ "unchecked", "rawtypes" })
        Map<String, Boolean> coerced = (Map) Map.of("patient", "true");
        reject(400, "QA_ITEMS_INVALID", null, () -> service.saveOrUpdateChecklist(42, coerced, 7));
        verifyZeroInteractions(dictionaryService, checklistDAO);
        assertNull(service.persisted);
    }

    @Test
    public void duplicateOrBlankActiveKeysAreInvalidConfiguration() {
        for (String[] keys : new String[][] { { "patient", "patient" }, { "" }, { " patient " } }) {
            configure(keys);
            reject(409, "QA_CONFIGURATION_INVALID", null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        }
        when(dictionaryService.getDictionaryEntrysByCategoryNameLocalizedSort("QAChecklistItem")).thenReturn(null);
        reject(409, "QA_CONFIGURATION_INVALID", null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        assertNull(service.persisted);
    }

    @Test
    public void nonexistentRequestAndDisposedSpecimensCannotSaveEvenDrafts() {
        configure("patient", "specimen");
        when(prerequisiteDAO.findPrerequisites(42)).thenReturn(null);
        reject(404, "QA_SAMPLE_NOT_FOUND", null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(true, true, true, true, false, false, false));
        reject(409, "QA_SAMPLE_DISPOSED", null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        verifyZeroInteractions(checklistDAO);
        assertNull(service.persisted);
    }

    @Test
    public void fullChecklistMustPassCurrentRegistrationBeforeTrustingOldQaTrue() {
        configure("patient", "specimen");
        SampleQaChecklist existing = completed();
        when(checklistDAO.findBySampleId(42)).thenReturn(existing);
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(false, true, true, false, false, false, false));
        reject(409, "QA_REGISTRATION_REQUIRED", "enter", () -> service.saveOrUpdateChecklist(42, allChecked(), 7));
        assertEquals(Integer.valueOf(3), existing.getVerifiedByUserId());
        assertEquals(Timestamp.valueOf("2026-01-01 09:00:00"), existing.getVerifiedDate());
        assertNull(service.persisted);
    }

    @Test
    public void fullChecklistWithOutstandingCollectionCannotBecomeAccepted() {
        configure("patient", "specimen");
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(true, false, true, false, false, false, false));
        reject(409, "QA_COLLECTION_REQUIRED", "collect", () -> service.saveOrUpdateChecklist(42, allChecked(), 7));
        verifyZeroInteractions(checklistDAO);
        assertNull(service.persisted);
    }

    @Test
    public void fullChecklistNeedsStorageOrExplicitServerSideSkip() {
        configure("patient", "specimen");
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(true, true, false, false, false, false, false));
        reject(409, "QA_STORAGE_REQUIRED", "label", () -> service.saveOrUpdateChecklist(42, allChecked(), 7));
        assertNull(service.persisted);
    }

    @Test
    public void draftMayBeSavedBeforePrerequisitesButNeverHasCompletionAttribution() {
        configure("patient", "specimen");
        when(prerequisiteDAO.findPrerequisites(42))
                .thenReturn(new Prerequisites(false, false, false, false, false, false, false));
        SampleQaChecklist saved = service.saveOrUpdateChecklist(42, Map.of("patient", true), 7);
        assertEquals(Map.of("patient", true, "specimen", false), saved.getVerifiedItems());
        assertFalse(saved.getAllRequiredVerified());
        assertNull(saved.getVerifiedDate());
        assertNull(saved.getVerifiedByUserId());
        assertEquals("7", saved.getSysUserId());
        verify(prerequisiteDAO, times(2)).findPrerequisites(42);
    }

    @Test
    public void fullChecklistRecordsServerCalculatedCompletionAndCopiesCallerData() {
        configure("patient", "specimen");
        Map<String, Boolean> input = new HashMap<>(allChecked());
        long before = System.currentTimeMillis();
        SampleQaChecklist saved = service.saveOrUpdateChecklist(42, input, 7);
        assertTrue(saved.getAllRequiredVerified());
        assertEquals(Integer.valueOf(42), saved.getSampleId());
        assertEquals(Integer.valueOf(7), saved.getVerifiedByUserId());
        assertEquals("7", saved.getSysUserId());
        assertTrue(saved.getVerifiedDate().getTime() >= before);
        assertTrue(saved.getVerifiedDate().getTime() <= System.currentTimeMillis());
        input.put("patient", false);
        assertEquals(allChecked(), saved.getVerifiedItems());
        assertTrue(saved.getVerifiedItemsJson().contains("\"patient\":true"));
        assertSame(saved, service.persisted);
    }

    @Test
    public void explicitReverificationRecordsCurrentReviewerAndTimeTogether() {
        configure("patient", "specimen");
        SampleQaChecklist previous = completed();
        when(checklistDAO.findBySampleId(42)).thenReturn(previous);
        SampleQaChecklist saved = service.saveOrUpdateChecklist(42, allChecked(), 7);
        assertEquals(Integer.valueOf(7), saved.getVerifiedByUserId());
        assertTrue(saved.getVerifiedDate().after(Timestamp.valueOf("2026-01-01 09:00:00")));
        assertEquals("7", saved.getSysUserId());
        verify(prerequisiteDAO, times(2)).findPrerequisites(42);
    }

    @Test
    public void changingCompletionBackToDraftClearsBothCompletionFields() {
        configure("patient", "specimen");
        when(checklistDAO.findBySampleId(42)).thenReturn(completed());
        SampleQaChecklist saved = service.saveOrUpdateChecklist(42, Map.of("patient", true), 7);
        assertFalse(saved.getAllRequiredVerified());
        assertNull(saved.getVerifiedDate());
        assertNull(saved.getVerifiedByUserId());
        assertEquals("7", saved.getSysUserId());
        assertEquals(Map.of("patient", true, "specimen", false), saved.getVerifiedItems());
    }

    @Test
    public void oldIncompleteAttributionIsReplacedAsOnePairAfterFreshValidation() {
        configure("patient", "specimen");
        SampleQaChecklist previous = completed();
        previous.setVerifiedByUserId(null);
        when(checklistDAO.findBySampleId(42)).thenReturn(previous);
        long before = System.currentTimeMillis();
        SampleQaChecklist saved = service.saveOrUpdateChecklist(42, allChecked(), 7);
        assertEquals(Integer.valueOf(7), saved.getVerifiedByUserId());
        assertTrue(saved.getVerifiedDate().getTime() >= before);
    }

    @Test
    public void databaseFailureIsNotSwallowedOrTurnedIntoSuccessfulDraft() {
        configure("patient", "specimen");
        when(prerequisiteDAO.findPrerequisites(42)).thenThrow(new IllegalStateException("unavailable"));
        assertThrows(IllegalStateException.class, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        assertNull(service.persisted);
        verifyZeroInteractions(checklistDAO);
    }

    private Map<String, Boolean> allChecked() {
        return Map.of("patient", true, "specimen", true);
    }

    @Test
    public void rejectedSpecimensBlockDraftAndCompletionWithoutMutatingOldSnapshot() {
        assertExceptionGuard(new Prerequisites(true, true, true, false, true, false, false), "QA_SAMPLE_REJECTED");
    }

    @Test
    public void cancelledTubeWithActiveTestsBlocksDraftAndCompletion() {
        assertExceptionGuard(new Prerequisites(true, true, true, false, false, true, false),
                "QA_INTAKE_STATUS_CONFLICT");
    }

    @Test
    public void ExplicitlyCancelledWorkWithoutRemainingTestsCannotBeAccepted() {
        assertExceptionGuard(new Prerequisites(true, true, true, false, false, false, true), "QA_NO_ACTIVE_TESTS");
    }

    private void assertExceptionGuard(Prerequisites facts, String code) {
        configure("patient", "specimen");
        SampleQaChecklist old = completed();
        when(checklistDAO.findBySampleId(42)).thenReturn(old);
        when(prerequisiteDAO.findPrerequisites(42)).thenReturn(facts);
        reject(409, code, null, () -> service.saveOrUpdateChecklist(42, Map.of(), 7));
        reject(409, code, null, () -> service.saveOrUpdateChecklist(42, allChecked(), 7));
        assertNull(service.persisted);
        assertEquals(Integer.valueOf(3), old.getVerifiedByUserId());
        assertEquals(Timestamp.valueOf("2026-01-01 09:00:00"), old.getVerifiedDate());
        verifyZeroInteractions(checklistDAO);
    }

    private SampleQaChecklist completed() {
        SampleQaChecklist checklist = new SampleQaChecklist();
        checklist.setId(1);
        checklist.setSampleId(42);
        checklist.setVerifiedItems(allChecked());
        checklist.setAllRequiredVerified(true);
        checklist.setVerifiedByUserId(3);
        checklist.setVerifiedDate(Timestamp.valueOf("2026-01-01 09:00:00"));
        return checklist;
    }

    private void configure(String... keys) {
        when(dictionaryService.getDictionaryEntrysByCategoryNameLocalizedSort("QAChecklistItem"))
                .thenReturn(java.util.Arrays.stream(keys).map(key -> {
                    Dictionary item = new Dictionary();
                    item.setIsActive("Y");
                    item.setDictEntry(key);
                    return item;
                }).toList());
    }

    private void reject(int status, String code, String step, Runnable action) {
        QaChecklistValidationException error = assertThrows(QaChecklistValidationException.class, action::run);
        assertEquals(status, error.getStatus());
        assertEquals(code, error.getCode());
        assertEquals(step, error.getBlockedStep());
        assertTrue(error.getErrorKey().startsWith("qa.checklist."));
    }

    /** Replaces only persistence; validation and state transformation are real. */
    private static class CapturingService extends SampleQaChecklistServiceImpl {
        private SampleQaChecklist persisted;

        @Override
        public SampleQaChecklist save(SampleQaChecklist checklist) {
            persisted = checklist;
            return checklist;
        }
    }
}
