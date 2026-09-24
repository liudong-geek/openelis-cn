package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.ResultOwnerState;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.valueholder.Result;

public class ResultPersistenceBoundaryGuardTest {

    private OrdinaryResultSaveStateDAO states;
    private ResultSpecimenWriteGuard guard;
    private ResultsUpdateDataSet data;
    private Analysis analysis;

    @Before
    public void setup() {
        states = mock(OrdinaryResultSaveStateDAO.class);
        guard = new ResultSpecimenWriteGuard(states, mock(IStatusService.class));
        data = mock(ResultsUpdateDataSet.class);
        analysis = ResultSpecimenWriteGuardTest.tube("101", "201");
    }

    @Test
    public void newResultMustNotCarryAnExistingId() {
        Result result = result("801", analysis);
        when(data.getNewResults()).thenReturn(List.of(set(result)));

        assertIdentityMismatch(() -> guard.validateResultIdentities(data));
        verifyZeroInteractions(states);
    }

    @Test
    public void modifiedResultRequiresAnId() {
        Result result = result(null, analysis);
        when(data.getModifiedResults()).thenReturn(List.of(set(result)));

        assertIdentityMismatch(() -> guard.validateResultIdentities(data));
        verifyZeroInteractions(states);
    }

    @Test
    public void modifiedResultCannotMoveToAnotherAnalysisOrPatient() {
        Result result = result("801", analysis);
        when(data.getModifiedResults()).thenReturn(List.of(set(result)));
        when(states.findResultOwnerState("801")).thenReturn(new ResultOwnerState("801", "999", "401", "201", "301"));

        assertIdentityMismatch(() -> guard.validateResultIdentities(data));
    }

    @Test
    public void deletableResultCannotBeSubmittedUnderAnotherTest() {
        Result result = result("801", analysis);
        when(data.getDeletableResults()).thenReturn(List.of(result));
        when(states.findResultOwnerState("801")).thenReturn(new ResultOwnerState("801", "101", "999", "201", "301"));

        assertIdentityMismatch(() -> guard.validateResultIdentities(data));
    }

    @Test
    public void existingResultWithExactPersistedOwnerIsAcceptedOnce() {
        Result result = result("801", analysis);
        when(data.getModifiedResults()).thenReturn(List.of(set(result)));
        when(states.findResultOwnerState("801")).thenReturn(new ResultOwnerState("801", "101", "401", "201", "301"));

        guard.validateResultIdentities(data);
    }

    @Test
    public void sameExistingResultCannotBeModifiedAndDeletedInOneBatch() {
        Result result = result("801", analysis);
        when(data.getModifiedResults()).thenReturn(List.of(set(result)));
        when(data.getDeletableResults()).thenReturn(List.of(result));
        when(states.findResultOwnerState("801")).thenReturn(new ResultOwnerState("801", "101", "401", "201", "301"));

        assertIdentityMismatch(() -> guard.validateResultIdentities(data));
    }

    @Test
    public void insertedResultMustReceiveTheReturnedPersistentId() {
        Result result = result(null, analysis);
        result.setId("802");
        guard.requireInsertedResultIdentity(result, "802");

        assertIdentityMismatch(() -> guard.requireInsertedResultIdentity(result, null));
        assertIdentityMismatch(() -> guard.requireInsertedResultIdentity(result, "803"));
    }

    private Result result(String id, Analysis owner) {
        Result result = new Result();
        result.setId(id);
        result.setAnalysis(owner);
        return result;
    }

    private ResultSet set(Result result) {
        return new ResultSet(result, null, null, null, analysis.getSampleItem().getSample(), Map.of(), false);
    }

    private void assertIdentityMismatch(Runnable action) {
        assertEquals("error.results.analysisMismatch",
                assertThrows(ResultSaveValidationException.class, action::run).getErrorCode());
    }
}
