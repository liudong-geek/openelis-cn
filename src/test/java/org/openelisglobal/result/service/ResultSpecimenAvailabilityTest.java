package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.test.beanItems.TestResultItem;

/** Explicit SIM entities only; no persistence or acceptance claim. */
public class ResultSpecimenAvailabilityTest {
    private OrdinaryResultSaveStateDAO dao;
    private IStatusService statuses;
    private ResultSpecimenAvailabilityService service;
    private Analysis analysis;
    private TestResultItem row;

    @Before
    public void setup() {
        dao = mock(OrdinaryResultSaveStateDAO.class);
        statuses = mock(IStatusService.class);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        when(statuses.getStatusID(SampleStatus.SampleRejected)).thenReturn("11");
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("12");
        when(statuses.getStatusID(SampleStatus.Disposed)).thenReturn("13");
        service = new ResultSpecimenAvailabilityService(dao, statuses);
        analysis = ResultSpecimenWriteGuardTest.tube("101", "201");
        row = row("701");
        state("10", false, false);
        ResultIntakeAdmissionTest.allow(dao, "201", "101");
    }

    private TestResultItem row(String component) {
        TestResultItem item = new TestResultItem();
        item.setAnalysisId("101");
        item.setTestId("401");
        item.setSampleItemId("201");
        item.setTestResultComponentId(component);
        item.setAccessionNumber("SIM-RESULT-301");
        item.setResultValue("0");
        item.setMultiSelectResultValues("{\"0\":\"5,6\"}");
        return item;
    }

