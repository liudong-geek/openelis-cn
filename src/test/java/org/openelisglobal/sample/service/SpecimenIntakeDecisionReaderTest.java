package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** SIM records, actual read projection; never opens a database. */
public class SpecimenIntakeDecisionReaderTest {
    private SpecimenIntakeDecisionDAO dao;
    private SpecimenIntakeDecisionReader reader;
    private List<SpecimenView> tubes;

    @Before
    public void setUp() {
        dao = mock(SpecimenIntakeDecisionDAO.class);
        reader = new SpecimenIntakeDecisionReader(dao);
        tubes = List.of(tube("801", false), tube("802", false));
        when(dao.findForTubes(List.of("801", "802"))).thenReturn(List.of());
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(Connection.TRANSACTION_REPEATABLE_READ);
    }

    @After
    public void clear() {
        TransactionSynchronizationManager.clear();
    }

    private static SpecimenView tube(String id, boolean rejected) {
        return new SpecimenView(id, "701", "0", "31", 1.0, null, "SampleEntered", false, rejected,
                SpecimenIntakeDecisionTest.TIME, SpecimenIntakeDecisionTest.TIME, "SIM-采集人", "2026-09-14T05:00:00Z",
                List.of(new EntryCurrentStateReader.AnalysisView("901", "41", "Finalized", "2026-09-14T05:00:00Z")));
    }

    private List<SpecimenIntakeDecisionReader.Tube> read() {
        return reader.read("301", "SIM-INTAKE", "601", tubes);
    }

    @Test
    public void unRejectedOrReceivedLegacyTubeIsNeverAnAcceptedDecision() {
        var result = read();
        assertEquals(2, result.size());
        for (var value : result) {
            assertEquals("NOT_RECORDED", value.state());
            assertNull(value.recordedDecision());
            assertFalse(value.currentAcceptanceVerified());
        }
    }

    @Test
    public void legacyRejectionHasNoInventedReasonNamespaceOrSignature() {
        tubes = List.of(tube("801", true), tube("802", false));
        var result = read();
        assertEquals("LEGACY_REJECTION", result.get(0).state());
        assertNull(result.get(0).reason());
        assertNull(result.get(0).decidedBy());
        assertEquals("NOT_RECORDED", result.get(1).state());
    }

    @Test public void exactTubeDecisionDoesNotSpillToAnotherTubeOfSameType() {
        when(dao.findForTubes(List.of("801", "802"))).thenReturn(List.of(SpecimenIntakeDecisionTest.row("801", Decision.REJECTED)));
        var result = read();
        assertEquals("RECORDED", result.get(0).state());
        assertEquals("REJECTED", result.get(0).recordedDecision());
        assertEquals("模拟：容器不符", result.get(0).reason().label());
        assertEquals("NOT_RECORDED", result.get(1).state());
        assertFalse(result.get(0).currentAcceptanceVerified());
        assertEquals(SpecimenIntakeDecisionTest.row("801", Decision.REJECTED).getEvidenceDigest(), result.get(0).evidenceDigest());
        verify(dao, times(1)).findForTubes(List.of("801", "802"));
    }

    @Test
    public void laterResultsVersionsOrRejectionDoNotEraseHistoricalFirstAcceptance() {
        tubes = List.of(tube("801", true), tube("802", false));
        when(dao.findForTubes(List.of("801", "802")))
                .thenReturn(List.of(SpecimenIntakeDecisionTest.row("801", Decision.ACCEPTED)));
        var result = read().get(0);
        assertEquals("RECORDED", result.state());
        assertEquals("ACCEPTED", result.recordedDecision());
        assertFalse(result.currentAcceptanceVerified());
    }

    @Test
    public void movedOwnerDoesNotExposeAnotherPatientReasonOrSignature() {
        for (String field : List.of("sampleId", "labNo", "patientId", "requestId")) {
            var row = SpecimenIntakeDecisionTest.row("801", Decision.REJECTED);
            ReflectionTestUtils.setField(row, field, "999");
            when(dao.findForTubes(List.of("801", "802"))).thenReturn(List.of(row));
            var result = read().get(0);
            assertEquals(field, "REVIEW_REQUIRED", result.state());
            assertNull(result.operationId());
            assertNull(result.reason());
            assertNull(result.decidedBy());
            assertNull(result.evidenceDigest());
        }
    }

