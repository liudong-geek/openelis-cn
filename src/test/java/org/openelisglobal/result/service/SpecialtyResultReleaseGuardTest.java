package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecialtyOwnerState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.State;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.valueholder.Result;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class SpecialtyResultReleaseGuardTest {

    private OrdinaryResultSaveStateDAO states;
    private IStatusService statuses;
    private ResultSpecimenWriteGuard guard;
    private ResultsUpdateDataSet data;
    private Analysis analysis;
    private Analysis lockedAnalysis;
    private PathologySample pathology;

    @Before
    public void setup() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_SERIALIZABLE);
        states = mock(OrdinaryResultSaveStateDAO.class);
        statuses = mock(IStatusService.class);
        org.openelisglobal.result.action.util.ResultReviewTransitionTest.configure(statuses);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        when(statuses.getStatusID(AnalysisStatus.Finalized)).thenReturn("90");
        guard = new ResultSpecimenWriteGuard(states, statuses);

        analysis = ResultSpecimenWriteGuardTest.tube("101", "201");
        analysis.setStatusId("90");
        // This guard test only needs the persisted release value. Calling the entity
        // setter would also initialize the display-only DateUtil before a Spring test
        // context exists.
        ReflectionTestUtils.setField(analysis, "releasedDate", Timestamp.valueOf("2026-09-25 08:00:00"));
        lockedAnalysis = ResultSpecimenWriteGuardTest.tube("101", "201");
        Result result = new Result();
        result.setAnalysis(analysis);
        ResultSet resultSet = new ResultSet(result, null, null, null, analysis.getSampleItem().getSample(), Map.of(),
                false);
        data = mock(ResultsUpdateDataSet.class);
        when(data.getNewResults()).thenReturn(List.of(resultSet));

        pathology = new PathologySample();
        pathology.setId(51);
        pathology.setSample(analysis.getSampleItem().getSample());
        pathology.setStatus(PathologySample.PathologyStatus.COMPLETED);
        when(states.findPathologyOwnerState(51)).thenReturn(new SpecialtyOwnerState(51, "301", "COMPLETED"));
        when(states.findSpecimenState("101"))
                .thenReturn(new SpecimenState("101", "401", "201", "301", "10", false, false));
        when(states.lockSpecimen("201")).thenReturn(lockedAnalysis.getSampleItem());
        when(states.lockAnalysis("101")).thenReturn(lockedAnalysis);
        when(states.findState("101")).thenReturn(sourceState(), targetState());
        ResultIntakeAdmissionTest.allow(states, "201", "101");
    }

    @After
    public void clearTransaction() {
        TransactionSynchronizationManager.clear();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    public void completedPathologyReleaseTransitionsLockedUnreleasedSourceToFinalizedTarget() {
        assertEquals("1", lockedAnalysis.getStatusId());
        assertNull(lockedAnalysis.getReleasedDate());
        Runnable verify = guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology));
        verify.run();
    }

    @Test
    public void specialtyReleaseRequiresSubmittedFinalizedStatus() {
        analysis.setStatusId("9");
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());
    }

    @Test
    public void specialtyReleaseRequiresSubmittedReleaseTimestamp() {
        ReflectionTestUtils.setField(analysis, "releasedDate", null);
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());
    }

    @Test
    public void specialtyReleaseRequiresFinalizedStateAfterFlush() {
        when(states.findState("101")).thenReturn(sourceState(), sourceState());
        Runnable verify = guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology));
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class, verify::run).getErrorCode());
    }

    @Test
    public void specialtyReleaseRequiresReleaseTimestampAfterFlush() {
        when(states.findState("101")).thenReturn(sourceState(), new State("101", "90", null, null));
        Runnable verify = guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology));
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class, verify::run).getErrorCode());
    }

    @Test
    public void ordinaryEntryStillRejectsTheSameReleasedAnalysis() {
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class, () -> guard.begin(data)).getErrorCode());
    }

    @Test
    public void specialtyReleaseAcceptsOnlyEditableSourceStates() {
        for (AnalysisStatus source : List.of(AnalysisStatus.NotStarted, AnalysisStatus.TechnicalAcceptance,
                AnalysisStatus.BiologistRejected)) {
            lockedAnalysis.setStatusId(statuses.getStatusID(source));
            when(states.findState("101")).thenReturn(sourceState(), targetState());

            Runnable verify = guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology));
            verify.run();
        }
    }

    @Test
    public void specialtyReleaseRejectsCanceledRejectedNonconformingAndTechnicalRejectedSources() {
        for (AnalysisStatus source : List.of(AnalysisStatus.Canceled, AnalysisStatus.SampleRejected,
                AnalysisStatus.NonConforming_depricated, AnalysisStatus.TechnicalRejected)) {
            lockedAnalysis.setStatusId(statuses.getStatusID(source));
            when(states.findState("101")).thenReturn(sourceState());

            assertEquals(OrdinaryResultReviewPolicy.UNAVAILABLE,
                    assertThrows(ResultSaveValidationException.class,
                            () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                            .getErrorCode());
        }
    }

    @Test
    public void specialtyReleaseRejectsFinalizedReleasedOrPrintedSources() {
        lockedAnalysis.setStatusId(statuses.getStatusID(AnalysisStatus.Finalized));
        when(states.findState("101")).thenReturn(sourceState());
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());

        lockedAnalysis.setStatusId(statuses.getStatusID(AnalysisStatus.NotStarted));
        when(states.findState("101"))
                .thenReturn(new State("101", lockedAnalysis.getStatusId(), Timestamp.valueOf("2026-09-25 07:00:00"),
                        null));
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());

        when(states.findState("101")).thenReturn(
                new State("101", lockedAnalysis.getStatusId(), null, Timestamp.valueOf("2026-09-25 07:30:00")));
        assertEquals(OrdinaryResultReviewPolicy.REVIEWED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());
    }

    @Test
    public void specialtyReleaseCannotClaimAnotherSample() {
        when(states.findPathologyOwnerState(51)).thenReturn(new SpecialtyOwnerState(51, "999", "COMPLETED"));
        assertEquals(ResultSpecimenWriteGuard.BLOCKED,
                assertThrows(ResultSaveValidationException.class,
                        () -> guard.beginSpecialtyRelease(data, SpecialtyResultRelease.pathology(pathology)))
                        .getErrorCode());
    }

    private State sourceState() {
        return new State("101", lockedAnalysis.getStatusId(), null, null);
    }

    private State targetState() {
        return new State("101", analysis.getStatusId(), analysis.getReleasedDate(), null);
    }
}
