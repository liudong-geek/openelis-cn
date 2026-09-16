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
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
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
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_SERIALIZABLE);
        dao = mock(OrdinaryResultSaveStateDAO.class);
        statuses = mock(IStatusService.class);
        org.openelisglobal.result.action.util.ResultReviewTransitionTest.configure(statuses);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        guard = new ResultSpecimenWriteGuard(dao, statuses);
        data = mock(ResultsUpdateDataSet.class);
        analysis = tube("101", "201");
        analyses.add(analysis);
        when(data.getModifiedAnalysis()).thenReturn(analyses);
        when(dao.findSpecimenState("101")).thenReturn(state("10", false, false));
        when(dao.lockSpecimen("201")).thenReturn(analysis.getSampleItem());
        when(dao.lockAnalysis("101")).thenReturn(analysis);
        when(dao.findState("101")).thenAnswer(call -> OrdinaryResultReviewPolicy.state(analysis));
        ResultIntakeAdmissionTest.allow(dao, "201", "101");
        ResultIntakeAdmissionTest.allow(dao, "202", "102");
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
    public void persistedReviewedStateCannotBeHiddenByPreparedPendingAnalysis() {
        when(statuses.getStatusID(org.openelisglobal.common.services.StatusService.AnalysisStatus.Finalized)).thenReturn("90");
        when(dao.findState("101")).thenReturn(new OrdinaryResultSaveStateDAO.State("101", "90", null, null));
        assertEquals("error.results.reviewedResultLocked",
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        verify(dao, never()).flush();
    }

    @Test
    public void releasedAndPrintedSourceCannotBeReopenedByAnUnreviewedStatus() {
        var date = java.sql.Timestamp.valueOf("2026-09-14 08:00:00");
        for (var source : List.of(new OrdinaryResultSaveStateDAO.State("101", "1", date, null),
                new OrdinaryResultSaveStateDAO.State("101", "9", null, date))) {
            when(dao.findState("101")).thenReturn(source);
            assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                    assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        }
        verify(dao, never()).flush();
    }

    @Test
    public void rejectedCanceledUnknownOrMissingSourceCannotBeOrdinaryEdited() {
        for (var status : org.openelisglobal.common.services.StatusService.AnalysisStatus.values()) {
            if (status == org.openelisglobal.common.services.StatusService.AnalysisStatus.NotStarted
                    || status == org.openelisglobal.common.services.StatusService.AnalysisStatus.TechnicalAcceptance
                    || status == org.openelisglobal.common.services.StatusService.AnalysisStatus.Finalized
                    || status == org.openelisglobal.common.services.StatusService.AnalysisStatus.BiologistRejected)
                continue;
            String statusId = statuses.getStatusID(status);
            when(dao.findState("101")).thenReturn(new OrdinaryResultSaveStateDAO.State("101", statusId, null, null));
            assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                    assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        }
        when(dao.findState("101")).thenReturn(null);
        assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
    }

    @Test
    public void lateManagedReviewOrPersistedPrintCannotCommit() {
        Runnable recheck = guard.begin(data);
        analysis.setStatusId("90");
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
        analysis.setStatusId("1");
        when(dao.findState("101")).thenReturn(new OrdinaryResultSaveStateDAO.State("101", "1", null,
                java.sql.Timestamp.valueOf("2026-09-14 08:00:00")));
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
    }

    @Test
    public void reviewDictionaryMustBeCompleteUniqueAndStable() {
        Runnable recheck = guard.begin(data);
        var status = org.openelisglobal.common.services.StatusService.AnalysisStatus.Finalized;
        for (String value : new String[] { null, "", "1", "-9", "SIM-STATUS" }) {
            when(statuses.getStatusID(status)).thenReturn(value);
            assertEquals(OrdinaryResultReviewPolicy.CONFIGURATION,
                    assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        }
        when(statuses.getStatusID(status)).thenReturn("91");
        assertEquals(OrdinaryResultReviewPolicy.CONFIGURATION,
                assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
    }

    @Test
    public void onlyExplicitNewRejectionMayReachRejectedOrCanceledTarget() {
        var item = new org.openelisglobal.test.beanItems.TestResultItem();
        item.setAnalysisId("101");
        item.setShadowRejected(true);
        when(data.getModifiedItems()).thenReturn(List.of(item));
        for (var status : List.of(org.openelisglobal.common.services.StatusService.AnalysisStatus.TechnicalRejected,
                org.openelisglobal.common.services.StatusService.AnalysisStatus.Canceled)) {
            analysis.setStatusId(statuses.getStatusID(status));
            when(dao.findState("101")).thenReturn(new OrdinaryResultSaveStateDAO.State("101", "1", null, null));
            Runnable recheck = guard.begin(data);
            when(dao.findState("101")).thenAnswer(call -> OrdinaryResultReviewPolicy.state(analysis));
            recheck.run();
            item.setShadowRejected(false);
            assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                    assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
            assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                    assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
            item.setShadowRejected(true);
        }
    }

    @Test
    public void conflictingComponentRejectionsCannotAuthorizeWholeAnalysisCancellation() {
        var one = new org.openelisglobal.test.beanItems.TestResultItem();
        one.setAnalysisId("101");
        one.setShadowRejected(true);
        var two = new org.openelisglobal.test.beanItems.TestResultItem();
        two.setAnalysisId("101");
        when(data.getModifiedItems()).thenReturn(List.of(one, two));
        assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        verifyZeroInteractions(dao);
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

    @Test
    public void ambiguousStatusConfigurationBlocksBeforeFirstWriteAndWhenItChangesLate() {
        Runnable recheck = guard.begin(data);
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("10");
        assertThrows(ResultSaveValidationException.class, recheck::run);
        assertThrows(ResultSaveValidationException.class, () -> guard.begin(data));
    }

    @Test
    public void weakerOuterTransactionsCannotWrite() {
        for (Integer isolation : new Integer[] { null, java.sql.Connection.TRANSACTION_READ_COMMITTED,
                java.sql.Connection.TRANSACTION_REPEATABLE_READ }) {
            TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(isolation);
            denied();
        }
        verifyZeroInteractions(dao);
    }

    @Test
    public void acceptedManagedObjectCannotHideMissingPersistedDecision() {
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        when(dao.findIntakeState("201")).thenReturn(
                new OrdinaryResultSaveStateDAO.IntakeState(s.tube(), s.patients(), s.requests(), s.tests(), List.of()));
        assertEquals(ResultIntakeAdmission.MISSING,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        verify(dao, never()).flush();
    }

    @Test
    public void lateManagedOrPersistentPatientChangeCannotReuseAcceptance() {
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        var changed = new OrdinaryResultSaveStateDAO.IntakeState(s.tube(), List.of("702"), s.requests(), s.tests(),
                s.decisions());
        Runnable recheck = guard.begin(data);
        when(dao.managedIntakeState("201")).thenReturn(changed);
        assertEquals(ResultIntakeAdmission.CHANGED,
                assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
        when(dao.managedIntakeState("201")).thenReturn(s);
        when(dao.findIntakeState("201")).thenReturn(changed);
        assertEquals(ResultIntakeAdmission.CHANGED,
                assertThrows(ResultSaveValidationException.class, recheck::run).getErrorCode());
    }

    @Test
    public void newReflexAfterWriteDoesNotInvalidateOriginalResult() {
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        Runnable recheck = guard.begin(data);
        var extended = new OrdinaryResultSaveStateDAO.IntakeState(s.tube(), s.patients(), s.requests(),
                List.of(s.tests().get(0), new OrdinaryResultSaveStateDAO.IntakeTest("103", "403", "Y")), s.decisions());
        when(dao.findIntakeState("201")).thenReturn(extended);
        when(dao.managedIntakeState("201")).thenReturn(extended);
        recheck.run();
        verify(dao).flush();
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
        ResultIntakeAdmissionTest.allow(dao, "19", "9");
        analyses.add(second);
        when(dao.lockSpecimen("19")).thenReturn(second.getSampleItem());
        when(dao.lockAnalysis("9")).thenReturn(second);
        when(dao.findState("9")).thenAnswer(call -> OrdinaryResultReviewPolicy.state(second));
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

    @Test
    public void explicitUnreleasedReviewReturnCanBeReenteredButReleaseOrPrintStillLocksIt() {
        String returned = statuses
                .getStatusID(org.openelisglobal.common.services.StatusService.AnalysisStatus.BiologistRejected);
        analysis.setStatusId(returned);
        Runnable check = guard.begin(data);
        analysis.setStatusId(statuses
                .getStatusID(org.openelisglobal.common.services.StatusService.AnalysisStatus.TechnicalAcceptance));
        check.run();
        analysis.setStatusId(returned);
        org.springframework.test.util.ReflectionTestUtils.setField(analysis, "releasedDate",
                java.sql.Timestamp.valueOf("2026-09-14 08:00:00"));
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
        org.springframework.test.util.ReflectionTestUtils.setField(analysis, "releasedDate", null);
        org.springframework.test.util.ReflectionTestUtils.setField(analysis, "printedDate",
                java.sql.Date.valueOf("2026-09-14"));
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
    }
}
