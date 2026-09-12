package org.openelisglobal.sample.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real entry method and Spring transaction callbacks; SIM memory only, no database.
 */
public class SamplePatientEntrySessionTest {
    private Object oldFactory;
    private Object oldFields;
    private final SamplePatientEntryServiceImpl service = new SamplePatientEntryServiceImpl();
    private SamplePatientUpdateData data;
    private PatientManagementUpdate patientUpdate;
    private PatientManagementInfo patientInfo;
    private SamplePatientEntryForm form;
    private ApplicationEventPublisher events;
    private MockHttpServletRequest request;
    private MockHttpSession session;
    private MemoryTransactionManager manager;
    private TransactionTemplate transaction;

    @Before
    public void setUp() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        data = mock(SamplePatientUpdateData.class);
        patientUpdate = mock(PatientManagementUpdate.class);
        patientInfo = mock(PatientManagementInfo.class);
        form = mock(SamplePatientEntryForm.class);
        events = mock(ApplicationEventPublisher.class);
        ReflectionTestUtils.setField(service, "eventPublisher", events);
        when(data.getAccessionNumber()).thenReturn("SIM-NEW-ORDER");
        when(data.getPatientId()).thenReturn("SIM-NEW-PATIENT");
        when(patientUpdate.getPatientId(form)).thenReturn("SIM-NEW-PATIENT");
        session = new MockHttpSession();
        session.setAttribute("lastAccessionNumber", "SIM-PRIOR-ORDER");
        session.setAttribute("lastPatientId", "SIM-PRIOR-PATIENT");
        request = new MockHttpServletRequest();
        request.setSession(session);
        manager = new MemoryTransactionManager();
        transaction = new TransactionTemplate(manager);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
        TransactionSynchronizationManager.clear();
    }

    @Test
    public void testPersistData_PublishesOnlyAfterCommit() {
        transaction.execute(status -> {
            save();
            assertPriorContext();
            return null;
        });
        assertEquals(1, manager.commits);
        assertEquals("SIM-NEW-ORDER", session.getAttribute("lastAccessionNumber"));
        assertEquals("SIM-NEW-PATIENT", session.getAttribute("lastPatientId"));
    }

    @Test
    public void testPersistData_ExplicitRollbackPreservesPriorContext() {
        transaction.execute(status -> {
            save();
            status.setRollbackOnly();
            return null;
        });
        assertEquals(1, manager.rollbacks);
        assertPriorContext();
    }

    @Test
    public void testPersistData_LaterBatchFailurePreservesPriorContext() {
        assertThrows(IllegalArgumentException.class, () -> transaction.execute(status -> {
            save();
            throw new IllegalArgumentException("SIM later specimen failure");
        }));
        assertEquals(1, manager.rollbacks);
        assertPriorContext();
    }

    @Test
    public void testPersistData_ListenerFailureCannotPublishContext() {
        doAnswer(invocation -> {
            throw new IllegalArgumentException("SIM listener failure");
        }).when(events).publishEvent(any(ApplicationEvent.class));
        assertThrows(IllegalArgumentException.class, () -> transaction.execute(status -> {
            save();
            return null;
        }));
        assertPriorContext();
        assertEquals(1, manager.rollbacks);
    }

    @Test
    public void testPersistData_CommitFailureCannotPublishContext() {
        manager.failCommit = true;
        assertThrows(TransactionSystemException.class, () -> transaction.execute(status -> {
            save();
            return null;
        }));
        assertPriorContext();
    }

    @Test
    public void testPersistData_InnerRequiredWaitsForOuterCommit() {
        transaction.execute(outer -> {
            transaction.execute(inner -> {
                save();
                return null;
            });
            assertPriorContext();
            outer.setRollbackOnly();
            return null;
        });
        assertEquals(0, manager.commits);
        assertPriorContext();
    }

    @Test
    public void testPersistData_InnerRequiredPublishesAfterOuterSuccess() {
        transaction.execute(outer -> {
            transaction.execute(inner -> {
                save();
                return null;
            });
            assertPriorContext();
            return null;
        });
        assertEquals(1, manager.commits);
        assertEquals("SIM-NEW-ORDER", session.getAttribute("lastAccessionNumber"));
        assertEquals("SIM-NEW-PATIENT", session.getAttribute("lastPatientId"));
    }

    @Test
    public void testPersistData_ActualTransactionWithoutSynchronizationDoesNotPublish() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        save();
        assertPriorContext();
    }

    @Test
    public void testPersistData_WithoutTransactionDoesNotClaimCommittedContext() {
        save();
        assertPriorContext();
    }

    @Test
    public void testPersistData_SynchronizationWithoutTransactionDoesNotPublish() {
        TransactionSynchronizationManager.initSynchronization();
        save();
        assertEquals(0, TransactionSynchronizationManager.getSynchronizations().size());
        assertPriorContext();
    }

    @Test
    public void testPersistData_MissingSessionDoesNotCreateOne() {
        request = new MockHttpServletRequest();
        transaction.execute(status -> {
            save();
            return null;
        });
        assertNull(request.getSession(false));
    }

    @Test
    public void testPersistData_ExpiredSessionDoesNotTurnCommitIntoFailureOrCreateReplacement() {
        transaction.execute(status -> {
            save();
            session.invalidate();
            return null;
        });
        assertEquals(1, manager.commits);
        assertNull(request.getSession(false));
    }

    @Test
    public void testPersistData_DoesNotWriteIntoReplacementSession() {
        MockHttpSession replacement = new MockHttpSession();
        transaction.execute(status -> {
            save();
            session.invalidate();
            request.setSession(replacement);
            return null;
        });
        assertNull(replacement.getAttribute("lastAccessionNumber"));
        assertNull(replacement.getAttribute("lastPatientId"));
    }

    @Test
    public void testPersistData_EnvironmentalOrderClearsPriorPatientOnlyAfterCommit() {
        when(data.getPatientId()).thenReturn(null);
        transaction.execute(status -> {
            save();
            assertPriorContext();
            return null;
        });
        assertEquals("SIM-NEW-ORDER", session.getAttribute("lastAccessionNumber"));
        assertNull(session.getAttribute("lastPatientId"));
    }

    @Test
    public void testPersistData_ContextIsSnapshotNotMutableUpdateData() {
        transaction.execute(status -> {
            save();
            when(data.getAccessionNumber()).thenReturn("SIM-CHANGED-ORDER");
            when(data.getPatientId()).thenReturn("SIM-CHANGED-PATIENT");
            return null;
        });
        assertEquals("SIM-NEW-ORDER", session.getAttribute("lastAccessionNumber"));
        assertEquals("SIM-NEW-PATIENT", session.getAttribute("lastPatientId"));
    }

    private void save() {
        service.persistData(data, patientUpdate, patientInfo, form, request);
    }

    private void assertPriorContext() {
        assertEquals("SIM-PRIOR-ORDER", session.getAttribute("lastAccessionNumber"));
        assertEquals("SIM-PRIOR-PATIENT", session.getAttribute("lastPatientId"));
    }

    /**
     * Drives Spring's real commit/rollback synchronization without any persistence
     * resource.
     */
    private static class MemoryTransactionManager extends AbstractPlatformTransactionManager {
        private final State state = new State();
        private int commits;
        private int rollbacks;
        private boolean failCommit;

        @Override
        protected Object doGetTransaction() {
            return state;
        }

        @Override
        protected boolean isExistingTransaction(Object value) {
            return ((State) value).active;
        }

        @Override
        protected void doBegin(Object value, TransactionDefinition definition) {
            ((State) value).active = true;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) {
                throw new TransactionSystemException("SIM commit failure");
            }
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }

        @Override
        protected void doCleanupAfterCompletion(Object value) {
            ((State) value).active = false;
        }

        private static class State {
            private boolean active;
        }
    }
}
