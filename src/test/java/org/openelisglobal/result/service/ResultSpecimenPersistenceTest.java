package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real shared service and Spring advice; effects use isolated SIM memory, not
 * SQL.
 */
public class ResultSpecimenPersistenceTest {
    private Object previousFactory;
    private final List<String> effects = new ArrayList<>();
    private final AtomicReference<SpecimenState> persisted = new AtomicReference<>();
    private ResultsUpdateDataSet data;
    private Analysis analysis;
    private MemoryTransactionManager tx;
    private LogbookResultsPersistService service;
    private Probe target;
    private NoteService notes;
    private IResultUpdate updater;
    private OrdinaryResultSaveStateDAO dao;
    private ResultService results;

    public static class Probe extends LogbookPersistServiceImpl {
        @Override
        protected List<Analysis> setTestReflexes(ResultsUpdateDataSet data, String user) {
            return new ArrayList<>();
        }
    }

    private class MemoryTransactionManager extends AbstractPlatformTransactionManager {
        private List<String> before;
        int commits;
        int rollbacks;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            before = new ArrayList<>(effects);
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            effects.clear();
            effects.addAll(before);
            rollbacks++;
        }
    }

    @Before
    public void setup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        Map<Class<?>, Object> beans = new HashMap<>();
        IStatusService statuses = mock(IStatusService.class);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        beans.put(IStatusService.class, statuses);
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, invocation -> {
            if ("getBean".equals(invocation.getMethod().getName()) && invocation.getArguments().length == 1
                    && invocation.getArgument(0) instanceof Class<?> type) {
                return beans.computeIfAbsent(type, key -> mock(key));
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        analysis = ResultSpecimenWriteGuardTest.tube("101", "201");
        persisted.set(state(false));
        dao = mock(OrdinaryResultSaveStateDAO.class);
        when(dao.findSpecimenState("101")).thenAnswer(invocation -> persisted.get());
        when(dao.lockSpecimen("201")).thenReturn(analysis.getSampleItem());
        when(dao.lockAnalysis("101")).thenReturn(analysis);
        ResultSpecimenWriteGuard guard = new ResultSpecimenWriteGuard(dao, statuses);
        notes = mock(NoteService.class);
        Note note = new Note();
        note.setText("SIM-RESULT-NOTE");
        when(notes.insert(note)).thenAnswer(invocation -> {
            effects.add("SIM-note");
            return "501";
        });
        AnalysisService analyses = mock(AnalysisService.class);
        when(analyses.update(analysis)).thenAnswer(invocation -> {
            effects.add("SIM-analysis");
            return analysis;
        });
        data = mock(ResultsUpdateDataSet.class);
        when(data.getModifiedAnalysis()).thenReturn(new ArrayList<>(List.of(analysis)));
        when(data.getNoteList()).thenReturn(List.of(note));
        target = new Probe();
        ReflectionTestUtils.setField(target, "specimenWriteGuard", guard);
        ReflectionTestUtils.setField(target, "noteService", notes);
        ReflectionTestUtils.setField(target, "analysisService", analyses);
        results = mock(ResultService.class);
        ReflectionTestUtils.setField(target, "resultService", results);
        tx = new MemoryTransactionManager();
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(tx, new AnnotationTransactionAttributeSource()));
        service = (LogbookResultsPersistService) proxy.getProxy();
        updater = mock(IResultUpdate.class);
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    private SpecimenState state(boolean rejected) {
        return new SpecimenState("101", "401", "201", "301", "10", rejected, false);
    }

    @Test
    public void rejectedTubeStopsBeforeFirstNoteOrAnalysisWrite() {
        persisted.set(state(true));
        assertThrows(ResultSaveValidationException.class, () -> service.persistDataSet(data, List.of(updater), "701"));
        assertTrue(effects.isEmpty());
        verifyZeroInteractions(notes, updater);
        assertEquals(1, tx.rollbacks);
    }

    @Test
    public void normalAnalysisOnlyChangeStillCommits() {
        assertTrue(service.persistDataSet(data, List.of(updater), "701").isEmpty());
        assertEquals(List.of("SIM-note", "SIM-analysis"), effects);
        verify(updater).transactionalUpdate(data);
        assertEquals(1, tx.commits);
    }

    @Test
    public void updaterLateRejectionRollsBackEarlierSimEffects() {
        doAnswer(invocation -> {
            persisted.set(state(true));
            return null;
        }).when(updater).transactionalUpdate(data);
        assertThrows(ResultSaveValidationException.class, () -> service.persistDataSet(data, List.of(updater), "701"));
        assertTrue(effects.isEmpty());
        assertEquals(1, tx.rollbacks);
    }

    @Test
    public void unflushedCancellationInsideUpdaterRollsBack() {
        doAnswer(invocation -> {
            analysis.getSampleItem().setStatusId("12");
            return null;
        }).when(updater).transactionalUpdate(data);
        assertThrows(ResultSaveValidationException.class, () -> service.persistDataSet(data, List.of(updater), "701"));
        assertTrue(effects.isEmpty());
        assertEquals(1, tx.rollbacks);
    }

    @Test
    public void actualBeforeCommitCallbackRechecksLateState() {
        // The earlier synchronization changes the SIM resource after the method
        // returns, before the guard's synchronization runs.
        assertThrows(ResultSaveValidationException.class, () -> new TransactionTemplate(tx).execute(status -> {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    persisted.set(state(true));
                }
            });
            target.persistDataSet(data, List.of(updater), "701");
            assertEquals(List.of("SIM-note", "SIM-analysis"), effects);
            return null;
        }));
        assertTrue(effects.isEmpty());
        assertEquals(1, tx.rollbacks);
    }

    @Test
    public void directCallWithoutTransactionCannotWrite() {
        assertThrows(ResultSaveValidationException.class, () -> target.persistDataSet(data, List.of(updater), "701"));
        assertTrue(effects.isEmpty());
        verifyZeroInteractions(notes, updater);
    }

    @Test
    public void secondRejectedTubePreventsAllFirstTubeAndNoteWrites() {
        Analysis second = ResultSpecimenWriteGuardTest.tube("102", "202");
        when(data.getModifiedAnalysis()).thenReturn(List.of(analysis, second));
        when(dao.lockSpecimen("202")).thenReturn(second.getSampleItem());
        when(dao.lockAnalysis("102")).thenReturn(second);
        when(dao.findSpecimenState("102")).thenReturn(new SpecimenState("102", "401", "202", "301", "10", true, false));
        assertThrows(ResultSaveValidationException.class, () -> service.persistDataSet(data, List.of(updater), "701"));
        verifyZeroInteractions(notes, results, updater);
        assertTrue(effects.isEmpty());
    }

    @Test public void existingResultValueUpdateUsesSameGuardWithoutModifiedItems() {
        when(data.getModifiedAnalysis()).thenReturn(List.of());
        var result = new org.openelisglobal.result.valueholder.Result();
        result.setId("801");
        result.setAnalysis(analysis);
        result.setValue("SIM-result-value");
        var set = new org.openelisglobal.result.action.util.ResultSet(result, null, null, null,
                analysis.getSampleItem().getSample(), Map.of(), false);
        when(data.getModifiedResults()).thenReturn(List.of(set));
        when(results.update(result)).thenAnswer(invocation -> { effects.add("SIM-result"); return result; });
        service.persistDataSet(data, List.of(updater), "701");
        verify(results).update(result);
        assertEquals(List.of("SIM-note", "SIM-result"), effects);
        assertEquals(1, tx.commits);
    }

    @Test public void rejectedPureResultSetPreventsResultAndNoteWrites() {
        when(data.getModifiedAnalysis()).thenReturn(List.of());
        var result = new org.openelisglobal.result.valueholder.Result();
        result.setAnalysis(analysis);
        var set = new org.openelisglobal.result.action.util.ResultSet(result, null, null, null,
                analysis.getSampleItem().getSample(), Map.of(), false);
        when(data.getNewResults()).thenReturn(List.of(set));
        persisted.set(state(true));
        assertThrows(ResultSaveValidationException.class, () -> service.persistDataSet(data, List.of(updater), "701"));
        verifyZeroInteractions(notes, results, updater);
        assertTrue(effects.isEmpty());
    }
}