    @Test
    public void malformedOrDuplicatePersistedRecordsFailClosed() {
        var row = SpecimenIntakeDecisionTest.row("801", Decision.ACCEPTED);
        ReflectionTestUtils.setField(row, "evidenceDigest", "0".repeat(64));
        when(dao.findForTubes(List.of("801", "802"))).thenReturn(List.of(row));
        assertEquals("INVALID_RECORD", read().get(0).state());
        row = SpecimenIntakeDecisionTest.row("801", Decision.ACCEPTED);
        when(dao.findForTubes(List.of("801", "802"))).thenReturn(List.of(row, row));
        for (var result : read()) {
            assertEquals("INVALID_RECORD", result.state());
            assertNull(result.recordedDecision());
            assertFalse(result.currentAcceptanceVerified());
        }
    }

    @Test public void databaseFailureIsNotAnEmptyListOrAnAcceptedDecision() {
        when(dao.findForTubes(List.of("801", "802"))).thenThrow(new IllegalStateException("SIM unavailable"));
        assertThrows(IllegalStateException.class, this::read);
    }

    @Test
    public void wrongTransactionNeverQueriesEvidence() {
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
        assertThrows(IllegalStateException.class, this::read);
        verifyZeroInteractions(dao);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(Connection.TRANSACTION_READ_COMMITTED);
        assertThrows(IllegalStateException.class, this::read);
        verifyZeroInteractions(dao);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(Connection.TRANSACTION_REPEATABLE_READ);
        TransactionSynchronizationManager.setActualTransactionActive(false);
        assertThrows(IllegalStateException.class, this::read);
        verifyZeroInteractions(dao);
    }

    private org.openelisglobal.dictionary.valueholder.Dictionary reason() {
        var row = new org.openelisglobal.dictionary.valueholder.Dictionary();
        row.setId("41");
        row.setIsActive("Y");
        row.setDictEntry("模拟：容器不符");
        row.setLastupdated(java.sql.Timestamp.from(java.time.Instant.parse("2026-09-13T06:00:00.123456Z")));
        var category = new org.openelisglobal.dictionarycategory.valueholder.DictionaryCategory();
        category.setId("51");
        category.setCategoryName("resultRejectionReasons");
        category.setLastupdated(row.getLastupdated());
        row.setDictionaryCategory(category);
        return row;
    }

    @Test public void reasonCatalogUsesExactWriterNamespaceAndVersionWithoutLocalNameSubstitution() {
        when(dao.activeRejectionReasons()).thenReturn(List.of(reason()));
        var catalog = reader.reasons(); assertEquals("READY", catalog.state());
        assertEquals("DICTIONARY:resultRejectionReasons", catalog.items().get(0).namespace());
        assertEquals("2026-09-13T06:00:00.123456Z", catalog.items().get(0).version());
        assertEquals("模拟：容器不符", catalog.items().get(0).label());
    }

    @Test public void absentDuplicateInactiveAndWrongCategoryAreNotUsableReasons() {
        when(dao.activeRejectionReasons()).thenReturn(List.of()); assertEquals("EMPTY", reader.reasons().state());
        when(dao.activeRejectionReasons()).thenReturn(null); assertEquals("UNAVAILABLE", reader.reasons().state());
        var row = reason(); when(dao.activeRejectionReasons()).thenReturn(List.of(row, row));
        assertEquals("UNAVAILABLE", reader.reasons().state());
        when(dao.activeRejectionReasons()).thenReturn(List.of(row)); row.setIsActive("N");
        assertEquals("UNAVAILABLE", reader.reasons().state()); row.setIsActive("Y"); row.getDictionaryCategory().setCategoryName("other");
        assertEquals("UNAVAILABLE", reader.reasons().state());
    }

    @Test
    public void staleOrMalformedDirectoryDoesNotBecomeFreeTextReason() {
        var row = reason();
        when(dao.activeRejectionReasons()).thenReturn(List.of(row));
        row.setLastupdated(null);
        assertEquals("UNAVAILABLE", reader.reasons().state());
        row = reason();
        row.setDictEntry("模拟\u0085原因");
        when(dao.activeRejectionReasons()).thenReturn(List.of(row));
        assertEquals("UNAVAILABLE", reader.reasons().state());
        row = reason();
        row.getDictionaryCategory().setLastupdated(null);
        when(dao.activeRejectionReasons()).thenReturn(List.of(row));
        assertEquals("UNAVAILABLE", reader.reasons().state());
    }

    @Test
    public void catalogReadRequiresAuthorizedRepeatableReadAndPropagatesDatabaseFailure() {
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
        assertThrows(IllegalStateException.class, () -> reader.reasons());
        verifyZeroInteractions(dao);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        when(dao.activeRejectionReasons()).thenThrow(new IllegalStateException("SIM unavailable"));
        assertThrows(IllegalStateException.class, () -> reader.reasons());
    }
}
