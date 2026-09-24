package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Transaction-independent policy tests; the delegate owns persistence tests.
 */
public class LegacyResultEntryWriteServiceTest {
    private OrdinaryResultSaveStateDAO states;
    private UserService users;
    private LogbookResultsPersistService persistence;
    private LegacyResultEntryWriteService service;
    private MockHttpServletRequest request;
    private Analysis analysis;

    @Before
    public void setup() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager
                .setCurrentTransactionIsolationLevel(java.sql.Connection.TRANSACTION_SERIALIZABLE);
        states = mock(OrdinaryResultSaveStateDAO.class);
        users = mock(UserService.class);
        persistence = mock(LogbookResultsPersistService.class);
        service = new LegacyResultEntryWriteService(states, users, persistence);

        MockHttpSession session = new MockHttpSession();
        UserSessionData sessionUser = new UserSessionData();
        sessionUser.setSytemUserId(1);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        request = new MockHttpServletRequest();
        request.setSession(session);

        Sample sample = new Sample();
        sample.setId("301");
        sample.setAccessionNumber("S-301");
        SampleItem item = new SampleItem();
        item.setId("201");
        item.setSample(sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setSampleItem(item);
        analysis.setTest(test);

        when(states.findSpecimenState("101")).thenReturn(
                new OrdinaryResultSaveStateDAO.SpecimenState("101", "401", "201", "301", "10", false, false));
        when(states.lockSpecimen("201")).thenReturn(item);
        when(states.lockAnalysis("101")).thenReturn(analysis);
        when(persistence.persistDataSet(org.mockito.ArgumentMatchers.any(), anyList(), eq("1"))).thenReturn(List.of());
    }

    @After
    public void clearTransaction() {
        TransactionSynchronizationManager.clear();
        if (TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    public void authorizedCurrentPagePersistsNormally() {
        ResultsUpdateDataSet data = data("1000");
        when(states.findAnalysisVersion("101")).thenReturn("1000");
        allowTarget();

        assertEquals(List.of(), service.persist(request, data, List.of()));

        verify(persistence).persistDataSet(data, List.of(), "1");
    }

    @Test
    public void analysisOutsideActorsLabUnitIsForbiddenBeforePersistence() {
        ResultsUpdateDataSet data = data("1000");
        when(states.findAnalysisVersion("101")).thenReturn("1000");
        when(users.filterAnalysesByLabUnitRoles(eq("1"), anyList(), eq(Constants.ROLE_RESULTS))).thenReturn(List.of());

        assertThrows(AccessDeniedException.class, () -> service.persist(request, data, List.of()));

        verify(persistence, never()).persistDataSet(org.mockito.ArgumentMatchers.any(), anyList(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    public void secondEditorWithTheFirstEditorsVersionGetsStaleConflict() {
        ResultsUpdateDataSet firstEditor = data("1000");
        ResultsUpdateDataSet secondEditor = data("1000");
        when(states.findAnalysisVersion("101")).thenReturn("1000", "2000");
        allowTarget();

        service.persist(request, firstEditor, List.of());
        ResultSaveValidationException stale = assertThrows(ResultSaveValidationException.class,
                () -> service.persist(request, secondEditor, List.of()));

        assertEquals("error.results.staleSave", stale.getErrorCode());
        verify(persistence).persistDataSet(firstEditor, List.of(), "1");
        verify(persistence, never()).persistDataSet(secondEditor, List.of(), "1");
    }

    private void allowTarget() {
        when(users.filterAnalysesByLabUnitRoles(eq("1"), anyList(), eq(Constants.ROLE_RESULTS)))
                .thenAnswer(call -> call.getArgument(1));
    }

    private ResultsUpdateDataSet data(String version) {
        TestResultItem row = new TestResultItem();
        row.setIsModified(true);
        row.setAnalysisId("101");
        row.setTestId("401");
        row.setSampleItemId("201");
        row.setAccessionNumber("S-301");
        row.setAnalysisLastupdated(version);
        ResultsUpdateDataSet data = mock(ResultsUpdateDataSet.class);
        when(data.getCurrentUserId()).thenReturn("1");
        when(data.getModifiedItems()).thenReturn(List.of(row));
        when(data.getAnalysisOnlyChangeResults()).thenReturn(List.of());
        when(data.getModifiedAnalysis()).thenReturn(List.of(analysis));
        when(data.getNewResults()).thenReturn(List.of());
        when(data.getModifiedResults()).thenReturn(List.of());
        when(data.getDeletableResults()).thenReturn(List.of());
        when(data.getSavableReferralSets()).thenReturn(List.of());
        return data;
    }
}