    private void state(String status, Boolean rejected, Boolean voided) {
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "301", status, rejected, voided));
    }

    private void expectReason(String reason) {
        service.explain(analysis, List.of(row));
        assertTrue(row.isReadOnly());
        assertEquals(reason, row.getResultEntryBlockedReason());
        assertEquals("0", row.getResultValue());
        assertEquals("{\"0\":\"5,6\"}", row.getMultiSelectResultValues());
        verify(dao, never()).lockSpecimen(anyString());
        verify(dao, never()).lockAnalysis(anyString());
    }

    @Test
    public void unacceptedTubeRemainsVisibleButCannotBeEntered() {
        var current = ResultIntakeAdmissionTest.accepted("201", "101");
        when(dao.findIntakeState("201")).thenReturn(new OrdinaryResultSaveStateDAO.IntakeState(current.tube(),
                current.patients(), current.requests(), current.tests(), List.of()));
        expectReason(ResultIntakeAdmission.MISSING);
    }

    @Test
    public void activeLifecycleDoesNotCreateAnAcceptanceDecision() {
        service.explain(analysis, List.of(row));
        assertFalse(row.isReadOnly());
        assertNull(row.getResultEntryBlockedReason());
        assertFalse(analysis.getSampleItem().isRejected());
        verify(dao).findSpecimenState("101");
    }

    @Test
    public void activeLifecycleNeverClearsExistingRestriction() {
        row.setReadOnly(true);
        row.setResultEntryBlockedReason("error.results.resultDefinitionMissing");
        expectReason("error.results.resultDefinitionMissing");
    }

    @Test
    public void persistedRejectionIsVisibleEvenWhenManagedFlagIsFalse() {
        state("10", true, false);
        expectReason("error.results.specimenRejected");
    }

    @Test
    public void persistedVoidIsVisible() {
        state("10", false, true);
        expectReason("error.results.specimenVoided");
    }

    @Test
    public void unflushedManagedRejectionIsNotHidden() {
        analysis.getSampleItem().setRejected(true);
        expectReason("error.results.specimenRejected");
    }

    @Test
    public void unflushedManagedVoidIsNotHidden() {
        analysis.getSampleItem().setVoided(true);
        expectReason("error.results.specimenVoided");
    }

    @Test
    public void canceledStatusIsExplained() {
        state("12", false, false);
        analysis.getSampleItem().setStatusId("12");
        expectReason("error.results.specimenCanceled");
    }

    @Test
    public void disposedStatusIsExplained() {
        state("13", false, false);
        analysis.getSampleItem().setStatusId("13");
        expectReason("error.results.specimenDisposed");
    }

    @Test
    public void rejectedStatusDoesNotNeedTheFlagToBlock() {
        state("11", false, false);
        analysis.getSampleItem().setStatusId("11");
        expectReason("error.results.specimenRejected");
    }

    @Test
    public void unknownStatusIsNotEditable() {
        state("999", false, false);
        analysis.getSampleItem().setStatusId("999");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void missingStatusIsNotEditable() {
        state(null, false, false);
        analysis.getSampleItem().setStatusId(null);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void nullableRejectionDoesNotMeanAccepted() {
        state("10", null, false);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void nullableVoidDoesNotMeanAccepted() {
        state("10", false, null);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test public void missingPersistedAnalysisBlocks() {
        when(dao.findSpecimenState("101")).thenReturn(null);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void malformedSourceIdentityDoesNotQuery() {
        analysis.setId("SIM-invalid");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
        verify(dao, never()).findSpecimenState(anyString());
    }

    @Test public void wrongPersistedParentBlocks() {
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "999", "10", false, false));
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void wrongRowTubeCannotBorrowEligibility() {
        row.setSampleItemId("999");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void wrongRowAnalysisCannotBorrowEligibility() {
        row.setAnalysisId("999");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void missingTestRowCannotBorrowEligibility() {
        row.setTestId(null);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void managedStatusChangeCannotBeHiddenByPersistedEntered() {
        analysis.getSampleItem().setStatusId("12");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test public void brokenConfiguredEnteredBlocks() {
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("-1");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test public void conflictingConfiguredStatusesBlock() {
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("10");
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test public void ambiguousUnavailableStatusesDoNotInventASpecificReason() {
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("11");
        analysis.getSampleItem().setStatusId("11");
        state("11", false, false);
        expectReason(ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test
    public void allComponentRowsShareOneReadAndStayVisible() {
        TestResultItem second = row("702");
        List<TestResultItem> rows = List.of(row, second);
        state("10", true, false);
        service.explain(analysis, rows);
        assertEquals(2, rows.size());
        assertEquals("error.results.specimenRejected", second.getResultEntryBlockedReason());
        assertTrue(row.isReadOnly());
        assertTrue(second.isReadOnly());
        verify(dao).findSpecimenState("101");
    }

    @Test public void databaseFailureDoesNotBecomeEditableOrEmptySuccess() {
        when(dao.findSpecimenState("101")).thenThrow(new IllegalStateException("SIM database unavailable"));
        assertThrows(IllegalStateException.class, () -> service.explain(analysis, List.of(row)));
    }

    @Test
    public void noRowsCausesNoDatabaseRead() {
        service.explain(analysis, List.of());
        verifyZeroInteractions(dao);
    }

    @Test
    public void historicalOpaqueRejectReasonIsNeitherReadNorCleared() {
        analysis.getSampleItem().setRejectReasonId("SIM-opaque-legacy-reason");
        service.explain(analysis, List.of(row));
        assertEquals("SIM-opaque-legacy-reason", analysis.getSampleItem().getRejectReasonId());
    }

    @Test
    public void rowJsonExposesTheFixedReasonWithoutInventingAcceptance() throws Exception {
        state("10", true, false);
        service.explain(analysis, List.of(row));
        com.fasterxml.jackson.databind.JsonNode json = new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(row);
        assertEquals("error.results.specimenRejected", json.get("resultEntryBlockedReason").asText());
        assertTrue(json.get("readOnly").asBoolean());
        assertFalse(json.has("acceptanceVerified"));
        assertEquals("0", json.get("resultValue").asText());
    }

    @Test
    public void clientCannotSupplyTheServerOwnedReason() throws Exception {
        TestResultItem submitted = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                "{\"analysisId\":\"101\",\"resultValue\":\"0\",\"resultEntryBlockedReason\":\"client-decision\"}",
                TestResultItem.class);
        assertNull(submitted.getResultEntryBlockedReason());
        assertEquals("0", submitted.getResultValue());
    }
}
