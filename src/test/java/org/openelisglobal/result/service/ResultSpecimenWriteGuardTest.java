package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** SIM object/DAO tests; no clinical acceptance, ORM or database assertions. */
public class ResultSpecimenWriteGuardTest {
    private OrdinaryResultSaveStateDAO dao;
    private IStatusService statuses;
    private ResultSpecimenWriteGuard guard;
    private ResultsUpdateDataSet data;
    private Analysis analysis;
    private final List<Analysis> analyses = new ArrayList<>();

    @Before
    public void setup() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        dao = mock(OrdinaryResultSaveStateDAO.class);
        statuses = mock(IStatusService.class);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        guard = new ResultSpecimenWriteGuard(dao, statuses);
        data = mock(ResultsUpdateDataSet.class);
        analysis = tube("101", "201");
        analyses.add(analysis);
        when(data.getModifiedAnalysis()).thenReturn(analyses);
        when(dao.findSpecimenState("101")).thenReturn(state("10", false, false));
        when(dao.lockSpecimen("201")).thenReturn(analysis.getSampleItem());
        when(dao.lockAnalysis("101")).thenReturn(analysis);
    }

    @After
    public void clearTransaction() {
        TransactionSynchronizationManager.clear();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    static Analysis tube(String analysisId, String itemId) {
        Sample sample = new Sample();
        sample.setId("301");
        sample.setAccessionNumber("SIM-RESULT-301");
        SampleItem item = new SampleItem();
        item.setId(itemId);
        item.setSample(sample);
        item.setStatusId("10");
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        Analysis analysis = new Analysis();
        analysis.setId(analysisId);
        analysis.setTest(test);
        analysis.setSampleItem(item);
        analysis.setStatusId("1");
        return analysis;
    }

    private SpecimenState state(String status, Boolean rejected, Boolean voided) {
        return new SpecimenState("101", "401", "201", "301", status, rejected, voided);
    }

    private void denied() {
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
    }

    @Test
    public void normalTubeLocksBeforeScalarVerificationAndRechecks() {
        Runnable recheck = guard.begin(data);
        recheck.run();
        var order = inOrder(dao);
        order.verify(dao).lockSpecimen("201");
        order.verify(dao).lockAnalysis("101");
        order.verify(dao, times(2)).findSpecimenState("101");
    }

    @Test public void rejectedPersistedTubeCannotBeHiddenByManagedFalse() {
        when(dao.findSpecimenState("101")).thenReturn(state("10", true, false));
        denied();
        assertFalse(analysis.getSampleItem().isRejected());
    }

    @Test public void voidedPersistedTubeCannotBeHiddenByManagedFalse() {
        when(dao.findSpecimenState("101")).thenReturn(state("10", false, true));
        denied();
    }

    @Test
    public void canceledRejectedDisposedUnknownAndMissingStatusesAreUnavailable() {
        for (String status : new String[] { "11", "12", "13", "999", null, "" }) {
            when(dao.findSpecimenState("101")).thenReturn(state(status, false, false));
            denied();
        }
    }

    @Test public void nullableFlagsAreNotAnImplicitNegativeDecision() {
        when(dao.findSpecimenState("101")).thenReturn(state("10", null, false));
        denied();
        when(dao.findSpecimenState("101")).thenReturn(state("10", false, null));
        denied();
    }

    @Test public void absentAnalysisFailsClosed() {
        when(dao.findSpecimenState("101")).thenReturn(null);
        denied();
    }

    @Test
    public void fullPersistedChainMustMatchTargetObjects() {
        for (SpecimenState mismatch : List.of(new SpecimenState("102", "401", "201", "301", "10", false, false),
                new SpecimenState("101", "402", "201", "301", "10", false, false),
                new SpecimenState("101", "401", "202", "301", "10", false, false),
                new SpecimenState("101", "401", "201", "302", "10", false, false))) {
            when(dao.findSpecimenState("101")).thenReturn(mismatch);
            denied();
        }
    }

    @Test
    public void managedRejectionBeforePersistenceAlsoBlocks() {
        analysis.getSampleItem().setRejected(true);
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void managedVoidingAlsoBlocks() {
        analysis.getSampleItem().setVoided(true);
        denied();
        verifyZeroInteractions(dao);
    }

    @Test public void missingConfiguredEnteredStatusBlocksBeforeLocks() {
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn(null);
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void rejectsMissingOrReadonlyTransactionBeforeDaoAccess() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        denied();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void latePersistentRejectionFailsRecheck() {
        Runnable recheck = guard.begin(data);
        when(dao.findSpecimenState("101")).thenReturn(state("10", true, false));
        assertThrows(ResultSaveValidationException.class, recheck::run);
    }

    @Test
    public void lateManagedVoidingFailsRecheck() {
        Runnable recheck = guard.begin(data);
        analysis.getSampleItem().setVoided(true);
        assertThrows(ResultSaveValidationException.class, recheck::run);
    }

    @Test
    public void normalAnalysisAndParentOrderStatusChangesDoNotFail() {
        Runnable recheck = guard.begin(data);
        analysis.setStatusId("9");
        analysis.getSampleItem().getSample().setStatusId("2");
        recheck.run();
        assertEquals("9", analysis.getStatusId());
    }

    @Test
    public void repeatedComponentsForSameAnalysisAreDeduplicated() {
        analyses.add(analysis);
        guard.begin(data).run();
        verify(dao, times(1)).lockSpecimen("201");
        verify(dao, times(1)).lockAnalysis("101");
    }

    @Test
    public void changingTargetSetCannotEscapeRecheck() {
        Runnable recheck = guard.begin(data);
        analyses.add(tube("102", "202"));
        assertThrows(ResultSaveValidationException.class, recheck::run);
    }

    @Test
    public void pureResultSetCallerIsCoveredWithoutModifiedItems() {
        analyses.clear();
        Result result = new Result();
        result.setAnalysis(analysis);
        when(data.getNewResults()).thenReturn(List.of(new ResultSet(result, null, null, null,
                analysis.getSampleItem().getSample(), Collections.emptyMap(), false)));
        when(dao.findSpecimenState("101")).thenReturn(state("10", true, false));
        denied();
    }

    @Test
    public void resultSetCannotWriteDifferentParentOrder() {
        Result result = new Result();
        result.setAnalysis(analysis);
        Sample wrong = new Sample();
        wrong.setId("302");
        when(data.getModifiedResults())
                .thenReturn(List.of(new ResultSet(result, null, null, null, wrong, Collections.emptyMap(), false)));
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void resultDeletionCannotEscapeSpecimenChecks() {
        analyses.clear();
        Result result = new Result();
        result.setAnalysis(analysis);
        when(data.getDeletableResults()).thenReturn(List.of(result));
        when(dao.findSpecimenState("101")).thenReturn(state("12", false, false));
        denied();
    }

    @Test
    public void changedConfiguredStatusFailsRecheck() {
        Runnable recheck = guard.begin(data);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("11");
        assertThrows(ResultSaveValidationException.class, recheck::run);
    }

    @Test
    public void unflushedManagedCancellationCannotHideBehindEnteredScalarState() {
        Analysis managed = tube("101", "201");
        when(dao.lockSpecimen("201")).thenReturn(managed.getSampleItem());
        when(dao.lockAnalysis("101")).thenReturn(managed);
        Runnable recheck = guard.begin(data);
        managed.getSampleItem().setStatusId("12");
        assertThrows(ResultSaveValidationException.class, recheck::run);
        assertEquals("10", analysis.getSampleItem().getStatusId());
    }

    @Test
    public void managedAnalysisReparentingCannotHideBehindOldScalarState() {
        Analysis managed = tube("101", "201");
        when(dao.lockAnalysis("101")).thenReturn(managed);
        Runnable recheck = guard.begin(data);
        managed.setSampleItem(tube("102", "202").getSampleItem());
        assertThrows(ResultSaveValidationException.class, recheck::run);
    }

    @Test
    public void newReferralWithoutReturnedResultRemainsValid() {
        var referral = new org.openelisglobal.referral.valueholder.Referral();
        referral.setAnalysis(analysis);
        var set = new org.openelisglobal.referral.valueholder.ReferralSet();
        set.setReferral(referral);
        when(data.getSavableReferralSets()).thenReturn(List.of(set));
        Runnable recheck = guard.begin(data);
        set.getNextReferralResult();
        recheck.run();
        assertEquals(1, set.getUpdatableReferralResults().size());
    }

    @Test
    public void referralActualResultCannotPointToRejectedSibling() {
        var referral = new org.openelisglobal.referral.valueholder.Referral();
        referral.setAnalysis(analysis);
        var set = new org.openelisglobal.referral.valueholder.ReferralSet();
        set.setReferral(referral);
        var other = tube("102", "202");
        other.getSampleItem().setRejected(true);
        Result result = new Result();
        result.setAnalysis(other);
        set.getNextReferralResult().setResult(result);
        when(data.getSavableReferralSets()).thenReturn(List.of(set));
        denied();
    }

    @Test
    public void multipleTargetsAcquireAllTubeLocksInNumericOrderBeforeAnalysisLocks() {
        Analysis second = tube("9", "19");
        analyses.add(second);
        when(dao.lockSpecimen("19")).thenReturn(second.getSampleItem());
        when(dao.lockAnalysis("9")).thenReturn(second);
        when(dao.findSpecimenState("9")).thenReturn(new SpecimenState("9", "401", "19", "301", "10", false, false));
        guard.begin(data).run();
        var order = inOrder(dao);
        order.verify(dao).lockSpecimen("19");
        order.verify(dao).lockSpecimen("201");
        order.verify(dao).lockAnalysis("9");
        order.verify(dao).lockAnalysis("101");
        order.verify(dao).findSpecimenState("101");
    }

    @Test
    public void untouchedSiblingIsNotLockedOrAssumedAccepted() {
        guard.begin(data).run();
        verify(dao, never()).lockSpecimen("202");
        verify(dao, never()).lockAnalysis("102");
    }

    @Test
    public void sameAnalysisWithConflictingTubeTargetsIsRejectedBeforeLocks() {
        analyses.add(tube("101", "202"));
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void detachedTargetCannotHideUnflushedRejectionInLockedSessionObject() {
        var sessionItem = tube("101", "201").getSampleItem();
        sessionItem.setRejected(true);
        when(dao.lockSpecimen("201")).thenReturn(sessionItem);
        denied();
    }

    @Test
    public void lockFailureIsNotConvertedToAnEditableState() {
        doThrow(new IllegalStateException("SIM-lock-timeout")).when(dao).lockSpecimen("201");
        assertThrows(IllegalStateException.class, () -> guard.begin(data));
        verify(dao, never()).findSpecimenState("101");
    }

    @Test
    public void emptyBatchDoesNotInventSpecimenTargets() {
        analyses.clear();
        guard.begin(data).run();
        verifyZeroInteractions(dao);
    }

    @Test
    public void noteWithoutAnyVerifiedAnalysisCannotBeWritten() {
        analyses.clear();
        when(data.getNoteList()).thenReturn(List.of(new org.openelisglobal.note.valueholder.Note()));
        denied();
        verifyZeroInteractions(dao);
    }

    @Test
    public void historicalReasonIsNotReinterpretedOrCleared() {
        analysis.getSampleItem().setRejectReasonId("SIM-LEGACY-REASON");
        guard.begin(data).run();
        assertEquals("SIM-LEGACY-REASON", analysis.getSampleItem().getRejectReasonId());
        analysis.getSampleItem().setRejected(true);
        denied();
        assertEquals("SIM-LEGACY-REASON", analysis.getSampleItem().getRejectReasonId());
    }
}
